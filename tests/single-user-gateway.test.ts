import { it, expect } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';

it('local pre-runtime gateway permits direct traffic and rejects raw hostile headers before forwarding', async () => {
  const modulePath = '../scripts/local-gateway.mjs';
  const mod = await import(modulePath).catch(() => ({}));
  expect(typeof mod.createLocalGateway).toBe('function');
  const token = 'a'.repeat(64);
  let forwarded = 0;
  const upstream = http.createServer((req,res) => {
    forwarded++;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({trusted:req.headers['x-neoform-local-gateway']===token,origin:req.headers.origin,path:req.url}));
  });
  upstream.listen(0,'127.0.0.1'); await once(upstream,'listening');
  const internalPort = (upstream.address() as any).port;
  const gateway = mod.createLocalGateway({port:0,upstreamPort:internalPort,token});
  gateway.listen(0,'127.0.0.1'); await once(gateway,'listening');
  const port = (gateway.address() as any).port;
  const raw = (headers:Record<string,string>={},method='GET',path='/api/me') => new Promise<any>((resolve,reject) => {
    const r = http.request({hostname:'127.0.0.1',port,path,method,headers:{Host:`127.0.0.1:${port}`,...headers}},res=>{
      let text=''; res.on('data',x=>text+=x); res.on('end',()=>resolve({status:res.statusCode,text}));
    }); r.on('error',reject);r.end();
  });
  try {
    const direct=await raw(); expect(direct.status).toBe(200); expect(JSON.parse(direct.text).trusted).toBe(true);
    const own=await raw({Origin:`http://127.0.0.1:${port}`},'POST','/api/data');
    expect(own.status).toBe(200); expect(JSON.parse(own.text).origin).toBe(`http://127.0.0.1:${internalPort}`);
    const baseline=forwarded;
    for (const headers of [{Host:'public.example.test'},{Origin:'https://evil.example.test'},{Forwarded:'for=127.0.0.1'},{'X-Forwarded-Host':'public.test'},{'CF-Connecting-IP':'127.0.0.1'},{'CF-Ray':'spoof'},{'X-Neoform-Local-Gateway':token},{'Sec-Fetch-Site':'cross-site'}] as Record<string,string>[])
      expect((await raw(headers)).status).toBe(403);
    expect((await raw({},'POST','/api/data')).status).toBe(403);
    expect((await raw({},'GET','/__internal')).status).toBe(403);
    expect(forwarded).toBe(baseline);
  } finally {gateway.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise<void>(r=>gateway.close(()=>r())),new Promise<void>(r=>upstream.close(()=>r()))]);}
});
