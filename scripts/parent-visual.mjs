import { chromium } from "playwright";
import fs from "node:fs";
import {
  emptyState,
  starterProgram,
  createEntry,
  catalog,
  startSession,
} from "../src/domain.ts";
const base = "http://localhost:8787",
  out = "evidence/parent-visual";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await page
  .getByRole("button", { name: "Create account", exact: true })
  .waitFor();
await page.screenshot({ path: out + "/mobile-auth.png", fullPage: true });
const signup = await context.request.post(base + "/api/register", {
  headers: { Origin: base },
  data: {
    email: "parent-design-" + Date.now() + "@example.test",
    password: "Parent-Design-QA-passphrase",
  },
});
if (signup.status() !== 201)
  throw new Error("Local QA registration failed: " + signup.status());
const user = await signup.json();
const state = emptyState();
state.profile = {
  name: "Design QA",
  experience: "Intermediate",
  goal: "Build muscle",
  days: 3,
  equipment: ["Barbell", "Dumbbell", "Machine", "Cable"],
};
state.programs = [starterProgram("balanced")];
const put = async (data, revision) => {
  const r = await context.request.put(base + "/api/data", {
    headers: { Origin: base, "X-Neoform-Account": user.id },
    data: { data, revision },
  });
  if (r.status() !== 200)
    throw new Error("QA snapshot save failed: " + r.status());
  return (await r.json()).revision;
};
let revision = await put(state, 0);
await page.reload();
await page.getByRole("heading", { name: "Welcome back, Design." }).waitFor();
const observations = [];
for (const width of [360, 390, 768, 1440]) {
  await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
  await page.screenshot({
    path: out + "/overview-" + width + ".png",
    fullPage: true,
  });
  observations.push(
    await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      title: document.title,
      smallControls: [...document.querySelectorAll("button")]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
        })
        .map((b) => ({
          label: b.getAttribute("aria-label") || b.innerText,
          width: b.getBoundingClientRect().width,
          height: b.getBoundingClientRect().height,
        })),
    })),
  );
}
state.draft = startSession("QA layout · not real history", [
  createEntry(catalog.find((x) => x.id === "bench")),
]);
revision = await put(state, revision);
await page.evaluate(() => localStorage.setItem("neoform:page", "session"));
await page.reload();
await page
  .getByRole("heading", { name: "QA layout · not real history" })
  .waitFor();
for (const width of [360, 390, 1440]) {
  await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
  await page.screenshot({
    path: out + "/logger-" + width + ".png",
    fullPage: true,
  });
}
fs.writeFileSync(
  out + "/observations.json",
  JSON.stringify({ observations, errors, testAccountOnly: true }, null, 2),
);
console.log(
  JSON.stringify({
    screenshots: fs.readdirSync(out).filter((x) => x.endsWith(".png")),
    observations,
    errors,
  }),
);
await browser.close();
