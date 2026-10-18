// Local-only single-user transport. Validate raw client headers BEFORE Wrangler
// injects CF metadata. The Worker requires per-run provenance from this listener.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const loopback = ip => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
const deniedHeader = name => name==='forwarded' || name.startsWith('x-forwarded-') ||
  name.startsWith('cf-') || name==='x-real-ip' || name==='true-client-ip' ||
  name.startsWith('x-neoform-local-') || name.startsWith('mf-') || name.startsWith('miniflare-');

export function createLocalGateway({upstreamPort,token}) {
  if (!Number.isInteger(upstreamPort) || upstreamPort<1 || upstreamPort>65535 || !/^[a-f0-9]{64}$/.test(token))
    throw new Error('Invalid private local gateway configuration');
  const upstreamOrigin=`http://127.0.0.1:${upstreamPort}`;
  const deny=res=>{res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({error:'Single-user mode is available directly on this PC only. Proxies and cross-origin requests are blocked.'}));};
  const server=http.createServer((req,res)=>{
    const port=req.socket.localPort;
    const allowedHosts=[`127.0.0.1:${port}`,`localhost:${port}`];
    const host=req.headers.host;
    const method=req.method || 'GET';
    const raw=req.rawHeaders.filter((_,i)=>i%2===0).map(x=>x.toLowerCase());
    let path;
    try {path=new URL(req.url,`http://${host}`).pathname;} catch {return deny(res);}
    if (!loopback(req.socket.remoteAddress) || raw.filter(x=>x==='host').length!==1 ||
        !allowedHosts.includes(host) || raw.some(deniedHeader) ||
        !req.url?.startsWith('/') || req.url.startsWith('//') ||
        path.startsWith('/__') || path.startsWith('/cdn-cgi/') ||
        (req.headers.origin!==undefined && req.headers.origin!==`http://${host}`) ||
        (req.headers['sec-fetch-site']!==undefined && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) ||
        (!['GET','HEAD'].includes(method) && req.headers.origin!==`http://${host}`)) return deny(res);
    const headers={...req.headers,host:`127.0.0.1:${upstreamPort}`,'x-neoform-local-gateway':token};
    delete headers.connection;delete headers.upgrade;delete headers['proxy-connection'];
    if(headers.origin) headers.origin=upstreamOrigin;
    const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method,headers,timeout:180000},reply=>{
      const outgoing={...reply.headers};
      delete outgoing['x-neoform-local-gateway'];
      res.writeHead(reply.statusCode || 502,outgoing);reply.pipe(res);
    });
    upstream.on('timeout',()=>upstream.destroy());
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Local training backend unavailable. Restart START-LOCAL.cmd.'}));});
    req.on('aborted',()=>upstream.destroy());
    res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});
    req.pipe(upstream);
  });
  server.on('upgrade',(_req,socket)=>socket.destroy());
  return server;
}

async function main(){
  const qa=process.env.NEOFORM_LOCAL_QA==='1';
  const port=Number(process.env.NEOFORM_LOCAL_PORT || (qa?8790:8788));
  const upstreamPort=Number(process.env.NEOFORM_LOCAL_BACKEND_PORT || (qa?8796:8797));
  const inspectorPort=Number(process.env.NEOFORM_LOCAL_INSPECTOR_PORT || (qa?9233:9231));
  if (![port,upstreamPort,inspectorPort].every(p=>Number.isInteger(p)&&p>1024&&p<65536) || new Set([port,upstreamPort,inspectorPort]).size!==3)
    throw new Error('Invalid local listener ports');
  if(qa && [8788,8789].some(p=>[port,upstreamPort,inspectorPort].includes(p)))throw new Error('QA must not use personal ports');
  if(!qa && process.env.NEOFORM_SINGLE_USER_ID)throw new Error('Account override is permitted only in disposable QA mode');
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const token=randomBytes(32).toString('hex');
  const args=[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--config','wrangler.single-user.jsonc','--local','--ip','127.0.0.1','--port',String(upstreamPort),'--inspector-port',String(inspectorPort),'--persist-to',qa?'.qa-state':'.local-state','--show-interactive-dev-session=false','--var',`SINGLE_USER_GATEWAY_TOKEN:${token}`];
  if(qa && process.env.NEOFORM_SINGLE_USER_ID)args.push('--var',`SINGLE_USER_ID:${process.env.NEOFORM_SINGLE_USER_ID}`);
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,CI:'1',WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  // Never forward the generated internal token or partial line fragments to logs.
  for(const stream of [child.stdout,child.stderr]){
    let buffer='';stream.setEncoding('utf8');stream.on('data',chunk=>{
      buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();
      for(const line of lines)process.stdout.write(line.split(token).join('[internal token redacted]')+'\n');
    });
  }
  let exited=false;let gateway;
  const shutdown=()=>{gateway?.closeAllConnections();gateway?.close();child.kill();};
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
  child.on('exit',code=>{exited=true;gateway?.closeAllConnections();gateway?.close();process.exitCode=code||0;});
  child.on('error',()=>{exited=true;console.error('Local backend could not start');process.exitCode=1;});
  let ready=false;
  for(let i=0;i<120&&!exited;i++){
    try{const r=await fetch(`http://127.0.0.1:${upstreamPort}/api/health`,{headers:{'X-Neoform-Local-Gateway':token},signal:AbortSignal.timeout(1500)});ready=r.status===200;await r.body?.cancel();if(ready)break;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!ready){shutdown();throw new Error('Local backend did not become ready; no public listener was opened');}
  gateway=createLocalGateway({upstreamPort,token});
  gateway.on('error',()=>{console.error('Local app port unavailable');shutdown();process.exitCode=1;});
  gateway.listen(port,'127.0.0.1',()=>console.log(`NEOFORM SINGLE-USER READY: http://127.0.0.1:${port} (${qa?'disposable QA':'existing personal account'}, this PC only)`));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
