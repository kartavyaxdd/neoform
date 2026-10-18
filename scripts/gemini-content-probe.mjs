// Differential real-transport probe: normalize actual generateContent output only.
import {spawnSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2), email=args[args.indexOf('--email')+1], id=args[args.indexOf('--expected-id')+1];
if(!args.includes('--email')||!args.includes('--expected-id'))throw Error('Require exact account');
const row=spawnSync('python',['scripts/gemini-encrypted-record.py','--email',email,'--expected-id',id],{shell:false,encoding:'utf8',windowsHide:true});
if(row.status!==0)throw Error('Exact encrypted account unavailable');
const stored=JSON.parse(row.stdout), vars=await readFile('.dev.vars','utf8'), master=vars.match(/^GEMINI_KEY_MASTER\s*=\s*['"]?([a-f0-9]{64})['"]?\s*$/m)?.[1];
await build({entryPoints:['worker/gemini.ts'],bundle:true,platform:'node',format:'esm',outfile:'.ai-runtime/gemini-transport-probe.mjs',logLevel:'silent'});
const G=await import(pathToFileURL(path.resolve('.ai-runtime/gemini-transport-probe.mjs')).href);
let key=await G.decryptAccountKey(stored.encrypted,stored.account,master);
const input={goal:'Build muscle',experience:'New',days:2,minutes:45,equipment:['Dumbbell'],emphasis:'Balanced',limitation:'None'};
const started=Date.now(), calls=[];let providerUsage,providerVersion,responseId;
try{
 const result=await G.generateGemini({key,input,signal:AbortSignal.timeout(60000),fetcher:async(url,options)=>{
  if(String(url).endsWith('/interactions')){
   const old=JSON.parse(options.body);
   if(args.includes('--plain-interactions')){
    const schema=old.response_format.schema;
    delete old.response_format;
    old.system_instruction+=' Output JSON only, no markdown or surrounding text. Required output schema: '+JSON.stringify(schema);
    const r=await fetch(url,{...options,body:JSON.stringify(old)});
    calls.push({kind:'real-interactions-prompt-json',status:r.status});
    if(r.ok){const d=await r.clone().json();providerUsage=d.usage;providerVersion=d.model;responseId=d.id;}
    else{const d=await r.clone().json().catch(()=>({}));console.log(JSON.stringify({upstreamStatus:r.status,message:String(d.error?.message||'').replaceAll(key,'[redacted]').slice(0,1200)}));}
    return r;
   }
   const payload={systemInstruction:{parts:[{text:old.system_instruction}]},contents:[{role:'user',parts:[{text:old.input}]}],generationConfig:{candidateCount:1,maxOutputTokens:old.generation_config.max_output_tokens,thinkingConfig:{thinkingLevel:old.generation_config.thinking_level},responseFormat:{text:{mimeType:'APPLICATION_JSON',schema:old.response_format.schema}}}};
   const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+G.GEMINI_MODEL+':generateContent',{...options,body:JSON.stringify(payload)});
   calls.push({kind:'real-generateContent',status:r.status});
   if(!r.ok){const d=await r.clone().json().catch(()=>({}));console.log(JSON.stringify({upstreamStatus:r.status,message:String(d.error?.message||'').replaceAll(key,'[redacted]').slice(0,1200)}));return r;}
   const d=await r.json();providerUsage=d.usageMetadata;providerVersion=d.modelVersion;responseId=d.responseId;
   if(d.candidates?.length!==1||d.candidates[0].finishReason!=='STOP'||!d.candidates[0].content?.parts?.length||d.candidates[0].content.parts.some(p=>typeof p.text!=='string'||p.functionCall||p.executableCode||p.codeExecutionResult))throw Error('Actual provider response incomplete or unsupported');
   if(providerVersion!==G.GEMINI_MODEL)throw Error('Unexpected actual provider model version');
   // Explicit adapter for existing validation: all fields originate in actual Google response.
   return Response.json({model:d.modelVersion,status:'completed',steps:[{type:'model_output',content:d.candidates[0].content.parts.filter(p=>!p.thought).map(p=>({type:'text',text:p.text}))}],usage:{total_input_tokens:d.usageMetadata.promptTokenCount,total_output_tokens:d.usageMetadata.candidatesTokenCount,total_tool_use_tokens:0}});
  }
  const r=await fetch(url,options);calls.push({kind:'model-metadata',status:r.status});return r;
 }});
 const proof={status:'passed',fixture:false,protocol:args.includes('--plain-interactions')?'interactions-prompt-json':'generateContent',diagnosticAdapter:!args.includes('--plain-interactions'),checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started,calls,input,...result,providerUsage,providerVersion,responseId,personalProgramsReadOrWritten:false,autoSaved:false};
 await mkdir('evidence/gemini',{recursive:true});await writeFile('evidence/gemini/content-transport-proof.json',JSON.stringify(proof,null,2));
 console.log(JSON.stringify({...proof,program:{name:result.program.name,workouts:result.program.workouts.length}}));
}catch(e){console.log(JSON.stringify({status:'failed',protocol:'generateContent',fixture:false,elapsedMs:Date.now()-started,calls,errorStatus:e.status||null,message:String(e.message).replaceAll(key,'[redacted]')}));process.exitCode=1;}finally{key='';}
