import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {z} from 'zod';
const output='evidence/v2/parent-provider';await mkdir(output,{recursive:true});
await build({entryPoints:['src/generation.ts'],bundle:true,platform:'node',format:'esm',outfile:output+'/generation-probe.mjs',logLevel:'silent'});
const G=await import(pathToFileURL(path.resolve(output+'/generation-probe.mjs')).href);
const models=await (await fetch('http://127.0.0.1:8791/v1/models')).json();
const model=models.data.find(x=>x.id==='openai/gpt-6.1-sol');
if(model?.billing_mode!=='subscription')throw new Error('No verified already-authorized subscription model. No request made.');
const input={goal:'Build muscle',experience:'New',days:2,minutes:45,equipment:['Dumbbell'],emphasis:'Balanced',limitation:'None'};
const catalog=G.catalogExercises.map(({id,name,equipment,pattern,muscle})=>({id,name,equipment,pattern,muscle}));
const payload={
 model:model.id,stream:false,max_completion_tokens:4096,reasoning_effort:'low',tool_choice:'none',
 response_format:{type:'json_schema',json_schema:{name:'neoform_program',strict:true,schema:z.toJSONSchema(G.generatedSchema)}},
 messages:[
  {role:'system',content:'Return only a conservative bounded exercise program matching the supplied JSON schema. Use known IDs and available equipment only, exactly the requested number of workouts; max floor(minutes/3) sets/session, 90/week, 1-4 sets, 5-20 reps, 2-4 RIR, 45-180s rest. No diagnosis, no load prescriptions, no tools. Last week deload.'},
  {role:'user',content:JSON.stringify({preferences:input,exercises:catalog})}
 ]
};
const started=Date.now();const response=await fetch('http://127.0.0.1:8791/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(110000)});
const data=await response.json();
if(!response.ok){await writeFile(output+'/proxy-provider-error.json',JSON.stringify({status:response.status,error:data.error,elapsedMs:Date.now()-started},null,2));throw new Error('Subscription provider HTTP '+response.status);}
const message=data.choices?.[0]?.message;if(message?.tool_calls?.length||message?.function_call)throw new Error('Unexpected provider tool response');
const program=G.validateGenerated(JSON.parse(message.content),input);
const proof={checkedAt:new Date().toISOString(),status:response.status,provider:'nous-subscription-via-hermes-proxy',model:data.model,requestedModel:model.id,billingMode:model.billing_mode,elapsedMs:Date.now()-started,usage:data.usage,toolCalls:0,toolsProvided:0,agentLoop:false,credentialsInspected:false,structuredResponse:true,responseId:data.id,input,program};
await writeFile(output+'/proxy-provider-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,program:{name:program.name,workouts:program.workouts.length}},null,2));
