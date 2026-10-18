import {randomBytes} from 'node:crypto';
import {readFile,appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
// Own application secret only; no provider/account credential files are read.
if(spawnSync('git',['check-ignore','--quiet','.dev.vars'],{shell:false}).status!==0)throw new Error('Refusing unignored master-secret file.');
let content='';try{content=await readFile('.dev.vars','utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const line=content.match(/^GEMINI_KEY_MASTER\s*=\s*['"]?([a-f0-9]{64})['"]?\s*$/m);
if(line){console.log('Persistent Gemini encryption master already present (value never printed).');}
else{
 if(/^GEMINI_KEY_MASTER\s*=/m.test(content))throw new Error('Existing Gemini master has invalid format; refusing to overwrite.');
 await appendFile('.dev.vars',(content.endsWith('\n')||!content?'':'\n')+'GEMINI_KEY_MASTER='+randomBytes(32).toString('hex')+'\n',{mode:0o600});
 console.log('Created ignored server-only persistent AES-256 encryption master; existing settings preserved.');
}
