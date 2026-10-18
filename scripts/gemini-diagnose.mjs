// Bounded exact-owner provider transport diagnostic; never emits a key.
import {spawnSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2);
const arg=name=>{const n=args.indexOf(name);if(n<0||!args[n+1])throw Error('Missing '+name);return args[n+1];};
const email=arg('--email'),id=arg('--expected-id'),mode=arg('--mode');
if(!['basic-interactions','basic-content','schema-interactions'].includes(mode))throw Error('Unsupported diagnostic');
const row=spawnSync('python',['scripts/gemini-encrypted-record.py','--email',email,'--expected-id',id],{shell:false,encoding:'utf8',windowsHide:true});
if(row.status!==0)throw Error('Exact encrypted account record unavailable');
const stored=JSON.parse(row.stdout);
const vars=await readFile('.dev.vars','utf8');
const master=vars.match(/^GEMINI_KEY_MASTER\s*=\s*['"]?([a-f0-9]{64})['"]?\s*$/m)?.[1];
await mkdir('.ai-runtime',{recursive:true});
await build({entryPoints:['worker/gemini.ts'],bundle:true,platform:'node',format:'esm',outfile:'.ai-runtime/gemini-diagnosis.mjs',logLevel:'silent'});
const G=await import(pathToFileURL(path.resolve('.ai-runtime/gemini-diagnosis.mjs')).href);
let key=await G.decryptAccountKey(stored.encrypted,stored.account,master);
const interactions=mode!=='basic-content';
const url=interactions?'https://generativelanguage.googleapis.com/v1beta/interactions':'https://generativelanguage.googleapis.com/v1beta/models/'+G.GEMINI_MODEL+':generateContent';
const payload=interactions?{model:G.GEMINI_MODEL,input:'Reply with exactly OK.',stream:false,store:false,generation_config:{max_output_tokens:128,thinking_level:'low',thinking_summaries:'none'}}:{contents:[{role:'user',parts:[{text:'Reply with exactly OK.'}]}],generationConfig:{maxOutputTokens:128,thinkingConfig:{thinkingLevel:'low'}}};
if(mode==='schema-interactions'){
 payload.input='Return the JSON object with message OK.';
 payload.response_format={type:'text',mime_type:'application/json',schema:{type:'object',properties:{message:{type:'string'}},required:['message'],additionalProperties:false}};
}
const began=Date.now();
let proof;
try{
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
 const data=await r.json();
 proof={mode,model:G.GEMINI_MODEL,latencyMs:Date.now()-began,status:r.status,providerErrorStatus:data.error?.status,message:String(data.error?.message||'').replaceAll(key,'[redacted]').slice(0,1000),state:data.status,usage:data.usage||data.usageMetadata,stepTypes:data.steps?.map(s=>s.type),finishReasons:data.candidates?.map(c=>c.finishReason)};
}catch(e){proof={mode,model:G.GEMINI_MODEL,latencyMs:Date.now()-began,status:null,errorName:e.name,message:String(e.message).replaceAll(key,'[redacted]')};}
finally{key='';}
await mkdir('evidence/gemini',{recursive:true});
await writeFile('evidence/gemini/diagnostic-'+mode+'.json',JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));
