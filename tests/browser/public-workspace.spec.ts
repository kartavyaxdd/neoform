import {test,expect} from '@playwright/test';
import {emptyState} from '../../src/domain';
const base=process.env.NEOFORM_PUBLIC_WORKSPACE_QA_URL;
test.skip(!base,'Explicit isolated public QA URL required');
test('real public Worker persists across independent contexts, protects revisions and private routes, preserves compact manual UI',async({browser,request})=>{
 const origin=new URL(base!);expect(origin.hostname).toBe('127.0.0.1');expect(origin.port).toBe('8786');
 const url=origin.origin;
 expect(await (await request.get(url+'/api/me')).json()).toEqual({id:'public-workspace',kind:'workspace',accessMode:'public-workspace'});
 const previous=await (await request.get(url+'/api/data')).json();
 const headers={Origin:url,'X-Neoform-Account':'public-workspace'};
 expect((await request.put(url+'/api/data',{headers,data:{revision:previous.revision,data:emptyState()}})).status()).toBe(200);
 const a=await browser.newContext({viewport:{width:390,height:844}}),b=await browser.newContext({viewport:{width:360,height:800}});
 const page=await a.newPage(),other=await b.newPage();
 const errors:string[]=[],aiRequests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/ai/'))aiRequests.push(r.url());});
 try {
  await page.addInitScript(()=>localStorage.setItem('neoform:signed-out','1'));
  await page.goto(url);
  await expect(page.getByText('Public workspace: anyone with this URL can view/change data',{exact:false})).toBeVisible();
  expect(await page.locator('input[type=email],input[type=password]').count()).toBe(0);
  await page.getByLabel('Your name',{exact:true}).fill('Shared public QA');
  await page.getByRole('button',{name:'Build my workspace'}).click();
  await expect(page.locator('.sync-status')).toHaveText('Synced');
  await page.getByRole('button',{name:'More',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'AI is unavailable in public mode'})).toBeVisible();
  for(const name of ['Sign out','Change password','Delete account & data','Save Gemini key'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await page.getByLabel('Display name',{exact:true}).fill('Public browser persisted');
  await page.getByLabel('Load units').selectOption('lb');
  await expect(page.locator('.sync-status')).toHaveText('Synced');
  await page.reload();await expect(page.getByLabel('Display name')).toHaveValue('Public browser persisted');await expect(page.getByLabel('Load units')).toHaveValue('lb');
  await other.goto(url);await expect(other.locator('.sync-status')).toHaveText('Synced');await other.getByRole('button',{name:'More',exact:true}).last().click();
  await expect(other.getByLabel('Display name')).toHaveValue('Public browser persisted');await expect(other.getByLabel('Load units')).toHaveValue('lb');
  for(const p of [page,other]) {
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await p.getByRole('button',{name:'Import from Hevy',exact:true}).click();await expect(p.getByRole('dialog')).toBeVisible();
    await p.screenshot({path:`evidence/public-workspace/hevy-${p===page?'390':'360'}.png`,fullPage:true});
    await p.getByRole('button',{name:'Close dialog',exact:true}).click();
    await p.getByRole('button',{name:'Create',exact:true}).click();await expect(p.getByText('AI is unavailable in public mode.',{exact:false})).toBeVisible();
    await expect(p.getByRole('button',{name:'AI program',exact:true})).toHaveCount(0);
    await p.getByRole('button',{name:'Close dialog',exact:true}).click();
    await p.getByRole('button',{name:'Workout',exact:true}).last().click();
    await expect(p.locator('.date-strip')).toBeVisible();
    await p.screenshot({path:`evidence/public-workspace/workout-${p===page?'390':'360'}.png`,fullPage:true});
  }
  await page.locator('.program-options').first().getByText('Program options',{exact:true}).click();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Program name').fill('Public manual program');
  await page.getByRole('button',{name:'Save mesocycle',exact:false}).click();
  await expect(page.locator('.sync-status')).toHaveText('Synced');
  await page.getByRole('button',{name:'Start Full body A',exact:true}).click();
  await page.getByLabel('Barbell back squat set 1 weight',{exact:true}).fill('60');
  await page.getByLabel('Barbell back squat set 1 reps',{exact:true}).fill('10');
  await page.getByRole('button',{name:'Complete Barbell back squat set 1',exact:true}).click();
  await expect(page.locator('.sync-status')).toHaveText('Synced');
  await page.reload();await expect(page.getByLabel('Barbell back squat set 1 weight',{exact:true})).toHaveValue('60');
  for(const width of [360,390]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`evidence/public-workspace/logger-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Finish session',exact:true}).click();
  await page.getByRole('button',{name:'Save completed workout',exact:false}).click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'Full body A',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(page.locator('.sync-status')).toHaveText('Synced');
  const saved=await (await request.get(url+'/api/data')).json();expect(saved.data.sessions).toHaveLength(1);expect(saved.data.programs[0].name).toBe('Public manual program');expect(saved.data.profile.name).toBe('Public browser persisted');expect(saved.data.settings.unit).toBe('lb');
  expect((await request.put(url+'/api/data',{headers,data:{revision:saved.revision-1,data:saved.data}})).status()).toBe(409);
  expect((await request.put(url+'/api/data',{headers:{Origin:'https://hostile.example'},data:{revision:saved.revision,data:saved.data}})).status()).toBe(403);
  expect((await request.put(url+'/api/data',{data:{revision:saved.revision,data:saved.data}})).status()).toBe(403);
  expect((await request.get(url+'/api/data',{headers:{'X-Neoform-Account':'private-qa'}})).status()).toBe(412);
  for(const path of ['/api/register','/api/login','/api/logout','/api/password','/api/account','/api/ai/key','/api/ai/generate'])expect((await request.post(url+path,{headers,data:{}})).status()).toBe(403);
  expect((await a.cookies()).filter(c=>c.name==='neoform_session')).toHaveLength(0);expect(await b.cookies()).toHaveLength(0);expect(aiRequests).toEqual([]);expect(errors).toEqual([]);
 } finally {
  await a.close();await b.close();
  const current=await (await request.get(url+'/api/data')).json();expect((await request.put(url+'/api/data',{headers,data:{revision:current.revision,data:previous.data}})).status()).toBe(200);
  expect((await (await request.get(url+'/api/data')).json()).data).toEqual(previous.data);
 }
});
