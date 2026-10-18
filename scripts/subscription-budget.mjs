import {readFile,writeFile,rename} from 'node:fs/promises';
import {z} from 'zod';
const ledgerSchema=z.object({day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),count:z.number().int().min(0).max(100)}).strict();
export async function createDailyBudget({file,limit=10,day=()=>new Date().toISOString().slice(0,10)}) {
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Daily limit must be 1–100.');
 let state;
 try{state=ledgerSchema.parse(JSON.parse(await readFile(file,'utf8')));}catch(e){if(e.code!=='ENOENT')throw new Error('Global budget ledger unavailable; fail closed.');state={day:day(),count:0};}
 let chain=Promise.resolve();
 return {reserve(){
   const operation=chain.then(async()=>{
     const today=day();if(state.day!==today)state=ledgerSchema.parse({day:today,count:0});
     if(state.count>=limit)return false;
     const next={day:today,count:state.count+1};
     await writeFile(file+'.tmp',JSON.stringify(next)+'\n');await rename(file+'.tmp',file);
     state=next;return true;
   });
   chain=operation.catch(()=>{});return operation;
 }};
}
