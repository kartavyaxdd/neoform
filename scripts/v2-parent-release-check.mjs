import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
const base='http://192.168.1.2:8789';
await mkdir('evidence/v2',{recursive:true});
const health=await fetch(base+'/api/health');
const shell=await fetch(base+'/'); const html=await shell.text();
const refs=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(x=>x[1]);
const assets=[];
for(const url of refs){const r=await fetch(base+url);const text=await r.text();assets.push({url,status:r.status,bytes:Buffer.byteLength(text),hasInternalAuthModule:text.includes('localAiKey'),hasBearerCredential:/Bearer\s+[a-f0-9]{64}/.test(text)});}
const ai=await fetch(base+'/api/ai/generate',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
const internal=await fetch('http://127.0.0.1:8790/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>({status:r.status})).catch(e=>({error:e.message}));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let ui;
try{const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});await page.goto(base);await page.getByRole('button',{name:'Create account',exact:true}).waitFor();await page.screenshot({path:'evidence/v2/lan-anonymous-390.png'});ui={title:await page.title(),errors,consoleErrors,...await page.evaluate(()=>({secureContext:isSecureContext,uuid:typeof crypto.randomUUID,randomBytes:typeof crypto.getRandomValues,scrollWidth:document.documentElement.scrollWidth,width:innerWidth}))};}finally{await browser.close();}
const proof={checkedAt:new Date().toISOString(),base,scope:'Anonymous read-only LAN checks; no personal account or database access. Host verification does not prove another device connectivity.',shellStatus:shell.status,healthStatus:health.status,health:await health.json(),assets,unauthorizedGeneratorStatus:ai.status,unauthorizedSidecar:internal,headers:{csp:shell.headers.get('content-security-policy'),nosniff:shell.headers.get('x-content-type-options'),referrer:shell.headers.get('referrer-policy')},ui};
await writeFile('evidence/v2/lan-release-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
if(shell.status!==200||health.status!==200||assets.some(x=>x.status!==200||x.hasInternalAuthModule||x.hasBearerCredential)||ai.status!==401||ui.errors.length||ui.consoleErrors.length||ui.scrollWidth>ui.width)throw new Error('LAN verification failed');
