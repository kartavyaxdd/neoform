import { it, expect, vi } from 'vitest';
import worker from '../worker/index';
import { emptyState, MAX_BACKUP } from '../src/domain';
const origin = 'https://public.example.test';
function publicDb() {
  let row: {revision:number; body:string} | null = null;
  const queries: string[] = [];
  const env = {PUBLIC_WORKSPACE:'enabled',DB:{prepare(sql:string) {
    queries.push(sql);
    if (/users|sessions|account_data|account_ai_keys|rate_limits/.test(sql)) throw new Error('Private SQL forbidden');
    return {bind(...args:unknown[]) {return {
      async first() {return row;},
      async run() {
        if(sql.startsWith('INSERT') && !row) {row={revision:0,body:args[0] as string};return {meta:{changes:1}};}
        if(sql.startsWith('UPDATE') && row && row.revision===args[2]) {row={revision:row.revision+1,body:args[0] as string};return {meta:{changes:1}};}
        return {meta:{changes:0}};
      }
    };} };
  }},ASSETS:{fetch:vi.fn()}} as any;
  return {env,queries};
}
it('public persistence initializes its separate singleton and retains revision conflicts',async()=>{
 const {env,queries}=publicDb();
 expect(await (await worker.fetch(req('/api/data'),env)).json()).toEqual({revision:0,data:emptyState()});
 const data=emptyState();data.settings.unit='lb';
 const put=()=>worker.fetch(req('/api/data','PUT',{Origin:origin,'Content-Type':'application/json','X-Neoform-Account':'public-workspace'},JSON.stringify({revision:0,data})),env);
 expect(await (await put()).json()).toEqual({revision:1});
 expect(await (await worker.fetch(req('/api/data'),env)).json()).toEqual({revision:1,data});
 const stale=await put();expect(stale.status).toBe(409);expect(await stale.json()).toMatchObject({revision:1,data});
 expect(queries.every(sql=>sql.includes('public_workspace'))).toBe(true);
});
it.each([
 ['missing Origin',{},JSON.stringify({revision:0,data:emptyState()}),403],
 ['foreign Origin',{Origin:'https://hostile.example'},JSON.stringify({revision:0,data:emptyState()}),403],
 ['wrong identity',{Origin:origin,'Content-Type':'application/json','X-Neoform-Account':'private-qa'},JSON.stringify({revision:0,data:emptyState()}),412],
 ['non-JSON',{Origin:origin,'Content-Type':'text/plain'},'{}',415],
 ['malformed JSON',{Origin:origin,'Content-Type':'application/json'},'{',400],
 ['schema invalid',{Origin:origin,'Content-Type':'application/json'},JSON.stringify({revision:0,data:{}}),400],
 ['negative revision',{Origin:origin,'Content-Type':'application/json'},JSON.stringify({revision:-1,data:emptyState()}),400],
 ['extra field',{Origin:origin,'Content-Type':'application/json'},JSON.stringify({revision:0,data:emptyState(),user_id:'private-qa'}),400],
 ['stream byte overflow',{Origin:origin,'Content-Type':'application/json'},' '.repeat(MAX_BACKUP+1),413],
 ['declared overflow',{Origin:origin,'Content-Type':'application/json','Content-Length':String(MAX_BACKUP+1)},'{}',413],
] as const)('rejects %s before touching persistence',async(_name,headers,payload,status)=>{
 const {env,queries}=publicDb();
 expect((await worker.fetch(req('/api/data','PUT',headers,payload),env)).status).toBe(status);expect(queries).toEqual([]);
});
it('mutually exclusive local/private-account bypass and public mode fail closed',async()=>{
 const {env,queries}=fixture();env.SINGLE_USER_MODE='local';env.SINGLE_USER_ID='private-qa';
 expect((await worker.fetch(req(),env)).status).toBe(503);expect(queries).toEqual([]);
});
function fixture(flag: unknown = 'enabled') {
  const queries: string[] = [];
  const env = { PUBLIC_WORKSPACE: flag, DB: {prepare(sql: string) {queries.push(sql); throw new Error('No private database access permitted');}}, ASSETS: {fetch: vi.fn(async () => new Response('shell'))}} as any;
  return {env, queries};
}
const req = (path = '/api/me', method = 'GET', headers: Record<string,string> = {}, body?: string) => new Request(origin + path, {method, headers, ...(body === undefined ? {} : {body})});
it('explicit public opt-in returns a workspace, not a private user or session, without querying private records', async () => {
  const {env, queries} = fixture();
  const response = await worker.fetch(req(),env);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({id:'public-workspace', kind:'workspace', accessMode:'public-workspace'});
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(queries).toEqual([]);
});
it.each([undefined, '', 'false', 'TRUE', '1', 'true'])('default or invalid public flag %s preserves private authentication',async flag=>{
  const {env}=fixture(flag === undefined ? null : flag);
  expect((await worker.fetch(req(),env)).status).toBe(401);
});
it.each(['/api/register','/api/login','/api/logout','/api/password','/api/account','/api/ai/key','/api/ai/generate'])('public mode blocks private route %s, even with a session cookie',async path=>{
  const {env,queries}=fixture();
  for(const method of ['GET','POST','PUT','DELETE']) {
    const response=await worker.fetch(req(path,method,{Origin:origin,Cookie:'neoform_session='+'a'.repeat(64)}),env);
    expect(response.status).toBe(403);expect(response.headers.get('set-cookie')).toBeNull();
  }
  expect(queries).toEqual([]);
});
