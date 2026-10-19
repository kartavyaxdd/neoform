import { expect, type Page } from "@playwright/test";

export async function fixture(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`v2-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-v2-passphrase-2026");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("V2 QA");
  await page.getByRole("button", { name: "Build my workspace" }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
}
export async function currentReadiness(page: Page, muscle: string) {
  await page.getByRole("button",{name:"Exercise options",exact:true}).click();
  await page.getByRole("button",{name:"Readiness",exact:true}).click();
  await page.getByLabel("Systemic fatigue now",{exact:true}).selectOption("1");
  await page.getByLabel("Unscoped pain now",{exact:true}).selectOption("no");
  await page.getByLabel("Broader context today",{exact:true}).selectOption("usual");
  await page.getByLabel(`${muscle} readiness`,{exact:true}).selectOption("yes");
  await page.getByLabel(`${muscle} pain now`,{exact:true}).selectOption("no");
  await page.getByLabel(`${muscle} soreness now`,{exact:true}).selectOption("1");
  await page.getByRole("checkbox",{name:"These answers describe how I feel now.",exact:true}).check();
  await page.getByRole("button",{name:"Save current readiness",exact:true}).click();
}
