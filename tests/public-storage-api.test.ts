import { it, expect } from "vitest";
import { qaTarget } from "./qa-target";
import { emptyState } from "../src/domain";
import {
  readHistory,
  prepareHistoryMutation,
  writeHistoryMutation,
  type HistoryRequest,
} from "../src/historyTransport";
const origin = qaTarget();
const api: HistoryRequest = async <T>(
  path: string,
  method = "GET",
  body?: unknown,
) => {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Neoform-Account": "public-workspace",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await r.json()) as { error?: string };
  if (!r.ok) throw Object.assign(Error(data.error), { status: r.status });
  return data as T;
};
it("the actual public Worker uses its own normalized workspace and rejects private identities, credentials and AI", async () => {
  expect(await (await fetch(origin + "/api/me")).json()).toEqual({
    id: "public-workspace",
    kind: "workspace",
    accessMode: "public-workspace",
    storageFormat: 2,
  });
  for (const path of ["/storage/head", "/storage/revision"])
    expect(
      (
        await fetch(origin + "/api" + path, {
          headers: { "X-Neoform-Account": "synthetic-private" },
        })
      ).status,
    ).toBe(412);
  for (const path of ["/register", "/login", "/ai/key", "/ai/generate"])
    expect(
      (
        await fetch(origin + "/api" + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
  const initial = await readHistory(api);
  expect(initial.data).toEqual(emptyState());
  const next = structuredClone(initial.data);
  next.settings.unit = "lb";
  expect(
    await writeHistoryMutation(
      api,
      prepareHistoryMutation(initial.data, next, initial.revision),
    ),
  ).toEqual({ revision: initial.revision + 1 });
  expect((await readHistory(api)).data).toEqual(next);
  expect((await fetch(origin + "/api/data")).status).toBe(426);
  expect(
    (
      await fetch(origin + "/api/storage/commit", {
        method: "POST",
        headers: {
          Origin: "https://foreign.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
  ).toBe(403);
}, 30000);
