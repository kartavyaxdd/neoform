// Authorized exact-owner key stays in memory; only public assets are inspected.
import {spawnSync} from 'node:child_process';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),email=args[args.indexOf('--email')+1],id=args[args.indexOf('--expected-id')+1];
if(!args.includes('--email')||!args.includes('--expected-id'))throw new Error('Require the exact authorized owner.');
const p=spawnSync('python',['scripts/gemini-encrypted-record.py','--email',email,'--expected-id',id],{encoding:'utf8',shell:false,windowsHide:true});
if(p.status!==0)throw new Error('Exact encrypted record unavailable.');
const row=JSON.parse(p.stdout),vars=await readFile('.dev.vars','utf8'),master=vars.match(/^GEMINI_KEY_MASTER\s*=\s*['"]?([a-f0-9]{64})['"]?\s*$/m)?.[1];
const G=await import(pathToFileURL(path.resolve('.ai-runtime/gemini-live-proof-bundle.mjs')).href);
let key=await G.decryptAccountKey(row.encrypted,row.account,master);const files=(await readdir('dist/assets')).filter(f=>f.endsWith('.js'));
for(const f of files){const text=await readFile(path.join('dist/assets',f),'utf8');if(text.includes(key)||text.includes(master))throw new Error('Private server value found in a client asset.');}
const origin='https://belkin-crm-borough-chi.trycloudflare.com';const health=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(15000)});if(health.status!==200)throw new Error('Public health is not ready.');
const page=await fetch(origin,{signal:AbortSignal.timeout(15000)}),html=await page.text(),entry=html.match(/src="([^"]+\/assets\/[^\"]+\.js)"/)?.[1]||html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
if(!entry)throw new Error('Public client entry missing.');
const publicJs=await(await fetch(new URL(entry,origin),{signal:AbortSignal.timeout(15000)})).text();if(publicJs.includes(key)||publicJs.includes(master))throw new Error('Private server value found in public JS.');
const proof={checkedAt:new Date().toISOString(),status:'passed',localJsAssets:files.length,providerKeyAbsent:true,masterAbsent:true,publicHealth:health.status,publicEntry:entry,geminiModelPresent:publicJs.includes(G.GEMINI_MODEL),keySettingsPresent:publicJs.includes('Save Gemini key'),personalProgramsReadOrWritten:false};
if(!proof.geminiModelPresent||!proof.keySettingsPresent)throw new Error('Current public Gemini UI missing.');key='';await writeFile('evidence/gemini/asset-privacy.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
