import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2];
if (!base || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(base)) throw new Error('Expected exact verified HTTPS tunnel URL');
const health = await fetch(base + '/api/health');
const shell = await fetch(base); const html = await shell.text();
const assets = [];
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) {
 const r=await fetch(base+match[1]); const body=await r.text();
 assets.push({ path:match[1],status:r.status,bytes:Buffer.byteLength(body),privateModule:body.includes('localAiKey'),bearer:/Bearer\s+[a-f0-9]{64}/.test(body) });
}
const probe = async origin => {
 const r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}); return r.status;
};
const sameOrigin = await probe(base), badOrigin = await probe('https://evil.example');
const unauthorized=await fetch(base+'/api/data');
await mkdir('evidence/remote',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let ui;
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base); await page.getByRole('button',{name:'Create account',exact:true}).waitFor();
 await page.screenshot({path:'evidence/remote/https-auth-390.png'});
 ui={title:await page.title(),errors,...await page.evaluate(()=>({secureContext:isSecureContext,width:innerWidth,scrollWidth:document.documentElement.scrollWidth}))};
} finally { await browser.close(); }
const proof={base,checkedAt:new Date().toISOString(),health:{status:health.status,body:await health.json()},shell:shell.status,assets,sameOriginMalformedLogin:sameOrigin,crossOriginLogin:badOrigin,unauthorizedData:unauthorized.status,ui};
await writeFile('evidence/remote/https-verification.json',JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof,null,2));
if(health.status!==200 || shell.status!==200 || assets.some(x=>x.status!==200||x.privateModule||x.bearer) || sameOrigin!==400 || badOrigin!==403 || unauthorized.status!==401 || !ui.secureContext || ui.errors.length || ui.scrollWidth>ui.width) throw new Error('Remote preview verification failed');
