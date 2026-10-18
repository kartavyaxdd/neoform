import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {emptyState} from '../src/domain';
import {encryptAccountKey} from '../worker/gemini';
const url=process.env.NEOFORM_PUBLIC_WORKSPACE_QA_URL;
const sql=(value:string)=>"'"+value.replaceAll("'","''")+"'";
// Exact isolated config/persistence: never use the project's personal database.
function d1(command:string) {
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','neoform-public-workspace-qa','--local','--config','.qa-state/public-workspace.jsonc','--persist-to','.qa-state/public-workspace','--command',command,'--json'],{encoding:'utf8',timeout:60000});
 if(result.status!==0)throw new Error('Synthetic public-workspace QA D1 operation failed (no credential output).');
 return JSON.parse(result.stdout);
}
it.skipIf(!url)('real D1 public writes never expose or modify synthetic private account, session, state or encrypted key',async()=>{
 const origin=new URL(url!);expect(origin.hostname).toBe('127.0.0.1');expect(origin.port).toBe('8786');
 const id='public-isolation-qa-'+crypto.randomUUID(),token=randomBytes(32).toString('hex'),tokenHash=createHash('sha256').update(token).digest('hex');
 const ciphertext=JSON.stringify(await encryptAccountKey('SYNTHETIC-NOT-A-PROVIDER-KEY-'+crypto.randomUUID(),id,randomBytes(32).toString('hex')));
 const data=emptyState();data.profile={name:id,experience:'New',goal:'Build muscle',equipment:['Dumbbell'],days:3};const body=JSON.stringify(data);
 d1(`INSERT INTO users(id,email,password_hash,salt,created_at) VALUES (${sql(id)},${sql(id+'@example.test')},'synthetic-unused-hash','synthetic-unused-salt',1); INSERT INTO account_data(user_id,revision,body,updated_at) VALUES (${sql(id)},17,${sql(body)},1); INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (${sql(tokenHash)},${sql(id)},${Date.now()+600000}); INSERT INTO account_ai_keys(user_id,encrypted,updated_at) VALUES (${sql(id)},${sql(ciphertext)},1);`);
 const request=(path:string,method='GET',payload?:unknown)=>fetch(origin.origin+path,{method,headers:{Origin:origin.origin,'Content-Type':'application/json',Cookie:'neoform_session='+token},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 let before:any;
 try {
  const me=await request('/api/me');expect(await me.json()).toEqual({id:'public-workspace',kind:'workspace',accessMode:'public-workspace'});expect(me.headers.get('set-cookie')).toBeNull();
  before=await (await request('/api/data')).json();expect(JSON.stringify(before)).not.toContain(id);expect(JSON.stringify(before)).not.toContain(ciphertext);
  const shared=emptyState();shared.settings.unit='lb';expect((await request('/api/data','PUT',{revision:before.revision,data:shared})).status).toBe(200);
  expect((await (await request('/api/data')).json() as any).data).toEqual(shared);
  for(const [path,method] of [['/api/account','DELETE'],['/api/password','POST'],['/api/ai/key','GET'],['/api/ai/key','PUT'],['/api/ai/key','DELETE'],['/api/ai/generate','POST'],['/api/logout','POST']])expect((await request(path,method)).status).toBe(403);
  const check=d1(`SELECT (SELECT COUNT(*) FROM users WHERE id=${sql(id)} AND email=${sql(id+'@example.test')} AND password_hash='synthetic-unused-hash' AND salt='synthetic-unused-salt') AS account_unchanged,(SELECT COUNT(*) FROM account_data WHERE user_id=${sql(id)} AND revision=17 AND body=${sql(body)}) AS private_data_unchanged,(SELECT COUNT(*) FROM sessions WHERE user_id=${sql(id)} AND token_hash=${sql(tokenHash)}) AS session_unchanged,(SELECT COUNT(*) FROM account_ai_keys WHERE user_id=${sql(id)} AND encrypted=${sql(ciphertext)} AND updated_at=1) AS encrypted_key_unchanged;`);
  expect(check[0].results[0]).toEqual({account_unchanged:1,private_data_unchanged:1,session_unchanged:1,encrypted_key_unchanged:1});
 }finally {
  if(before){const current=await (await request('/api/data')).json() as any;expect((await request('/api/data','PUT',{revision:current.revision,data:before.data})).status).toBe(200);expect((await (await request('/api/data')).json() as any).data).toEqual(before.data);}
  d1(`DELETE FROM users WHERE id=${sql(id)};`);
  const removed=d1(`SELECT (SELECT COUNT(*) FROM users WHERE id=${sql(id)})+(SELECT COUNT(*) FROM account_data WHERE user_id=${sql(id)})+(SELECT COUNT(*) FROM sessions WHERE user_id=${sql(id)})+(SELECT COUNT(*) FROM account_ai_keys WHERE user_id=${sql(id)}) AS remaining;`);
  expect(removed[0].results[0].remaining).toBe(0);
 }
},120000);
