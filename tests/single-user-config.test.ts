import { it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
it('keeps bypass opt-in in its own loopback-only config with the same D1 binding', () => {
 const local = JSON.parse(readFileSync('wrangler.single-user.jsonc','utf8'));
 const remote = JSON.parse(readFileSync('wrangler.remote-preview.jsonc','utf8'));
 expect(local.vars.SINGLE_USER_MODE).toBe('local');
 expect(local.vars.SINGLE_USER_ID).toBeTruthy();
 expect(local.dev).toMatchObject({ip:'127.0.0.1',port:8788,local_protocol:'http'});
 expect(local.d1_databases).toEqual(remote.d1_databases);
 expect(local.alias).toEqual(remote.alias);
 for(const path of ['wrangler.jsonc','wrangler.remote-preview.jsonc','wrangler.production.jsonc']) {
  if (existsSync(path)) expect(readFileSync(path,'utf8')).not.toContain('SINGLE_USER_MODE');
 }
 const launcher = readFileSync('START-LOCAL.cmd','utf8');
 expect(launcher).toContain('set "CI=1"');
 expect(launcher).not.toContain('set "CI="');
 expect(launcher).toContain('--config wrangler.single-user.jsonc');
 expect(launcher).toContain('node scripts\\local-gateway.mjs');
 expect(launcher).not.toContain('wrangler dev --config wrangler.single-user.jsonc');
});
