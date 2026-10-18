// Opt-in real subscription generation and QA-only save/readback. Never personal DB.
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const viaWorker=process.argv.includes('--worker');
const out=viaWorker?'evidence/v2/subscription-worker':'evidence/v2/subscription-sidecar';await mkdir(out,{recursive:true});
await build({entryPoints:['src/generation.ts'],bundle:true,platform:'node',format:'esm',outfile:'.ai-runtime/save-probe-generation.mjs',logLevel:'silent'});
const G=await import(pathToFileURL(path.resolve('.ai-runtime/save-probe-generation.mjs')).href);
const auth=await build({entryPoints:['worker/ai-local.ts'],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {localAiKey}=await import('data:text/javascript;base64,'+Buffer.from(auth.outputFiles[0].text).toString('base64'));
const base='http://localhost:8787';
const headers={'Origin':base,'Content-Type':'application/json'};
const registration=await fetch(base+'/api/register',{method:'POST',headers,body:JSON.stringify({email:'ai-sidecar-'+crypto.randomUUID()+'@example.test',password:'synthetic-AI-QA-proof-passphrase'})});
if(registration.status!==201)throw new Error('QA registration '+registration.status);
const identity=await registration.json();const cookie=registration.headers.get('set-cookie').split(';')[0];
headers.Cookie=cookie;headers['X-Neoform-Account']=identity.id;
const user=await (await fetch(base+'/api/me',{headers})).json();
const account=createHash('sha256').update(user.id).digest('hex');
const internalHeaders={'Authorization':'Bearer '+localAiKey,'X-Neoform-Origin':base,'Content-Type':'application/json'};
const input={goal:'Build muscle',experience:'New',days:2,minutes:45,equipment:['Dumbbell'],emphasis:'Balanced',limitation:'None'};
try {
const snapshot=await (await fetch(base+'/api/data',{headers})).json();
const requestId=crypto.randomUUID();const started=Date.now();
const response=await fetch(viaWorker?base+'/api/ai/generate':'http://127.0.0.1:8790/generate',{method:'POST',headers:viaWorker?{...headers,'X-Neoform-Generation':requestId}:internalHeaders,body:JSON.stringify(viaWorker?input:{input,account,requestId}),signal:AbortSignal.timeout(120000)});
const generated=await response.json();
await writeFile(out+'/generation.json',JSON.stringify({status:response.status,elapsedMs:Date.now()-started,input,...generated},null,2));
if(!response.ok)throw new Error('Real sidecar generation failed '+response.status);
const program=G.validateGenerated(generated.program,input);
const unchanged=await (await fetch(base+'/api/data',{headers})).json();
if(JSON.stringify(snapshot)!==JSON.stringify(unchanged))throw new Error('Preview modified account data.');
const data=G.saveGenerated(snapshot.data,program,true);
const saved=await fetch(base+'/api/data',{method:'PUT',headers,body:JSON.stringify({revision:snapshot.revision,data})});
if(!saved.ok)throw new Error('QA save failed '+saved.status);
const savedResponse=await saved.json();
const readbackResponse=await fetch(base+'/api/data',{headers});const readback=await readbackResponse.json();
if(JSON.stringify(readback.data)!==JSON.stringify(data))throw new Error('QA saved program readback mismatch.');
const result={checkedAt:new Date().toISOString(),generationRoute:viaWorker?'authenticated-worker':'internal-sidecar',generationStatus:response.status,saveStatus:saved.status,readbackStatus:readbackResponse.status,previewUnchanged:true,manualAcceptanceSimulated:true,activationRequested:true,revision:readback.revision,programId:data.programs[0].id,programName:program.name,workouts:program.workouts.length,proof:generated.proof,qaOnly:true,credentialsLogged:false};
await writeFile(out+'/save-readback.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
} finally {
const deleted=await fetch(base+'/api/account',{method:'DELETE',headers,body:JSON.stringify({password:'synthetic-AI-QA-proof-passphrase'})});
console.log('QA proof account cleanup status',deleted.status);
if(deleted.status!==200)throw new Error('QA account cleanup failed.');
}
