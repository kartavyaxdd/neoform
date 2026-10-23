import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { fixture } from "./v2-fixture";
import { readData } from "./storage-client";
import { syntheticCoachingEvent } from "../coaching-fixture";
import {
  prepareHistoryMutation,
  recoverHistoryMutation,
  writeHistoryMutation,
  type HistoryRequest,
} from "../../src/historyTransport";
import type { State } from "../../src/domain";

let source: string;
test.use({ serviceWorkers: "block" });
test.beforeAll(async () => {
  source = (
    await build({
      stdin: {
        contents:
          "import {MutationQueue} from './src/mutationQueue';globalThis.__recoveryQueue=MutationQueue;",
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
    })
  ).outputFiles[0].text;
});

for (const committed of [false, true])
  for (const size of [1, 201]) {
    test(`coaching ${size > 1 ? "multipart" : "direct"} queue retries after reload with ${committed ? "lost acknowledgement" : "no server commit"}`, async ({
      page,
    }) => {
      await fixture(page);
      const identity = await (await page.request.get("/api/me")).json();
      const base = (await (await readData(page)).json()) as {
        data: State;
        revision: number;
      };
      await page.route("**/__qa-recovery", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Recovery QA</title>",
        }),
      );
      await page.route("**/__qa-recovery.js", (route) =>
        route.fulfill({ contentType: "application/javascript", body: source }),
      );
      await page.goto("/__qa-recovery");
      await page.addScriptTag({ url: "/__qa-recovery.js" });
      const next = {
        ...base.data,
        coachingEvents: Array.from({ length: size }, (_, i) =>
          syntheticCoachingEvent(i),
        ),
      };
      const plan = prepareHistoryMutation(base.data, next, base.revision);
      const api: HistoryRequest = async <T>(
        path: string,
        method = "GET",
        body?: unknown,
      ) => {
        const response = await page.request.fetch("/api" + path, {
          method,
          headers: {
            Origin: new URL(page.url()).origin,
            "X-Neoform-Account": identity.id,
          },
          ...(body === undefined ? {} : { data: body }),
        });
        const data = await response.json();
        if (!response.ok())
          throw Object.assign(Error(data.error), { status: response.status() });
        return data as T;
      };
      // Original client sent the complete in-memory plan, but stored this old shape.
      const { coachingCount: _count, ...legacy } = plan;
      await page.evaluate(
        async ({ owner, legacy }) => {
          const q = await (globalThis as any).__recoveryQueue.open(
            "neoform-qa-recovery",
          );
          await q.stage(owner, legacy);
          q.close();
        },
        { owner: identity.id, legacy },
      );
      if (committed) await writeHistoryMutation(api, plan);
      const stored = await page.evaluate(async (owner) => {
        const q = await (globalThis as any).__recoveryQueue.open(
          "neoform-qa-recovery",
        );
        const [plan] = await q.list(owner);
        q.close();
        return plan;
      }, identity.id);
      const recovered = await recoverHistoryMutation(stored, base.data, next);
      await page.evaluate(
        async ({ owner, recovered }) => {
          const q = await (globalThis as any).__recoveryQueue.open(
            "neoform-qa-recovery",
          );
          await q.stage(owner, recovered);
          q.close();
        },
        { owner: identity.id, recovered },
      );
      expect(await writeHistoryMutation(api, recovered)).toEqual({
        revision: base.revision + 1,
      });
      const remote = await (await readData(page)).json();
      expect(remote.data).toEqual(next);
      expect(remote.revision).toBe(base.revision + 1);
      await page.evaluate(
        async ({ owner, id, revision }) => {
          const q = await (globalThis as any).__recoveryQueue.open(
            "neoform-qa-recovery",
          );
          await q.acknowledge(owner, id, revision);
          q.close();
        },
        { owner: identity.id, id: plan.id, revision: remote.revision },
      );
      // Subsequent ledger deletion and an ordinary setting edit must still work.
      const after = {
        ...next,
        coachingEvents: [],
        settings: { ...next.settings, unit: "lb" as const },
      };
      await writeHistoryMutation(
        api,
        prepareHistoryMutation(next, after, remote.revision),
      );
      const final = await (await readData(page)).json();
      expect(final.data.coachingEvents ?? []).toEqual([]);
      expect(final.data.settings.unit).toBe("lb");
    });
  }
