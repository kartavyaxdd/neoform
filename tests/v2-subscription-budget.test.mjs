import {it,expect} from 'vitest';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {createDailyBudget} from '../scripts/subscription-budget.mjs';
it('global allowance survives restart, counts failed attempts, and resets only next UTC day',async()=>{
 const qaRoot=path.resolve('.qa-state');
 await mkdir(qaRoot,{recursive:true});const dir=await mkdtemp(path.join(qaRoot,'test-budget-'));
 try {let date='2026-10-10';const clock=()=>date;const file=dir+'/quota.json';
 let budget=await createDailyBudget({file,limit:2,day:clock});
 expect(await budget.reserve()).toBe(true);expect(await budget.reserve()).toBe(true);expect(await budget.reserve()).toBe(false);
 budget=await createDailyBudget({file,limit:2,day:clock});expect(await budget.reserve()).toBe(false);
 date='2026-10-11';expect(await budget.reserve()).toBe(true);
 }finally{const resolved=path.resolve(dir);if(!resolved.startsWith(qaRoot+path.sep+'test-budget-'))throw new Error('Budget fixture escaped QA root');await rm(resolved,{recursive:true,force:true});}
});
