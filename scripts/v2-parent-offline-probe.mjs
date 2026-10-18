import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('evidence/v2/parent-security',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:390,height:844}});
const a=await context.newPage(), b=await context.newPage(), steps=[];
try{
 await a.goto('http://localhost:8787/');
 await a.getByLabel('Email',{exact:true}).fill(`parent-offline-${crypto.randomUUID()}@example.test`);
 await a.getByLabel('Password',{exact:true}).fill('parent-synthetic-offline-passphrase');
 await a.getByRole('button',{name:'Create account',exact:true}).click();
 await a.getByLabel('Your name',{exact:true}).fill('Parent offline QA');
 await a.getByRole('button',{name:'Build my workspace'}).click();
 await a.locator('.sync-status').filter({hasText:'Synced'}).waitFor({state:'attached'});
 await a.getByRole('button',{name:'Start Full body A',exact:true}).click();
 await a.locator('.sync-status').filter({hasText:'Synced'}).waitFor({state:'attached'});
 await b.goto('http://localhost:8787/');
 const first='Barbell back squat set 1 weight',second='Barbell back squat set 2 weight';
 await b.getByLabel(second,{exact:true}).waitFor();
 console.log('Both QA tabs loaded; waiting for public-shell service worker');
 await a.evaluate(async()=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('QA service worker readiness timed out')),10000))]);});
 await b.evaluate(async()=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('QA service worker readiness timed out')),10000))]);});
 await context.setOffline(true);
 await a.getByLabel(first,{exact:true}).fill('60');
 await a.waitForTimeout(400);
 await b.getByLabel(second,{exact:true}).fill('80');
 await b.waitForTimeout(700);
 for(const [label,p] of [['a-before-reload',a],['b-before-reload',b]]){steps.push({label,first:await p.getByLabel(first,{exact:true}).inputValue(),second:await p.getByLabel(second,{exact:true}).inputValue()});}
 await a.reload();await a.getByLabel(first,{exact:true}).waitFor();
 await b.reload();await b.getByLabel(second,{exact:true}).waitFor();
 for(const [label,p] of [['a-after-reload',a],['b-after-reload',b]]){steps.push({label,first:await p.getByLabel(first,{exact:true}).inputValue(),second:await p.getByLabel(second,{exact:true}).inputValue()});}
 await a.screenshot({path:'evidence/v2/parent-security/offline-tabs-after-reload.png'});
 const success=steps.filter(s=>s.label.includes('after-reload')).every(s=>s.first==='60'&&s.second==='80');
 const proof={checkedAt:new Date().toISOString(),scope:'Synthetic localhost8787 QA account only',steps,success};
 await writeFile('evidence/v2/parent-security/offline-tabs-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
 if(!success)throw new Error('Same-account offline tab edits lost after reload');
}finally{await context.close();await browser.close();}
