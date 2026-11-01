import { it, expect } from "vitest";
import { readData, writeData } from "./browser/storage-client";
import { emptyState } from "../src/domain";
import { headerOf } from "../src/storageProtocol";
import type { Page } from "@playwright/test";
function pageStub(mode: "read-race" | "denied" | "stale-write") {
  let heads = 0,
    reads = 0,
    commits = 0;
  const response = (status: number, body: unknown) => ({
    status: () => status,
    ok: () => status < 400,
    json: async () => body,
  });
  const page = {
    url: () => "http://127.0.0.1:8787",
    request: {
      get: async () => response(200, { id: "synthetic-owner" }),
      fetch: async (url: string) => {
        if (url.endsWith("/storage/head")) {
          heads++;
          return response(200, {
            revision: heads - 1,
            header: headerOf(emptyState()),
            count: 0,
            coachingCount: 0,
          });
        }
        if (url.includes("/storage/history")) {
          reads++;
          if (mode === "denied")
            return response(403, { error: "Synthetic denial" });
          if (mode === "read-race" && reads === 1)
            return response(409, {
              error: "History changed. Restart from the current head.",
            });
          return response(200, { records: [], next: null });
        }
        if (url.endsWith("/storage/commit")) {
          commits++;
          return response(409, { error: "Synthetic stale write" });
        }
        throw Error("Unexpected synthetic path");
      },
    },
  } as unknown as Page;
  return { page, counts: () => ({ heads, reads, commits }) };
}
it("restarts a revision-pinned read after an actual Playwright-shaped 409 response", async () => {
  const { page, counts } = pageStub("read-race");
  const result = await readData(page);
  expect((await result.json()).revision).toBe(1);
  expect(counts().heads).toBe(2);
});
it("preserves numeric denial codes and never retries denied access", async () => {
  const { page, counts } = pageStub("denied");
  await expect(readData(page)).rejects.toMatchObject({ status: 403 });
  expect(counts().reads).toBe(1);
});
it("returns numeric stale-write status without retrying a write", async () => {
  const { page, counts } = pageStub("stale-write");
  const result = await writeData(page, {
    data: { revision: 0, data: emptyState() },
  });
  expect(result.status()).toBe(409);
  expect(counts().commits).toBe(1);
});
