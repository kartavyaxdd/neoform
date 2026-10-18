// One explicit bounded alternate-Gemini model qualification, not an app fallback.
import {spawnSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
const args=process.argv.slice(2),email=args[args.indexOf('--email')+1],id=args[args.indexOf('--expected-id')+1];
if(!args.includes('--email')||!args.includes('--expected-id'))throw Error('Exact owner required');
const row=spawnSync('python',['scripts/gemini-encrypted-record.py','--email',email,'--expected-id',id],{shell:false,encoding:'utf8',windowsHide:true});
if(row.status!==0)throw Error('Exact authorized key unavailable');
const stored=JSON.parse(row.stdout), vars=await readFile('.dev.vars','utf8'),master=vars.match(/^GEMINI_KEY_MASTER\s*=\s*['"]?([a-f0-9]{64})['"]?\s*$/m)?.[1];
await build({entryPoints:['worker/gemini.ts'],bundle:true,platform:'node',format:'esm',outfile:'.ai-runtime/lite-key-helper.mjs',logLevel:'silent'});
await build({entryPoints:['src/generation.ts'],bundle:true,platform:'node',format:'esm',outfile:'.ai-runtime/lite-generation-helper.mjs',logLevel:'silent'});
const K=await import(pathToFileURL(path.resolve('.ai-runtime/lite-key-helper.mjs')).href);
const G=await import(pathToFileURL(path.resolve('.ai-runtime/lite-generation-helper.mjs')).href);
let key=await K.decryptAccountKey(stored.encrypted,stored.account,master);
const model='gemini-3.5-flash-lite',input={goal:'Build muscle',experience:'New',days:2,minutes:45,equipment:['Dumbbell'],emphasis:'Balanced',limitation:'None'};
const supported=value=>Array.isArray(value)?value.map(supported):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['$schema','minLength','maxLength'].includes(k)).map(([k,v])=>[k,supported(v)])):value;
const schema=supported(z.toJSONSchema(G.generatedSchema));
const catalog=G.catalogExercises.filter(e=>input.equipment.includes(e.equipment)).map(({id,name,equipment,pattern,muscle})=>({id,name,equipment,pattern,muscle}));
schema.properties.workouts.minItems=input.days;schema.properties.workouts.maxItems=input.days;schema.properties.workouts.items.properties.exercises.items.properties.exerciseId.enum=catalog.map(e=>e.id);
const payload={model,input:JSON.stringify({preferences:input,exercises:catalog}),system_instruction:'Create a conservative editable training program. Exactly the requested number of workouts. Only known exercise IDs and available equipment. No duplicate movements. 1-4 sets, 5-20 reps with max>=min, 2-4 RIR, 45-180 second rest. Maximum min(24,floor(minutes/3)) sets per workout and 90 weekly. Last week deload. No diagnosis or load prescriptions or tools. Names 1-80 characters, description 1-800. JSON only.',stream:false,store:false,background:false,response_format:{type:'text',mime_type:'application/json',schema},generation_config:{max_output_tokens:4096,thinking_level:'low',thinking_summaries:'none'}};
const calls=[],began=Date.now(),signal=AbortSignal.timeout(60000);
try{
 const headers={'Content-Type':'application/json','x-goog-api-key':key};
 const meta=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model,{headers,signal});calls.push({kind:'metadata',status:meta.status});
 if(!meta.ok)throw Error('Selected Gemini Lite model unavailable');
 const m=await meta.json();if(m.name!=='models/'+model||!m.supportedGenerationMethods?.includes('generateContent'))throw Error('Unsupported model metadata');
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers,body:JSON.stringify(payload),signal});calls.push({kind:'real-generation',status:r.status});const data=await r.json();
 if(!r.ok)throw Error(String(data.error?.message||data.message||'HTTP '+r.status).replaceAll(key,'[redacted]'));
 if(data.model!==model||data.status!=='completed'||!Array.isArray(data.steps)||data.steps.some(s=>!['thought','model_output'].includes(s.type))||(data.usage?.total_tool_use_tokens||0)!==0)throw Error('Invalid or tool-bearing response');
 const parts=data.steps.filter(s=>s.type==='model_output').flatMap(s=>s.content||[]);if(!parts.length||parts.some(p=>p.type!=='text'||typeof p.text!=='string'))throw Error('Non-text output');
 const program=G.validateGenerated(JSON.parse(parts.map(p=>p.text).join('')),input);
 if(!(data.usage?.total_input_tokens>0&&data.usage?.total_output_tokens>0))throw Error('Missing genuine usage evidence');
 const proof={status:'passed',fixture:false,provider:'gemini',model,elapsedMs:Date.now()-began,checkedAt:new Date().toISOString(),calls,input,program,usage:data.usage,responseId:data.id,toolCalls:0,autoSaved:false,personalProgramsReadOrWritten:false};
 await mkdir('evidence/gemini',{recursive:true});await writeFile('evidence/gemini/lite-qualification-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,program:{name:program.name,workouts:program.workouts.length}}));
}catch(e){console.log(JSON.stringify({status:'failed',model,fixture:false,elapsedMs:Date.now()-began,calls,message:String(e.message).replaceAll(key,'[redacted]').slice(0,1500)}));process.exitCode=1;}finally{key='';}
