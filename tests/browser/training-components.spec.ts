import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import fs from "node:fs";

async function mount(page: Page, component: string, setup: string) {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {${component}} from './src/TrainingFeedback'; import * as D from './src/domain'; ${setup}`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  await page.setContent(
    '<html><head></head><body><div id="root"></div></body></html>',
  );
  for (const file of ["src/styles.css", "src/v2.css"])
    await page.addStyleTag({
      content: fs.readFileSync(path.resolve(file), "utf8"),
    });
  await page.addScriptTag({ content: result.outputFiles[0].text });
}

test("finish leaves unreported values unknown and scopes local pain to a muscle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mount(
    page,
    "FinishSessionFeedback",
    `const e=D.createEntry(D.catalog.find(e=>e.muscle==='Quads')); e.sets[0].done=true; const draft=D.startSession('QA finish',[e]); createRoot(document.getElementById('root')).render(<FinishSessionFeedback draft={draft} exercises={D.catalog} finish={(feedback,muscleFeedback)=>{document.getElementById('saved').textContent=JSON.stringify({feedback,muscleFeedback})}}/>); const output=document.createElement('pre'); output.id='saved'; document.body.append(output);`,
  );
  await expect(
    page.getByLabel("Systemic fatigue", { exact: true }),
  ).toHaveValue("unknown");
  await expect(page.getByLabel("Unscoped pain", { exact: true })).toHaveValue(
    "unknown",
  );
  await page.getByRole("button", { name: "Save completed workout" }).click();
  await expect(page.locator("#saved")).toContainText('"reported":false');
  await expect(page.locator("#saved")).toContainText('"fatigue":null');
  await expect(page.locator("#saved")).toContainText('"muscleFeedback":[]');
  await page.getByText("Muscle-specific feedback", { exact: true }).click();
  await page
    .getByLabel("Feedback muscle", { exact: true })
    .selectOption("Quads");
  await page
    .getByRole("button", { name: "Add muscle feedback", exact: true })
    .click();
  await page.getByLabel("Quads pain", { exact: true }).selectOption("yes");
  await page.getByLabel("Quads recovery", { exact: true }).selectOption("no");
  await page.getByLabel("Quads soreness", { exact: true }).selectOption("4");
  await expect(page.getByLabel("Unscoped pain", { exact: true })).toHaveValue(
    "unknown",
  );
  await page.getByRole("button", { name: "Save completed workout" }).click();
  const saved = JSON.parse(
    (await page.locator("#saved").textContent()) || "{}",
  );
  expect(saved.feedback).toMatchObject({
    reported: false,
    pump: null,
    soreness: null,
    fatigue: null,
    pain: null,
  });
  expect(saved.muscleFeedback).toEqual([
    expect.objectContaining({
      muscle: "Quads",
      pain: true,
      recovered: "no",
      soreness: 4,
      pump: null,
      fatigue: null,
    }),
  ]);
  await expect(page.locator("body")).not.toContainText("growth score");
  await page.screenshot({
    path: "evidence/training-engine-ui/finish-360.png",
    fullPage: true,
  });
});

test("editing fatigue never erases a legacy pain safety signal", async ({page}) => {
  await mount(page, "SessionFeedbackFields", `function Harness(){const [f,setF]=React.useState({pump:3,soreness:2,fatigue:2,pain:true});return <><SessionFeedbackFields value={f} onChange={setF}/><pre id="feedback">{JSON.stringify(f)}</pre></>}createRoot(document.getElementById('root')).render(<Harness/>);`);
  await expect(page.getByLabel('Unscoped pain',{exact:true})).toHaveValue('yes');
  await page.getByLabel('Systemic fatigue',{exact:true}).selectOption('2');
  await expect(page.getByLabel('Unscoped pain',{exact:true})).toHaveValue('yes');
  await expect(page.locator('#feedback')).toContainText('"pain":true');
  await expect(page.locator('#feedback')).toContainText('"pump":null');
  await expect(page.locator('#feedback')).toContainText('"reported":true');
});

test("legacy feedback is labelled unreported and unknown never renders as a neutral rating", async ({
  page,
}) => {
  await mount(
    page,
    "FeedbackSummary",
    `createRoot(document.getElementById('root')).render(<><FeedbackSummary session={{...D.startSession('Legacy',[]),feedback:{pump:3,soreness:2,fatigue:2,pain:false}}}/><FeedbackSummary session={{...D.startSession('Unknown',[]),feedback:{pump:null,soreness:null,fatigue:null,pain:null,reported:false}}}/></>);`,
  );
  await expect(page.getByText(/Legacy.*unreported/)).toBeVisible();
  await expect(
    page.getByText("Systemic fatigue: Unknown", { exact: true }),
  ).toHaveCount(2);
  await expect(page.locator("body")).not.toContainText("/5");
});

test("phase and effort edits are explicit and reversible in the editor", async ({
  page,
}) => {
  await mount(
    page,
    "PhaseControls",
    `function Harness(){const [p,setP]=React.useState(D.starterProgram('balanced')); return <><PhaseControls program={p} onChange={setP}/><pre data-testid="value">{JSON.stringify(p)}</pre></>} createRoot(document.getElementById('root')).render(<Harness/>);`,
  );
  await expect(
    page.getByText("Future workouts only", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Training phase", { exact: true })
    .selectOption("active-rest");
  await expect(page.getByText(/No hard workout will be started/)).toBeVisible();
  await expect(page.getByTestId("value")).toContainText(
    '"phase":"active-rest"',
  );
  await page.getByLabel("Effort policy", { exact: true }).selectOption("ramp");
  await page.getByLabel("Starting RIR", { exact: true }).fill("4");
  await page.getByLabel("Ending RIR", { exact: true }).fill("2");
  await expect(page.getByTestId("value")).toContainText(
    '"mode":"ramp","startRir":4,"endRir":2',
  );
  await page
    .getByLabel("Effort policy", { exact: true })
    .selectOption("exercise");
  await expect(page.getByTestId("value")).not.toContainText('"effort"');
});
