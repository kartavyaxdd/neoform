// Single opt-in genuine provider call; no personal programs read or written.
import {spawnSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2);const email=args[args.indexOf('--email')+1],id=args[args.indexOf('--expected-id')+1];
if(!args.includes('--email')||!args.includes('--expected-id')||!email||!id)throw new Error('Require exact authorized account email and ID.');
const row=spawnSync('python',['scripts/gemini-encrypted-record.py','--email',email,'--expected-id',id],{shell:false,encoding:'utf8',windowsHide:true});
if(row.status!==0)throw new Error('Exact encrypted account record unavailable.');
const stored=JSON.parse(row.stdout);
const variables=await readFile('.dev.vars','utf8');const master=variables.match(/^GEMINI_KEY_MASTER\s*=\s*['"]?([a-f0-9]{64})['"]?\s*$/m)?.[1];
await build({entryPoints:['worker/gemini.ts'],bundle:true,platform:'node',format:'esm',outfile:'.ai-runtime/gemini-live-proof-bundle.mjs',logLevel:'silent'});
const G=await import(pathToFileURL(path.resolve('.ai-runtime/gemini-live-proof-bundle.mjs')).href);
let key=await G.decryptAccountKey(stored.encrypted,stored.account,master);
const input={goal:'Build muscle',experience:'New',days:2,minutes:45,equipment:['Dumbbell'],emphasis:'Balanced',limitation:'None'};
const calls=[];const diagnostics=[];let usage,version,responseId;
const started=Date.now();await mkdir('evidence/gemini',{recursive:true});
try{
 const generated=await G.generateGemini({key,input,signal:AbortSignal.timeout(110000),fetcher:async(url,options)=>{
  const response=await fetch(url,options);calls.push({kind:String(url).endsWith('/interactions')?'model-interaction':'model-metadata',status:response.status});
  if(!response.ok){const data=await response.clone().json().catch(()=>({}));diagnostics.push({status:response.status,errorStatus:data.error?.status,message:String(data.error?.message||'').replaceAll(key,'[redacted]').slice(0,1200)});}
  if(response.ok&&String(url).endsWith('/interactions')){const data=await response.clone().json();usage=data.usage;version=data.model;responseId=data.id;}
  return response;
 }});
 const proof={status:'passed',checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started,fixture:false,source:'real-gemini-provider',personalProgramsReadOrWritten:false,autoSaved:false,calls,input,...generated,usage,modelVersion:version,responseId};
 await writeFile('evidence/gemini/live-provider-proof.json',JSON.stringify(proof,null,2));
 console.log(JSON.stringify({...proof,program:{name:generated.program.name,workouts:generated.program.workouts.length}}));
}catch(e){
 const proof={status:'failed',checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started,fixture:false,calls,diagnostics,errorStatus:e.status||null,message:String(e.message).replaceAll(key,'[redacted]'),noFallback:true};
 await writeFile('evidence/gemini/live-provider-error.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));process.exitCode=1;
}finally{key='';}
