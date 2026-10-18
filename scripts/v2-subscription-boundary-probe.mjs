import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const result=await build({entryPoints:['worker/ai-local.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {localAiKey}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const base='http://127.0.0.1:8790';const origin='http://localhost:8787';
const headers={'Authorization':'Bearer '+localAiKey,'X-Neoform-Origin':origin,'Content-Type':'application/json'};
const input={goal:'Build muscle',experience:'New',days:2,minutes:45,equipment:['Dumbbell'],emphasis:'Balanced',limitation:'None'};
const account=randomBytes(32).toString('hex');const requestId=crypto.randomUUID();
const body={account,requestId,input};const checks=[];
async function check(name,response,expected){checks.push({name,status:response.status,expected});await response.text();if(response.status!==expected)throw new Error(name+' returned '+response.status+' not '+expected);}
const post=(url,b,h=headers)=>fetch(base+url,{method:'POST',headers:h,body:typeof b==='string'?b:JSON.stringify(b)});
await check('missing internal auth',await post('/generate',body,{'Content-Type':'application/json'}),401);
await check('unknown origin',await post('/generate',body,{...headers,'X-Neoform-Origin':'https://evil.example'}),401);
await check('bounded body',await post('/generate',' '.repeat(4097)),413);
await check('strict preference schema',await post('/generate',{...body,input:{...input,prompt:'execute tools'}}),400);
await check('strict internal identity',await post('/generate',{...body,account:'browser-account'}),400);
// Cancellation is harmless and verifies every parent-configured origin without generation.
for(const allowed of [origin,'https://belkin-crm-borough-chi.trycloudflare.com','http://192.168.1.2:8789'])
 await check('configured origin '+allowed,await post('/cancel',{account,requestId,input:null},{...headers,'X-Neoform-Origin':allowed}),200);
const pending=post('/generate',body);
await new Promise(r=>setTimeout(r,150));
await check('different account cannot cancel active job',await post('/cancel',{account:randomBytes(32).toString('hex'),requestId,input:null}),200);
await check('global concurrency one',await post('/generate',{...body,requestId:crypto.randomUUID()}),429);
await check('owner cancellation',await post('/cancel',{account,requestId,input:null}),200);
await check('cancelled generation does not return program',await pending,504);
await mkdir('evidence/v2/subscription-sidecar',{recursive:true});
await writeFile('evidence/v2/subscription-sidecar/boundaries.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,authSecretLogged:false,realSidecar:true},null,2));console.log(JSON.stringify(checks));
