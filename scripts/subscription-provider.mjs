// Fixed loopback inference, no credentials, subprocesses, tools, or fallback.
const base = 'http://127.0.0.1:8791/v1';
const requestedModel = 'openai/gpt-6.1-sol';
async function boundedJson(response, limit) {
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) { await response.body.cancel().catch(()=>{}); throw new Error('Provider output exceeds budget.'); }
    chunks.push(chunk);
  }
  if (!response.ok) throw new Error('Subscription provider HTTP ' + response.status);
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function subscriptionGenerate({input,catalog,schema,validate,signal,fetcher=fetch}) {
  const started = Date.now();
  const models = await boundedJson(await fetcher(base+'/models',{signal}),2097152);
  const model = models.data?.find(x=>x.id===requestedModel);
  if (model?.billing_mode !== 'subscription') throw new Error('Verified subscription model unavailable; no completion requested.');
  const payload = {
    model:requestedModel,stream:false,max_completion_tokens:4096,reasoning_effort:'low',tool_choice:'none',
    response_format:{type:'json_schema',json_schema:{name:'neoform_program',strict:true,schema}},
    messages:[
      {role:'system',content:'Return only a conservative bounded exercise program matching the supplied JSON schema. Use known IDs and available equipment only, exactly the requested number of workouts; max min(24,floor(minutes/3)) sets/session, 90/week, 1-4 sets, 5-20 reps, 2-4 RIR, 45-180s rest. No duplicate movements. Respect overhead, squat and hinge exclusions. No diagnosis, no load prescriptions, no tools. Last week deload.'},
      {role:'user',content:JSON.stringify({preferences:input,exercises:catalog})}
    ]
  };
  const data = await boundedJson(await fetcher(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal}),262144);
  const message = data.choices?.[0]?.message;
  if (message?.tool_calls?.length || message?.function_call) throw new Error('Unexpected provider tool response.');
  if (![requestedModel,'gpt-6.1-sol'].includes(data.model)) throw new Error('Unexpected provider model.');
  if (data.choices?.length !== 1 || data.choices[0].finish_reason !== 'stop') throw new Error('Incomplete provider response.');
  for (const count of [data.usage?.prompt_tokens,data.usage?.completion_tokens])
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid provider usage.');
  if (data.usage?.cost !== undefined && data.usage.cost !== 0) throw new Error('Non-subscription cost evidence rejected.');
  const program = validate(JSON.parse(message.content),input);
  const proof = {model:'gpt-6.1-sol',provider:'nous-subscription-via-hermes-proxy',billingMode:'subscription',inputTokens:data.usage.prompt_tokens,outputTokens:data.usage.completion_tokens,toolCalls:0,toolsProvided:0,agentLoop:false};
  return {program,proof,audit:{checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started,responseId:data.id,requestedModel,returnedModel:data.model,usage:data.usage,httpStatus:200}};
}
