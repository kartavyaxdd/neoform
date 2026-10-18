import {chromium} from 'playwright';
import fs from 'node:fs';
const root='evidence/v2/independent'; fs.mkdirSync(root,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:8787/');
 await page.getByLabel('Email',{exact:true}).fill(`independent-v2-${crypto.randomUUID()}@example.test`);
 await page.getByLabel('Password',{exact:true}).fill('independent-synthetic-v2-passphrase');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByLabel('Your name',{exact:true}).fill('Independent QA');
 await page.getByRole('button',{name:'Build my workspace'}).click();
 await page.locator('.sync-status').filter({hasText:'Synced'}).waitFor();
 for(const width of [360,390,1440]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  await page.screenshot({path:`${root}/workout-${width}.png`,fullPage:true});
  checks.push(await page.evaluate(()=>({screen:'home',width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,heading:document.querySelector('h1')?.textContent})));
 }
 await page.getByRole('button',{name:'Start Full body A',exact:true}).click();
 for(const width of [360,390,1440]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  await page.screenshot({path:`${root}/logger-${width}.png`,fullPage:true});
  checks.push(await page.evaluate(()=>({screen:'logger',width:innerWidth,scrollWidth:document.documentElement.scrollWidth,exerciseCount:document.querySelectorAll('.log-exercise').length,heading:document.querySelector('.log-exercise h2')?.textContent})));
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Info',exact:true}).click();
 await page.screenshot({path:`${root}/video-390.png`,fullPage:true});
 await page.getByRole('button',{name:'Play demonstration',exact:true}).click();
 checks.push({videoIframe:await page.getByRole('dialog').locator('iframe').getAttribute('src'),watchFallback:await page.getByRole('link',{name:'Watch on YouTube',exact:true}).getAttribute('href')});
 await page.waitForTimeout(12000);
 const videoFrame=page.frames().find(f=>f.url().includes('youtube-nocookie'));
 checks.push({playerFrameUrl:videoFrame?.url()||null,playerText:videoFrame?await videoFrame.locator('body').innerText().catch(e=>e.message):'Frame unavailable'});
 await page.screenshot({path:`${root}/video-playing-390.png`,fullPage:true});
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'Create',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'AI program',exact:true}).click();
 await page.screenshot({path:`${root}/wizard-390.png`,fullPage:true});
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.screenshot({path:`${root}/wizard-equipment-390.png`,fullPage:true});
 console.log(JSON.stringify({checks,errors},null,2));
 fs.writeFileSync(`${root}/visual-observations.json`,JSON.stringify({checks,errors},null,2));
 if(errors.length||checks.some(c=>c.scrollWidth>c.width))throw new Error('Visual smoke errors or horizontal overflow');
}finally{await browser.close();}
