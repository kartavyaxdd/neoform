import { it, expect, vi } from 'vitest';
import worker from '../worker/index';
import { emptyState } from '../src/domain';
const owner = { id: 'single-user-qa-only', email: 'single@example.test' };
function fixture(extra: Record<string, unknown> = {}) {
  const queries: {sql: string; args: unknown[]}[] = [];
  let data = emptyState(), revision = 0;
  const env = { SINGLE_USER_MODE: 'local', SINGLE_USER_ID: owner.id, DB: {
    prepare(sql: string) { return { bind(...args: unknown[]) {
      queries.push({sql, args});
      return {
        first: async () => {
          if (sql === 'SELECT id,email FROM users WHERE id=?' && args[0] === owner.id) return owner;
          if (sql.startsWith('SELECT revision,body') && args[0] === owner.id) return {revision, body: JSON.stringify(data)};
          return null;
        },
        run: async () => {
          const update = sql.startsWith('UPDATE account_data') && args[2] === owner.id && args[3] === revision;
          if (update) {data = JSON.parse(args[0] as string); revision++;}
          return {meta: {changes: update ? 1 : 0}};
        }
      };
    } }; }
  }, ASSETS: { fetch: vi.fn(async () => new Response('shell')) }, ...extra };
  return { env: env as any, queries };
}
const req = (path = '/api/me', headers: Record<string,string> = {}, host = 'localhost:8790', method = 'GET') => new Request(`http://${host}${path}`, {method, headers});
it('opt-in local mode resolves only its exact existing account without sessions or cookies', async () => {
  const {env, queries} = fixture();
  const r = await worker.fetch(req(), env);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({...owner, storageFormat:2, accessMode: 'single-user-local'});
  expect(r.headers.get('set-cookie')).toBeNull();
  expect(queries).toEqual([{sql: 'SELECT id,email FROM users WHERE id=?', args: [owner.id]}]);
});
it.each([
  ['public host', req('/api/me', {}, 'public.example.test')],
  ['public shell', req('/', {}, 'public.example.test')],
  ['forwarded', req('/api/me', {Forwarded: 'for=127.0.0.1'})],
  ['x forwarded host', req('/api/me', {'X-Forwarded-Host': 'public.example.test'})],
  ['x forwarded for', req('/api/me', {'X-Forwarded-For': '127.0.0.1'})],
  ['cloudflare', req('/api/me', {'CF-Connecting-IP': '127.0.0.1'})],
  ['spoofed host', req('/api/me', {Host: 'public.example.test'})],
  ['cross origin GET', req('/api/me', {Origin: 'http://evil.test'})],
  ['cross-site fetch', req('/api/me', {'Sec-Fetch-Site': 'cross-site'})],
  ['missing write origin', req('/api/data', {}, 'localhost:8790', 'PUT')],
])('local mode fails closed before data access: %s', async (_label, request) => {
  const {env, queries} = fixture();
  const r = await worker.fetch(request, env);
  expect(r.status).toBe(403);
  expect(queries).toEqual([]);
  expect(env.ASSETS.fetch).not.toHaveBeenCalled();
});
it('persists only the selected account through fresh identity/data requests with revision conflicts intact', async () => {
 const {env} = fixture(); const data = emptyState(); data.settings.unit = 'lb';
 const put = () => worker.fetch(new Request('http://localhost:8790/api/data', {method:'PUT',headers:{Origin:'http://localhost:8790','Content-Type':'application/json','X-Neoform-Account':owner.id},body:JSON.stringify({revision:0,data})}), env);
 expect((await put()).status).toBe(200);
 expect(await (await worker.fetch(req('/api/data'),env)).json()).toEqual({revision:1,data});
 expect(await (await worker.fetch(req(),env)).json()).toMatchObject(owner);
 expect((await put()).status).toBe(409);
 expect((await worker.fetch(req('/api/data',{'X-Neoform-Account':'other'}),env)).status).toBe(412);
});
it('Gemini status stays bound to the same exact existing account without reading key material', async () => {
 const {env,queries} = fixture();
 const r = await worker.fetch(req('/api/ai/key'),env);
 expect(r.status).toBe(200); expect(await r.json()).toEqual({configured:false});
 expect(queries).toEqual([
  {sql:'SELECT id,email FROM users WHERE id=?',args:[owner.id]},
  {sql:'SELECT 1 AS configured FROM account_ai_keys WHERE user_id=?',args:[owner.id]}
 ]);
 expect((await worker.fetch(req('/api/ai/key',{'X-Neoform-Account':'other'}),env)).status).toBe(412);
});
it.each(['/api/login', '/api/register', '/api/logout', '/api/password', '/api/account'])('disables credential and destructive endpoint %s without querying credentials', async path => {
  const {env, queries} = fixture();
  const r = await worker.fetch(req(path, {Origin: 'http://localhost:8790'}, 'localhost:8790', path === '/api/account' ? 'DELETE' : 'POST'), env);
  expect(r.status).toBe(403);
  expect(queries).toEqual([]);
  expect(r.headers.get('set-cookie')).toBeNull();
});
it('fails closed with actionable missing ID configuration', async () => {
  const {env, queries} = fixture({SINGLE_USER_ID: undefined});
  const r = await worker.fetch(req(), env);
  expect(r.status).toBe(503);
  const failure = (await r.json()) as {error: string; accessMode: string};
  expect(failure.error).toContain('SINGLE_USER_ID');
  expect(failure.accessMode).toBe('single-user-local');
  expect(queries).toEqual([]);
});
it('missing exact account never falls back or creates one', async () => {
  const {env, queries} = fixture({SINGLE_USER_ID: 'absent'});
  const r = await worker.fetch(req(), env);
  expect(r.status).toBe(503);
  expect(((await r.json()) as {error: string}).error).toContain('account not found');
  expect(queries).toEqual([{sql: 'SELECT id,email FROM users WHERE id=?', args: ['absent']}]);
});
it('database setup failure still identifies local mode for actionable boot recovery', async () => {
 const {env} = fixture({DB:{prepare: () => {throw new Error('synthetic database unavailable');}}});
 const r = await worker.fetch(req(),env);
 expect(r.status).toBe(500);
 expect(await r.json()).toMatchObject({accessMode:'single-user-local', error:'Unable to process request. Please retry.'});
});
it('keeps account mismatch fence', async () => {
  expect((await worker.fetch(req('/api/me', {'X-Neoform-Account': 'other'}), fixture().env)).status).toBe(412);
});
it.each([undefined, '', 'false', 'LOCAL'])('ordinary mode %s still requires real authentication', async mode => {
  expect((await worker.fetch(req(), fixture({SINGLE_USER_MODE: mode}).env)).status).toBe(401);
});
it('trusted pre-runtime gateway permits injected CF metadata only with per-run provenance', async () => {
 const token = 'f'.repeat(64), {env} = fixture({SINGLE_USER_GATEWAY_TOKEN: token});
 const r = await worker.fetch(req('/api/me', {'CF-Connecting-IP':'127.0.0.1','X-Neoform-Local-Gateway':token}),env);
 expect(r.status).toBe(200);
 expect(await r.json()).toMatchObject(owner);
 for (const headers of [{}, {'CF-Connecting-IP':'127.0.0.1'}, {'X-Neoform-Local-Gateway':'bad'}, {'X-Neoform-Local-Gateway':token,Forwarded:'for=127.0.0.1'}] as Record<string,string>[])
   expect((await worker.fetch(req('/api/me',headers),env)).status).toBe(403);
});
it.each(['127.0.0.1:8790', 'localhost:8790', '[::1]:8790'])('allows literal loopback %s', async host => {
  expect((await worker.fetch(req('/api/me', {}, host), fixture().env)).status).toBe(200);
});

