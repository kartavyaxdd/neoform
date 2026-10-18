import {createServer} from 'node:http';
import {mkdir,writeFile,readFile,appendFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {z} from 'zod';
import {equalAuthorization} from './sidecar-auth.mjs';
import {subscriptionGenerate} from './subscription-provider.mjs';
import {createDailyBudget} from './subscription-budget.mjs';
const root = path.resolve('.ai-runtime');
const keyModule = path.resolve('worker/ai-local.ts');
await mkdir(root,{recursive:true});
const budget=await createDailyBudget({file:path.join(root,'subscription-daily-budget.json'),limit:Number(process.env.NEOFORM_AI_DAILY_LIMIT || 10)});
await build({entryPoints:['src/generation.ts'],bundle:true,platform:'node',format:'esm',outfile:path.join(root,'subscription-generation.mjs'),logLevel:'silent'});
const G = await import(pathToFileURL(path.join(root,'subscription-generation.mjs')).href);
const schema = z.toJSONSchema(G.generatedSchema);
const catalog = G.catalogExercises.map(({id,name,equipment,pattern,muscle})=>({id,name,equipment,pattern,muscle}));
// No network origin is inferred from a request. Parent may supply exact origins
// in this non-secret host config; Worker already enforces authenticated same-origin.
const initialOrigin = process.argv[2] || 'http://localhost:8787';
function validOrigin(value) {
  if (typeof value !== 'string') return false;
  try { const url=new URL(value); return url.origin===value && !url.username && !url.password &&
    (url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1','192.168.1.2'].includes(url.hostname))); } catch {return false;}
}
if (!validOrigin(initialOrigin)) throw new Error('Require an exact HTTPS or loopback HTTP Worker origin.');
async function approvedOrigin(origin) {
  let allowed=[initialOrigin];
  try {
    const file=await readFile(path.join(root,'allowed-origins.json'),'utf8');
    if (Buffer.byteLength(file)>4096) return false;
    const parsed=z.object({origins:z.array(z.string()).min(1).max(16)}).strict().parse(JSON.parse(file));
    if (!parsed.origins.every(validOrigin)) return false;
    allowed=[...allowed,...parsed.origins];
  } catch(e) { if(e.code!=='ENOENT') return false; }
  return allowed.includes(origin);
}
const internal=z.object({account:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.string().uuid(),input:z.unknown()}).strict();
const key=randomBytes(32).toString('hex'),jobs=new Map(),rates=new Map();
let stopping=false;
const send=(res,status,data)=>{if(!res.writableEnded&&!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}};
const server=createServer(async(req,res)=>{
  try {
    if(!equalAuthorization(req.headers.authorization||'','Bearer '+key) || !await approvedOrigin(req.headers['x-neoform-origin'])) return send(res,401,{error:'Internal authorization required.'});
    if(req.method!=='POST'||!['/generate','/cancel'].includes(req.url)) return send(res,404,{error:'Route not found.'});
    let bytes=0;const chunks=[];
    for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)return send(res,413,{error:'Request too large.'});chunks.push(chunk);}
    const value=internal.parse(JSON.parse(Buffer.concat(chunks).toString()));
    if(req.url==='/cancel') {
      if(value.input!==null) return send(res,400,{error:'Invalid cancel input.'});
      const job=jobs.get(value.requestId);if(job?.account===value.account) job.controller.abort();
      return send(res,200,{ok:true});
    }
    const input=G.generationInput.parse(value.input);
    if(stopping) return send(res,503,{error:'Sidecar shutting down.'});
    if(jobs.size>=1) return send(res,429,{error:'Generator busy.'});
    const now=Date.now();let rate=rates.get(value.account);
    if(!rate||now-rate.at>900000) rate={at:now,count:0};
    if(rate.count>=3)return send(res,429,{error:'Rate limit.'});
    if(rates.size>=10000){for(const [id,r]of rates)if(now-r.at>900000)rates.delete(id);if(rates.size>=10000&&!rates.has(value.account))return send(res,429,{error:'Rate capacity.'});}
    rate.count++;rates.set(value.account,rate);
    const controller=new AbortController();jobs.set(value.requestId,{account:value.account,controller});
    const timeout=setTimeout(()=>controller.abort(),110000);
    const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);
    try {
      // Count attempts before any provider call, including later failure/cancel;
      // persisted global budget prevents new accounts/restarts bypassing quota.
      if(!await budget.reserve())return send(res,429,{error:'Daily generation allowance reached.'});
      const {program,proof,audit}=await subscriptionGenerate({input,catalog,schema,validate:G.validateGenerated,signal:controller.signal});
      if(controller.signal.aborted)throw new Error('Generation cancelled.');
      await appendFile(path.join(root,'subscription-provider-proof.jsonl'),JSON.stringify({...proof,...audit,requestId:value.requestId})+'\n');
      send(res,200,{program,proof});
    } catch(e) {
      // No upstream response bodies, prompts, account identities or credentials logged.
      await appendFile(path.join(root,'subscription-errors.jsonl'),JSON.stringify({requestId:value.requestId,aborted:controller.signal.aborted,error:e.message.replace(/https?:\/\/\S+/g,'[provider URL]').slice(0,200)})+'\n');
      send(res,controller.signal.aborted?504:503,{error:'Generation unavailable.'});
    } finally {clearTimeout(timeout);jobs.delete(value.requestId);res.removeListener('close',disconnect);}
  } catch {send(res,400,{error:'Malformed bounded request.'});}
});
server.headersTimeout=10000;server.requestTimeout=120000;server.maxConnections=32;
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8790,'127.0.0.1',resolve);});
await writeFile(keyModule,"// Host-only ephemeral internal authorization. Never client-bundled.\nexport const localAiKey = '"+key+"';\n");
await appendFile(path.join(root,'processes.jsonl'),JSON.stringify({pid:process.pid,kind:'subscription-sidecar',command:['node','scripts/ai-subscription-sidecar.mjs',initialOrigin,'--persistent'],started:new Date().toISOString()})+'\n');
console.log('NEOFORM subscription-only sidecar PID '+process.pid+' on 127.0.0.1:8790; proxy 127.0.0.1:8791. Internal key never printed.');
async function stop(){if(stopping)return;stopping=true;for(const job of jobs.values())job.controller.abort();await writeFile(keyModule,"// Sidecar stopped.\nexport const localAiKey = '';\n");server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
if(!process.argv.includes('--persistent'))setTimeout(stop,900000).unref();
