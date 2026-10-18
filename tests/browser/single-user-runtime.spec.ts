import {test,expect} from '@playwright/test';
const base=process.env.NEOFORM_SINGLE_USER_QA_URL;
test.skip(!base,'Explicit isolated single-user QA URL required');
test('real local gateway opens exact QA account without login and persists through browser reload',async({page,request})=>{
 const origin=new URL(base!);expect(origin.hostname).toBe('127.0.0.1');expect(origin.port).not.toBe('8788');
 const meResponse=await request.get(origin.origin+'/api/me');expect(meResponse.status()).toBe(200);
 const me=await meResponse.json();expect(me.email).toMatch(/^single-user-qa-[a-f0-9-]+@example\.test$/);
 expect(me.accessMode).toBe('single-user-local');
 const headers={Origin:origin.origin,'X-Neoform-Account':me.id};
 const previous=await (await request.get(origin.origin+'/api/data',{headers})).json();
 const data=structuredClone(previous.data);
 data.profile={name:'Real single-user QA',experience:'New',goal:'Build muscle',equipment:['Dumbbell'],days:3};
 const save=await request.put(origin.origin+'/api/data',{headers,data:{revision:previous.revision,data}});expect(save.status()).toBe(200);
 try{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('neoform:signed-out','1'));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(let i=0;i<2;i++){
   const shell=await page.goto(origin.origin);expect(shell?.status()).toBe(200);
   await expect(page.locator('.sync-status')).toHaveText('Synced');
   expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('neoform:identity')!).id)).toBe(me.id);
   await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);
   await page.getByRole('button',{name:'More',exact:true}).last().click();
   await expect(page.getByText('Single-user / this PC',{exact:true})).toBeVisible();
   for(const name of ['Sign out','Change password','Delete account & data'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
   await expect(page.getByRole('heading',{name:'Gemini AI'})).toBeVisible();
  }
  expect(await page.context().cookies()).toHaveLength(0);expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'evidence/single-user/real-gateway-browser-390.png',fullPage:true});
  const after=await (await request.get(origin.origin+'/api/data',{headers})).json();expect(after.data).toEqual(data);
 }finally{
  const current=await (await request.get(origin.origin+'/api/data',{headers})).json();
  const restore=await request.put(origin.origin+'/api/data',{headers,data:{revision:current.revision,data:previous.data}});expect(restore.status()).toBe(200);
 }
});
