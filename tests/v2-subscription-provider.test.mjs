import {it,expect,vi} from 'vitest';
import {subscriptionGenerate} from '../scripts/subscription-provider.mjs';
it('fails closed before completions if requested model is not subscription',async()=>{
 const fetcher=vi.fn(async()=>Response.json({data:[{id:'openai/gpt-6.1-sol',billing_mode:'api'}]}));
 await expect(subscriptionGenerate({input:{},catalog:[],schema:{},validate:x=>x,fetcher})).rejects.toThrow('subscription');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('uses schema-only inference without tools and rejects returned tool calls',async()=>{
 const fetcher=vi.fn(async(url,options)=>url.endsWith('/models')?Response.json({data:[{id:'openai/gpt-6.1-sol',billing_mode:'subscription'}]}):Response.json({choices:[{message:{content:'{}',tool_calls:[{}]}}]}));
 await expect(subscriptionGenerate({input:{},catalog:[],schema:{},validate:x=>x,fetcher})).rejects.toThrow('tool');
 const body=JSON.parse(fetcher.mock.calls[1][1].body);
 expect(body.tools).toBeUndefined();expect(body.tool_choice).toBe('none');expect(body.stream).toBe(false);
});
it('rejects unknown model or zero/missing usage even for valid JSON',async()=>{
 for(const data of [{model:'other',usage:{prompt_tokens:1,completion_tokens:1}},{model:'openai/gpt-6.1-sol',usage:{prompt_tokens:0,completion_tokens:1}}]){
 const fetcher=vi.fn(async(url)=>url.endsWith('/models')?Response.json({data:[{id:'openai/gpt-6.1-sol',billing_mode:'subscription'}]}):Response.json({...data,choices:[{finish_reason:'stop',message:{content:'{}'}}]}));
 await expect(subscriptionGenerate({input:{},catalog:[],schema:{},validate:x=>x,fetcher})).rejects.toThrow();
 }
});
