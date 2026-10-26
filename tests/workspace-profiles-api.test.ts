import { it, expect } from "vitest";
import { qaTarget } from "./qa-target";
import { spawnSync } from "node:child_process";
import path from "node:path";
import * as D from "../src/domain";
import {
  readHistory,
  prepareHistoryMutation,
  writeHistoryMutation,
  type HistoryRequest,
} from "../src/historyTransport";
const base = qaTarget();
const call = (
  path: string,
  method = "GET",
  payload?: unknown,
  cookie = "",
  owner?: string,
  origin = base,
) =>
  fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(owner ? { "X-Neoform-Account": owner } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
const client =
  (cookie: string, owner: string): HistoryRequest =>
  async <T>(path: string, method = "GET", payload?: unknown) => {
    const r = await call(path, method, payload, cookie, owner);
    const data = (await r.json()) as any;
    if (!r.ok) throw Object.assign(Error(data.error), { status: r.status });
    return data as T;
  };
it("profiles require server authorization, keep original owner, isolate data, fence stale tabs and revoke locks", async () => {
  const seeded = D.emptyState();
  seeded.profile = {
    name: "Preserved synthetic owner",
    experience: "Intermediate",
    goal: "Build muscle",
    days: 4,
    equipment: ["Barbell"],
  };
  const prior = D.startSession("Preserved synthetic history", [
    D.createEntry(D.catalog[0]),
  ]);
  prior.exercises[0].sets[0].done = true;
  seeded.sessions = [prior];
  const run = process.env.NEOFORM_QA_RUN_DIR!,
    db = "neoform-qa-" + process.env.NEOFORM_QA_RUN_ID!.slice(0, 8);
  const seed = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      db,
      "--local",
      "--config",
      path.join(run, "wrangler.json"),
      "--persist-to",
      path.join(run, "d1"),
      "--env-file",
      process.platform === "win32" ? "NUL" : "/dev/null",
      "--command",
      `INSERT INTO public_workspace(id,revision,body,updated_at) VALUES (1,7,'${JSON.stringify(seeded).replaceAll("'", "''")}',1)`,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  expect(seed.status).toBe(0);
  expect((await call("/me")).status).toBe(401);
  const access = (await (await call("/profiles")).json()) as any;
  expect(access.profiles.map((p: any) => [p.id, p.name, p.locked])).toEqual([
    ["sharma", "Sharma", true],
    ["abhishek", "Abhishek", false],
  ]);
  expect(JSON.stringify(access)).not.toMatch(/salt|hash|password/);
  for (const route of [
    "/data",
    "/storage/head",
    "/storage/history?revision=0&after=-1",
    "/storage/coaching?revision=0&after=-1",
    "/rest-alerts/config",
  ])
    expect((await call(route)).status).toBe(401);
  expect(
    (await call("/profiles/open", "POST", { id: "sharma", password: "wrong" }))
      .status,
  ).toBe(401);
  expect(
    (
      await call(
        "/profiles/open",
        "POST",
        { id: "abhishek" },
        "",
        undefined,
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  const opened = await call("/profiles/open", "POST", {
    id: "sharma",
    password: "QA-profile-pass",
  });
  expect(opened.status).toBe(200);
  const cookie = opened.headers.get("set-cookie")!.split(";")[0];
  expect(await opened.json()).toMatchObject({
    id: "public-workspace",
    profileId: "sharma",
    accessMode: "workspace-profiles",
  });
  const sharma = client(cookie, "public-workspace"),
    before = await readHistory(sharma),
    next = structuredClone(before.data);
  expect(before.data).toEqual(seeded);
  expect(before.revision).toBe(7);
  next.settings.unit = "lb";
  await writeHistoryMutation(
    sharma,
    prepareHistoryMutation(before.data, next, before.revision),
  );
  const second = await call("/profiles/open", "POST", { id: "abhishek" }),
    secondCookie = second.headers.get("set-cookie")!.split(";")[0];
  const abhi = client(secondCookie, "workspace-profile:abhishek"),
    other = await readHistory(abhi);
  expect(other.data.profile).toBeNull();
  expect(other.data.programs).toEqual([]);
  expect(other.data.sessions).toEqual([]);
  expect(other.data.settings.unit).toBe("kg");
  expect(
    (
      await call(
        "/storage/head",
        "GET",
        undefined,
        secondCookie,
        "public-workspace",
      )
    ).status,
  ).toBe(412);
  expect((await readHistory(sharma)).data).toEqual(next);
  for (const route of ["/login", "/register", "/password"])
    expect(
      (await call(route, "POST", {}, cookie, "public-workspace")).status,
    ).toBe(403);
  expect(
    (await call("/ai/generate", "POST", {}, cookie, "public-workspace")).status,
  ).toBe(400);
  expect(
    (await call("/ai/key", "GET", undefined, cookie, "public-workspace"))
      .status,
  ).toBe(200);
  const aiKey = "AQ.synthetic.profile-only-fixture-123456";
  expect(
    (await call("/ai/test", "POST", {}, cookie, "public-workspace")).status,
  ).toBe(428);
  expect(
    (
      await call(
        "/ai/key",
        "PUT",
        { key: aiKey },
        cookie,
        "public-workspace",
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  expect(
    (await call("/ai/key", "PUT", { key: aiKey }, cookie, "public-workspace"))
      .status,
  ).toBe(200);
  const keyStatus = await call(
    "/ai/key",
    "GET",
    undefined,
    cookie,
    "public-workspace",
  );
  expect(await keyStatus.json()).toEqual({ configured: true });
  expect(JSON.stringify((await readHistory(sharma)).data)).not.toContain(aiKey);
  expect((await call("/ai/key", "GET", undefined, cookie)).status).toBe(403);
  for (const endpoint of ["key", "test", "chat", "generate", "cancel"])
    expect(
      (
        await call(
          "/ai/" + endpoint,
          endpoint === "key" ? "GET" : "POST",
          endpoint === "key" ? undefined : {},
          secondCookie,
          "workspace-profile:abhishek",
        )
      ).status,
    ).toBe(403);
  expect(
    (await call("/ai/key", "DELETE", {}, cookie, "public-workspace")).status,
  ).toBe(200);
  expect(
    await (
      await call("/ai/key", "GET", undefined, cookie, "public-workspace")
    ).json(),
  ).toEqual({ configured: false });
  expect(
    (await call("/profiles/lock", "POST", {}, cookie, "public-workspace"))
      .status,
  ).toBe(200);
  expect(
    (await call("/storage/head", "GET", undefined, cookie, "public-workspace"))
      .status,
  ).toBe(401);
  expect((await readHistory(abhi)).data).toEqual(other.data);
  for (let i = 0; i < 12; i++)
    await call("/profiles/open", "POST", {
      id: "rate-limit-qa",
      password: "wrong",
    });
  expect(
    (
      await call("/profiles/open", "POST", {
        id: "rate-limit-qa",
        password: "wrong",
      })
    ).status,
  ).toBe(429);
}, 60000);
