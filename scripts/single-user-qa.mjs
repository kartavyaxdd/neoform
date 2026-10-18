// Disposable QA only. Never starts servers or opens personal persistence.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as rawRequest } from 'node:http';
const mode = process.argv[2] || 'verify';
const url = new URL(process.env.SINGLE_USER_QA_URL || 'http://localhost:8790');
assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'QA must be loopback');
assert(url.port && !['8788','8789'].includes(url.port), 'Personal ports are forbidden');
assert.equal(url.pathname, '/');
if (mode === 'prepare') {
  const base = 'http://localhost:8787';
  const response = await fetch(base + '/api/register', {method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:`single-user-qa-${randomUUID()}@example.test`,password:`synthetic-qa-only-${randomUUID()}`})});
  assert.equal(response.status,201);
  const {id} = await response.json();
  assert.equal(typeof id,'string');
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert(cookie, 'Registration must issue a real QA session');
  const readback = await fetch(base+'/api/me',{headers:{Cookie:cookie}});
  assert.equal(readback.status,200);
  assert.equal((await readback.json()).id,id);
  // The account id is not a credential. No cookie/password is persisted or printed.
  console.log(JSON.stringify({id, next:'Start a separate single-user QA backend using --persist-to .qa-state and --var SINGLE_USER_ID:'+id}));
} else {
  async function call(path, method='GET', data, extra={}) {
    // Installed fetch may ignore Host overrides: assert on real wire headers.
    assert.equal(url.protocol,'http:');
    return new Promise((resolve,reject)=>{
      const payload=data===undefined?undefined:JSON.stringify(data);
      const headers={Host:url.host,...(method==='GET'?{}:{Origin:url.origin,'Content-Type':'application/json'}),...(payload?{'Content-Length':Buffer.byteLength(payload)}:{}),...extra};
      const r=rawRequest({hostname:url.hostname,port:url.port,path,method,headers},res=>{
        const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
      });r.on('error',reject);r.end(payload);
    });
  }
  if (mode === 'missing') {
    const r = await call('/api/me'); assert.equal(r.status,503);
    assert.match((await r.json()).error,/account not found|SINGLE_USER_ID/);
    console.log('PASS missing configured account fails closed');
  } else {
    assert.equal(mode,'verify');
    assert(process.env.SINGLE_USER_QA_ID,'Provide SINGLE_USER_QA_ID from prepare');
    const r = await call('/api/me'); assert.equal(r.status,200); assert.equal(r.headers.get('set-cookie'),null);
    const me = await r.json(); assert.equal(me.id,process.env.SINGLE_USER_QA_ID);
    assert.match(me.email,/^single-user-qa-[a-f0-9-]+@example\.test$/,'Refusing any non-disposable account before data access');
    assert.equal(me.accessMode,'single-user-local');
    const bound = {'X-Neoform-Account':me.id};
    const before = await (await call('/api/data','GET',undefined,bound)).json();
    assert.equal(typeof before.revision,'number');
    const data = structuredClone(before.data); data.settings.unit = data.settings.unit==='kg'?'lb':'kg';
    const saved = await call('/api/data','PUT',{revision:before.revision,data},bound); assert.equal(saved.status,200);
    const readback = await (await call('/api/data','GET',undefined,bound)).json();
    assert.deepEqual(readback,{revision:before.revision+1,data});
    assert.equal((await call('/api/data','PUT',{revision:before.revision,data},bound)).status,409);
    assert.equal((await call('/api/data','GET',undefined,{'X-Neoform-Account':'other-qa'})).status,412);
    assert.equal((await call('/api/ai/key','GET',undefined,{'X-Neoform-Account':'other-qa'})).status,412);
    const ai = await call('/api/ai/key','GET',undefined,bound); assert.equal(ai.status,200); assert.deepEqual(await ai.json(),{configured:false});
    for (const path of ['/api/login','/api/register','/api/logout','/api/password','/api/account']) assert.equal((await call(path,path==='/api/account'?'DELETE':'POST',{},bound)).status,403,path);
    for (const headers of [{Origin:'https://evil.example.test'},{Forwarded:'for=127.0.0.1'},{'X-Forwarded-Host':'public.example.test'},{'X-Forwarded-For':'127.0.0.1'},{'CF-Connecting-IP':'127.0.0.1'},{Host:'public.example.test'},{'Sec-Fetch-Site':'cross-site'}]) assert.equal((await call('/api/me','GET',undefined,headers)).status,403,JSON.stringify(headers));
    assert.equal((await call('/api/data','PUT',{revision:readback.revision,data},{Origin:'https://evil.example.test',...bound})).status,403);
    const restored = await call('/api/data','PUT',{revision:readback.revision,data:before.data},bound); assert.equal(restored.status,200);
    assert.deepEqual((await (await call('/api/data','GET',undefined,bound)).json()).data,before.data);
    assert.equal((await (await call('/api/me')).json()).id,me.id);
    const ordinary = await fetch('http://localhost:8787/api/me'); assert.equal(ordinary.status,401);
    console.log('PASS real isolated QA: exact identity, no sessions, write/readback/reload, restore, conflict/account fences, Gemini same-account status, disabled auth endpoints, hostile hosts/proxies/origins, ordinary auth preserved. No upstream AI call.');
  }
}
