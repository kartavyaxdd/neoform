import crypto from 'node:crypto';
const base=process.argv[2];
if(!base || !/^https:\/\/neoform-[a-f0-9]{10}\.[a-z0-9-]+\.workers\.dev$/.test(base))throw Error('Exact production URL required');
const results=[];
function assert(ok,label){results.push({label,pass:!!ok});if(!ok)throw Error(label);}
const api=(path,method='GET',body,cookie='')=>fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
const email='cloud-qa-'+crypto.randomUUID()+'@example.test',password=crypto.randomUUID()+crypto.randomUUID();
let cookie='';
try{
 for(const path of ['/api/health','/','/assets/index-B5H8bGb7.js'])assert((await api(path)).status===200,path+'200');
 assert((await api('/api/data')).status===401,'anonymous data401');
 assert((await api('/api/me')).status===401,'anonymous identity401');
 const signup=await api('/api/register','POST',{email,password});assert(signup.status===201,'real cloud registration201');
 const raw=signup.headers.get('set-cookie');assert(raw?.includes('Secure')&&raw.includes('HttpOnly')&&raw.includes('SameSite=Strict'),'secure cookie flags');cookie=raw.split(';')[0];
 const snap=await (await api('/api/data','GET',undefined,cookie)).json();snap.data.settings.unit='lb';
 const put=await api('/api/data','PUT',{revision:snap.revision,data:snap.data},cookie);assert(put.status===200,'D1 save200');
 const read=await (await api('/api/data','GET',undefined,cookie)).json();assert(read.data.settings.unit==='lb'&&read.revision===snap.revision+1,'D1 exact readback');
 const stale=await api('/api/data','PUT',{revision:snap.revision,data:snap.data},cookie);assert(stale.status===409,'stale revision409');
 const foreign=await fetch(base+'/api/data',{method:'PUT',headers:{Origin:'https://evil.example.test','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({revision:read.revision,data:read.data})});assert(foreign.status===403,'foreign Origin403');
 const key=await api('/api/ai/key','GET',undefined,cookie);assert(key.status===200&&(await key.json()).configured===false,'authenticated cloud Gemini key-status route');
 assert((await api('/api/logout','POST',{},cookie)).status===200,'logout200');assert((await api('/api/data','GET',undefined,cookie)).status===401,'old token invalidated401');
 const login=await api('/api/login','POST',{email,password});assert(login.status===200,'real cloud login200');cookie=login.headers.get('set-cookie').split(';')[0];
 const persisted=await (await api('/api/data','GET',undefined,cookie)).json();assert(persisted.data.settings.unit==='lb','cross-session cloud persistence');
 console.log(JSON.stringify({base,results,personalDataCopied:false,freshProviderGenerationTested:false},null,2));
}finally{if(cookie)await api('/api/logout','POST',{},cookie).catch(()=>{});}
