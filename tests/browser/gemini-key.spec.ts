import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
test("Gemini account key settings are password-only and never persist the entered fixture key", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Gemini AI" })).toBeVisible();
  const input = page.getByLabel("Gemini API key", { exact: true });
  await expect(input).toHaveAttribute("type", "password");
  const fixtureKey = "AQ.synthetic.fixture.only-123456789";
  await input.fill(fixtureKey);
  await page
    .getByRole("button", { name: "Save Gemini key", exact: true })
    .click();
  await expect(
    page.getByText("Gemini key saved for this account.", { exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("");
  expect(
    await page.evaluate(
      (k) =>
        JSON.stringify(localStorage).includes(k) ||
        JSON.stringify(sessionStorage).includes(k),
      fixtureKey,
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Remove Gemini key", exact: true })
    .click();
  await expect(
    page.getByText("Gemini key removed.", { exact: true }),
  ).toBeVisible();
});
