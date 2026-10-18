import { test, expect } from '@playwright/test';
import { emptyState } from '../../src/domain';
test.use({ viewport: { width:390, height:844 } });
const identity = {id: 'single-user-browser-only', email: 'single-user@example.test', accessMode: 'single-user-local'};
test('local owner opens without login, keeps reload identity and hides auth controls', async ({page}) => {
 const data = emptyState();
 data.profile = {name: 'Local QA', experience: 'New', goal: 'Build muscle', equipment: ['Dumbbell'], days: 3};
 let revision = 4;
 await page.addInitScript(() => { if (!localStorage.getItem('qa:booted')) {localStorage.setItem('neoform:signed-out','1'); localStorage.setItem('qa:booted','1');} });
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/me') return route.fulfill({json: identity});
  if (path === '/api/data') {
   expect(route.request().headers()['x-neoform-account']).toBe(identity.id);
   if(route.request().method() === 'PUT') {revision++; return route.fulfill({json: {revision}});}
   return route.fulfill({json: {data, revision}});
  }
  if(path === '/api/ai/key') return route.fulfill({json: {configured: false}});
  return route.fulfill({status: 403, json: {error: 'unexpected account endpoint'}});
 });
 await page.goto('/');
 await expect(page.locator('.sync-status')).toHaveText('Synced');
 await expect(page.getByRole('button', {name: 'Sign out', exact: true})).toHaveCount(0);
 await expect(page.getByLabel('Password', {exact:true})).toHaveCount(0);
 for (let i=0; i<2; i++) {
  await page.getByRole('button', {name: 'More', exact: true}).last().click();
  await expect(page.getByText('Single-user / this PC', {exact:true})).toBeVisible();
  await expect(page.getByText(identity.email, {exact:true})).toBeVisible();
  for (const name of ['Sign out','Change password','Delete account & data']) await expect(page.getByRole('button',{name, exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading', {name:'Gemini AI'})).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('neoform:identity')!).id)).toBe(identity.id);
  await page.screenshot({path:`evidence/single-user/browser-local-${i}.png`, fullPage:true});
  await page.reload();
  await expect(page.locator('.sync-status')).toHaveText('Synced');
 }
 expect(await page.context().cookies()).toHaveLength(0);
});
test('local configuration error offers retry not password login', async ({page}) => {
 await page.route('**/api/**', route => route.fulfill({status:503,json:{error:'Configure SINGLE_USER_ID for this database.',accessMode:'single-user-local'}}));
 await page.goto('/');
 await expect(page.getByText('Configure SINGLE_USER_ID for this database.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Retry local setup'})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);
});
