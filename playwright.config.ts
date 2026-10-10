import { defineConfig } from "@playwright/test";
const evidenceRoot = process.env.NEOFORM_QA_OUTPUT || "evidence";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: `${evidenceRoot}/browser-artifacts`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${evidenceRoot}/browser-report`, open: "never" }],
    ["json", { outputFile: `${evidenceRoot}/browser-results.json` }],
  ],
  use: {
    baseURL: "http://localhost:8787",
    headless: true,
    launchOptions: {
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15000,
  },
});
