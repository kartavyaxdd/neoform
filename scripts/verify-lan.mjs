import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 const response = await page.goto('http://192.168.1.2:8789');
 await page.getByRole('button', { name: 'Create account', exact: true }).waitFor();
 const health = await page.request.get('http://192.168.1.2:8789/api/health');
 console.log(JSON.stringify({ pageStatus: response.status(), health: await health.json(), title: await page.title(), browser: await page.evaluate(() => ({ secureContext: isSecureContext, uuidAvailable: typeof crypto.randomUUID, randomBytesAvailable: typeof crypto.getRandomValues })), errors }));
 if (errors.length || !response.ok() || !health.ok()) throw new Error('LAN verification failed');
} finally { await browser.close(); }
