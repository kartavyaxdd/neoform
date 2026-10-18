import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('.ai-runtime',{recursive:true});
await build({entryPoints:['worker/gemini.ts'],bundle:true,platform:'node',format:'esm',outfile:'.ai-runtime/gemini-parent-bundle.mjs',logLevel:'silent'});
const {generateGemini}=await import(pathToFileURL(path.resolve('.ai-runtime/gemini-parent-bundle.mjs')).href);
let input='';for await(const chunk of process.stdin)input+=chunk;
const secret=JSON.parse(input);input='';
try {
 const started=Date.now();
 const result=await generateGemini({key:secret.key,input:{goal:'Build muscle',experience:'New',days:2,minutes:45,equipment:['Dumbbell'],emphasis:'Balanced',limitation:'None'},signal:AbortSignal.timeout(110000),fetcher:async (url,options)=>{
  const response=await fetch(url,options);
  if(!response.ok){
   const diagnostic=await response.clone().json().catch(()=>({}));
   console.log(JSON.stringify({upstreamStatus:response.status,upstreamErrorStatus:diagnostic.error?.status,message:String(diagnostic.error?.message||'').replaceAll(secret.key,'[REDACTED]').slice(0,1200)}));
  }
  return response;
 }});
 const evidence={status:'passed',scope:'One genuine provider-only smoke test. No personal workout data read or changed; no program automatically saved.',checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started,provider:result.proof.provider,model:result.proof.model,inputTokens:result.proof.inputTokens,outputTokens:result.proof.outputTokens,toolCalls:result.proof.toolCalls,validProgram:true,days:result.program.workouts.length};
 await mkdir('evidence/gemini',{recursive:true});
 await writeFile('evidence/gemini/parent-provider-verification.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence));
} catch(error) {
 console.log(JSON.stringify({status:'failed',errorType:error.name,httpStatus:error.status||null,message:String(error.message).replaceAll(secret.key,'[REDACTED]')}));
 process.exitCode=1;
} finally {secret.key='';}
