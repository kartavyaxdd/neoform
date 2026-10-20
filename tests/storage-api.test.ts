import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { qaTarget } from "./qa-target";
import * as D from "../src/domain";
import {
  headerOf,
  historyDelta,
  storageHash,
  type StateHeader,
  type HistoryPart,
} from "../src/storageProtocol";
import {
  prepareHistoryMutation,
  writeHistoryMutation,
  readHistory,
  historyChanged,
  type HistoryRequest,
} from "../src/historyTransport";
const base = qaTarget(),
  password = "synthetic-storage-only-passphrase";
function isolatedDatabase() {
  // qaTarget already proves this run is owned and live. Never fall back to a
  // default Wrangler path or a personal database when locating this fixture.
  const root = realpathSync(process.env.NEOFORM_QA_RUN_DIR!),
    directory = path.join(root, "d1/v3/d1/miniflare-D1DatabaseObject");
  const files = readdirSync(directory).filter(
    (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
  );
  expect(files).toHaveLength(1);
  const file = realpathSync(path.join(directory, files[0]));
  expect(file.startsWith(root + path.sep)).toBe(true);
  return new DatabaseSync(file);
}
async function account() {
  const r = await fetch(base + "/api/register", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `storage-${crypto.randomUUID()}@example.test`,
      password,
    }),
  });
  expect(r.status).toBe(201);
  const user = (await r.json()) as { id: string };
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  const api = (path: string, method = "GET", data?: unknown) =>
    fetch(base + "/api" + path, {
      method,
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-Neoform-Account": user.id,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  return { api, user, cookie };
}
it('atomically bounds concurrent upload starts and cumulative owner staging, with cancellation',async()=>{
 const a=await account();await read(a);
 const requests=Array.from({length:8},()=>({id:crypto.randomUUID(),revision:0,header:headerOf(D.emptyState()),count:0,parts:2,checksum:'0'.repeat(64)}));
 const responses=await Promise.all(requests.map(plan=>a.api('/storage/uploads','POST',plan)));
 expect(responses.filter(r=>r.status===201)).toHaveLength(4);expect(responses.filter(r=>r.status===429)).toHaveLength(4);
 const id=requests[responses.findIndex(r=>r.status===201)].id,db=isolatedDatabase();
 try{db.prepare('INSERT INTO storage_upload_parts(owner,upload,part,hash,bytes,records) VALUES(?,?,?,?,?,?)').run('user:'+a.user.id,id,0,'0'.repeat(64),99999999,0);}finally{db.close();}
 expect((await a.api(`/storage/uploads/${id}/parts/1`,'PUT',{upserts:[],deletes:[]})).status).toBe(413);
 expect((await read(a)).data).toEqual(D.emptyState());
 expect((await a.api(`/storage/uploads/${id}`,'DELETE')).status).toBe(200);
 expect((await a.api('/storage/uploads','POST',{...requests[0],id:crypto.randomUUID()})).status).toBe(201);
},30000);
async function read(a: Awaited<ReturnType<typeof account>>) {
  const response = await a.api("/storage/head");
  expect(response.status).toBe(200);
  const head = (await response.json()) as {
    revision: number;
    header: StateHeader;
    count: number;
  };
  const sessions: D.Session[] = [];
  let after = -1;
  while (true) {
    const page = await a.api(
      `/storage/history?revision=${head.revision}&after=${after}`,
    );
    expect(page.status).toBe(200);
    const p = (await page.json()) as {
      records: { position: number; session: D.Session }[];
      next: number | null;
    };
    sessions.push(...p.records.map((r) => r.session));
    if (p.next === null) break;
    expect(p.next).toBeGreaterThan(after);
    after = p.next;
  }
  expect(sessions).toHaveLength(head.count);
  return {
    revision: head.revision,
    data: { ...head.header, sessions } as D.State,
  };
}
function fixture(n: number): D.Session {
  const e = D.createEntry(D.catalog[0]);
  e.notes = "é训练".repeat(300);
  e.sets[0].done = true;
  const s = D.completeSession(D.startSession(`Synthetic history ${n}`, [e]));
  s.notes = "λ".repeat(1500);
  s.readiness = {
    recordedAt: 1,
    fatigue: null,
    pain: null,
    context: "unknown",
    factors: [],
    muscles: [],
  };
  return s;
}
async function stage(
  a: Awaited<ReturnType<typeof account>>,
  state: D.State,
  revision: number,
  changes: HistoryPart[],
) {
  const id = crypto.randomUUID(),
    checksum = await storageHash(await Promise.all(changes.map(storageHash)));
  const r = await a.api("/storage/uploads", "POST", {
    id,
    revision,
    header: headerOf(state),
    count: state.sessions.length,
    parts: changes.length,
    checksum,
  });
  expect(r.status).toBe(201);
  return id;
}
it("migrates only the authenticated history without rewriting its revision, IDs or observations", async () => {
  const a = await account(),
    b = await account(),
    state = D.emptyState();
  state.sessions = [fixture(1), fixture(2)];
  expect(
    (await a.api("/data", "PUT", { revision: 0, data: state })).status,
  ).toBe(200);
  expect(await read(a)).toEqual({ revision: 1, data: state });
  expect(await read(a)).toEqual({ revision: 1, data: state });
  expect(await read(b)).toEqual({ revision: 0, data: D.emptyState() });
  expect((await a.api("/data")).status).toBe(426);
  expect(
    (await a.api("/data", "PUT", { revision: 1, data: D.emptyState() })).status,
  ).toBe(426);
  expect(await read(a)).toEqual({ revision: 1, data: state });
}, 30000);
it("rolls back the header, rows and receipt together if a D1 statement fails", async () => {
  const a = await account(),
    before = await read(a),
    state = D.emptyState();
  state.sessions = [fixture(0)];
  const id = state.sessions[0].id;
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  const db = isolatedDatabase();
  const trigger = "qa_failure_" + id.replaceAll("-", "");
  const mutation = {
    id: crypto.randomUUID(),
    revision: 0,
    header: headerOf(state),
    count: 1,
    changes: {
      upserts: [{ position: 0, session: state.sessions[0] }],
      deletes: [],
    },
  };
  try {
    db.exec(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON storage_history WHEN NEW.id='${id}' BEGIN SELECT RAISE(ABORT,'synthetic statement failure'); END`,
    );
    const rejected = await a.api("/storage/commit", "POST", mutation);
    expect(rejected.status).toBe(500);
    expect(await rejected.text()).not.toContain("synthetic statement failure");
    expect(await read(a)).toEqual(before);
  } finally {
    db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    db.close();
  }
  expect(
    await (await a.api("/storage/commit", "POST", mutation)).json(),
  ).toEqual({ revision: 1 });
  expect(await read(a)).toEqual({ revision: 1, data: state });
}, 30000);
it("keeps referenced custom exercises until their actual history references are explicitly replaced or deleted", async () => {
  const a = await account(),
    state = D.emptyState(),
    exercise = {
      ...D.catalog[0],
      id: "synthetic-custom-history",
      name: "Synthetic custom",
    };
  state.customExercises = [exercise];
  const s = fixture(0);
  s.exercises[0].exerciseId = exercise.id;
  state.sessions = [s];
  expect(
    (await a.api("/data", "PUT", { revision: 0, data: state })).status,
  ).toBe(200);
  await read(a);
  const next = { ...state, customExercises: [] },
    request = {
      id: crypto.randomUUID(),
      revision: 1,
      header: headerOf(next),
      count: 1,
      changes: { upserts: [], deletes: [] },
    };
  expect((await a.api("/storage/commit", "POST", request)).status).toBe(400);
  expect((await read(a)).data).toEqual(state);
  const replacement = structuredClone(s);
  replacement.exercises[0].exerciseId = D.catalog[0].id;
  expect(
    (
      await a.api("/storage/commit", "POST", {
        ...request,
        id: crypto.randomUUID(),
        changes: {
          upserts: [{ position: 0, session: replacement }],
          deletes: [],
        },
      })
    ).status,
  ).toBe(200);
  expect(await read(a)).toEqual({
    revision: 2,
    data: { ...next, sessions: [replacement] },
  });
}, 30000);
it("round-trips the client transport through D1 and recovers an actually lost commit acknowledgement", async () => {
  const a = await account(),
    calls: string[] = [];
  const api: HistoryRequest = async <T>(
    path: string,
    method?: string,
    body?: unknown,
  ) => {
    calls.push(path);
    const response = await a.api(path, method, body),
      data = (await response.json()) as { error?: string };
    if (!response.ok)
      throw Object.assign(Error(data.error), { status: response.status });
    return data as T;
  };
  const before = await readHistory(api),
    state = D.emptyState();
  state.sessions = Array.from({ length: 201 }, (_, i) => fixture(i));
  const mutation = prepareHistoryMutation(before.data, state, before.revision);
  let lost = false;
  const unreliable: HistoryRequest = async <T>(
    path: string,
    method?: string,
    body?: unknown,
  ) => {
    const result = await api<T>(path, method, body);
    if (path.endsWith("/commit") && !lost) {
      lost = true;
      throw Error("Synthetic acknowledgement loss");
    }
    return result;
  };
  await expect(writeHistoryMutation(unreliable, mutation)).rejects.toThrow(
    "acknowledgement loss",
  );
  expect(await writeHistoryMutation(api, mutation)).toEqual({ revision: 1 });
  expect(await readHistory(api)).toEqual({ revision: 1, data: state });
  const start = calls.length;
  expect(await historyChanged(api, 1)).toBe(false);
  expect(calls.slice(start)).toEqual(["/storage/revision"]);
  const next = structuredClone(state);
  next.sessions[100].notes = "Only this record changes";
  const delta = prepareHistoryMutation(state, next, 1);
  expect(delta.parts).toHaveLength(1);
  expect(delta.parts[0].upserts).toHaveLength(1);
  expect(await writeHistoryMutation(api, delta)).toEqual({ revision: 2 });
  expect(await historyChanged(api, 1)).toBe(true);
  expect(await readHistory(api)).toEqual({ revision: 2, data: next });
}, 60000);
it("rejects unbound, cross-origin and cross-account storage access before conversion", async () => {
  const a = await account(),
    b = await account();
  expect((await fetch(base + "/api/storage/head")).status).toBe(401);
  const wrong = {
    Origin: base,
    "Content-Type": "application/json",
    Cookie: a.cookie,
    "X-Neoform-Account": b.user.id,
  };
  expect(
    (await fetch(base + "/api/storage/head", { headers: wrong })).status,
  ).toBe(412);
  expect(
    (
      await fetch(base + "/api/storage/commit", {
        method: "POST",
        headers: { ...wrong, Origin: "https://foreign.example" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  // A rejected request must not upgrade either unrelated legacy account.
  expect((await a.api("/data")).status).toBe(200);
  expect((await b.api("/data")).status).toBe(200);
  expect((await a.api("/storage/not-a-route")).status).toBe(404);
  expect((await a.api("/storage/commit", "POST", {})).status).toBe(400);
  expect((await a.api("/storage/history?revision=invalid")).status).toBe(400);
  expect((await a.api("/data")).status).toBe(200);
  const state = D.emptyState();
  state.sessions = [fixture(0)];
  await read(a);
  const id = await stage(a, state, 0, [
    { upserts: [{ position: 0, session: state.sessions[0] }], deletes: [] },
  ]);
  await read(b);
  expect(
    (
      await b.api(`/storage/uploads/${id}/parts/0`, "PUT", {
        upserts: [],
        deletes: [],
      })
    ).status,
  ).toBe(404);
  expect(
    (await b.api(`/storage/uploads/${id}/commit`, "POST", {})).status,
  ).toBe(404);
  expect((await read(b)).data).toEqual(D.emptyState());
}, 30000);
it("enforces final references, counts and positions while accepting explicit deletion and reordering", async () => {
  const a = await account(),
    state = D.emptyState();
  state.sessions = [fixture(0), fixture(1), fixture(2)];
  await a.api("/data", "PUT", { revision: 0, data: state });
  await read(a);
  const commit = (next: D.State, changes: HistoryPart, revision = 1) =>
    a.api("/storage/commit", "POST", {
      id: crypto.randomUUID(),
      revision,
      header: headerOf(next),
      count: next.sessions.length,
      changes,
    });
  expect(
    (
      await commit(
        { ...state, sessions: state.sessions.slice(0, 2) },
        { upserts: [], deletes: [] },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await commit(state, {
        upserts: [{ position: 1, session: state.sessions[0] }],
        deletes: [],
      })
    ).status,
  ).toBe(400);
  const unknown = structuredClone(state.sessions[0]);
  unknown.exercises[0].exerciseId = "missing-exercise";
  expect(
    (
      await commit(state, {
        upserts: [{ position: 0, session: unknown }],
        deletes: [],
      })
    ).status,
  ).toBe(400);
  expect(await read(a)).toEqual({ revision: 1, data: state });
  const next = { ...state, sessions: [state.sessions[2], state.sessions[0]] };
  expect((await commit(next, historyDelta(state, next))).status).toBe(200);
  expect(await read(a)).toEqual({ revision: 2, data: next });
  expect((await a.api("/storage/history?revision=1&after=-1")).status).toBe(
    409,
  );
  expect((await a.api("/storage/history?revision=2&after=NaN")).status).toBe(
    400,
  );
  expect(await (await a.api("/storage/revision")).json()).toEqual({
    revision: 2,
  });
}, 30000);
it("binds immutable upload plans and parts, rejects duplicate records and wrong checksums without publishing them", async () => {
  const a = await account(),
    state = D.emptyState();
  state.sessions = [fixture(0)];
  await read(a);
  const part = {
      upserts: [{ position: 0, session: state.sessions[0] }],
      deletes: [],
    },
    parts = [part, { upserts: [], deletes: [] }];
  const id = await stage(a, state, 0, parts),
    plan = {
      id,
      revision: 0,
      header: headerOf(state),
      count: 1,
      parts: 2,
      checksum: await storageHash(await Promise.all(parts.map(storageHash))),
    };
  expect((await a.api("/storage/uploads", "POST", plan)).status).toBe(201);
  expect(
    (await a.api("/storage/uploads", "POST", { ...plan, count: 2 })).status,
  ).toBe(422);
  expect(
    (await a.api(`/storage/uploads/${id}/parts/0`, "PUT", part)).status,
  ).toBe(200);
  expect(
    (await a.api(`/storage/uploads/${id}/parts/0`, "PUT", part)).status,
  ).toBe(200);
  expect(
    (await a.api(`/storage/uploads/${id}/parts/0`, "PUT", parts[1])).status,
  ).toBe(422);
  expect(
    (await a.api(`/storage/uploads/${id}/parts/1`, "PUT", part)).status,
  ).toBe(422);
  expect(
    (await a.api(`/storage/uploads/${id}/parts/1`, "PUT", parts[1])).status,
  ).toBe(200);
  expect(
    (await a.api(`/storage/uploads/${id}/commit`, "POST", {})).status,
  ).toBe(200);
  expect((await read(a)).data).toEqual(state);
  const bad = {
    ...plan,
    id: crypto.randomUUID(),
    revision: 1,
    parts: 1,
    checksum: "0".repeat(64),
  };
  expect((await a.api("/storage/uploads", "POST", bad)).status).toBe(201);
  expect(
    (
      await a.api(`/storage/uploads/${bad.id}/parts/0`, "PUT", {
        upserts: [],
        deletes: [],
      })
    ).status,
  ).toBe(200);
  expect(
    (await a.api(`/storage/uploads/${bad.id}/commit`, "POST", {})).status,
  ).toBe(409);
  expect(await read(a)).toEqual({ revision: 1, data: state });
}, 30000);
it("commits at most one concurrent revision and never lets a reused operation ID overwrite the winner", async () => {
  const a = await account();
  await read(a);
  const left = {
    id: crypto.randomUUID(),
    revision: 0,
    header: headerOf(D.emptyState()),
    count: 0,
    changes: { upserts: [], deletes: [] },
  };
  const right = {
    ...left,
    header: {
      ...left.header,
      settings: { ...left.header.settings, unit: "lb" },
    },
  };
  const attempts = await Promise.all([
    a.api("/storage/commit", "POST", left),
    a.api("/storage/commit", "POST", right),
  ]);
  expect(attempts.filter((r) => r.status === 200)).toHaveLength(1);
  expect(attempts.filter((r) => r.status === 422)).toHaveLength(1);
  const winner = attempts[0].status === 200 ? left : right;
  expect(await read(a)).toEqual({
    revision: 1,
    data: { ...winner.header, sessions: [] },
  });
  const next = { ...winner, id: crypto.randomUUID(), revision: 1 };
  expect((await a.api("/storage/commit", "POST", next)).status).toBe(200);
  expect(await (await a.api("/storage/commit", "POST", winner)).json()).toEqual(
    { revision: 1 },
  );
  expect((await read(a)).revision).toBe(2);
}, 30000);
it("keeps incomplete uploads invisible and commits/restores history larger than the old ceiling exactly", async () => {
  const a = await account(),
    restored = await account(),
    state = D.emptyState();
  state.sessions = Array.from({ length: 600 }, (_, i) => fixture(i));
  expect(
    new TextEncoder().encode(JSON.stringify(state)).length,
  ).toBeGreaterThan(D.MAX_BACKUP);
  expect(D.stateSchema.safeParse(state).success).toBe(false);
  expect(D.historyStateSchema.safeParse(state).success).toBe(true);
  const before = await read(a),
    parts: HistoryPart[] = [];
  for (let i = 0; i < state.sessions.length; i += 50)
    parts.push({
      upserts: state.sessions
        .slice(i, i + 50)
        .map((session, j) => ({ position: i + j, session })),
      deletes: [],
    });
  const id = await stage(a, state, before.revision, parts);
  expect(
    (await a.api(`/storage/uploads/${id}/parts/0`, "PUT", parts[0])).status,
  ).toBe(200);
  expect(await read(a)).toEqual(before);
  expect(
    (await a.api(`/storage/uploads/${id}/commit`, "POST", {})).status,
  ).toBe(409);
  for (let i = 1; i < parts.length; i++)
    expect(
      (await a.api(`/storage/uploads/${id}/parts/${i}`, "PUT", parts[i]))
        .status,
    ).toBe(200);
  const commit = await a.api(`/storage/uploads/${id}/commit`, "POST", {});
  expect(commit.status).toBe(200);
  expect(await commit.json()).toEqual({ revision: 1 });
  expect(
    await (await a.api(`/storage/uploads/${id}/commit`, "POST", {})).json(),
  ).toEqual({ revision: 1 });
  expect(await read(a)).toEqual({ revision: 1, data: state });
  const restoreId = await stage(restored, state, 0, parts);
  for (let i = 0; i < parts.length; i++)
    expect(
      (
        await restored.api(
          `/storage/uploads/${restoreId}/parts/${i}`,
          "PUT",
          parts[i],
        )
      ).status,
    ).toBe(200);
  expect(
    (await restored.api(`/storage/uploads/${restoreId}/commit`, "POST", {}))
      .status,
  ).toBe(200);
  expect((await read(restored)).data).toEqual(state);
}, 60000);
it("rejects stale transfers and reuses an operation receipt without replaying over newer work", async () => {
  const a = await account();
  await read(a);
  const state = D.emptyState();
  state.sessions = [fixture(0)];
  const parts = [
    { upserts: [{ position: 0, session: state.sessions[0] }], deletes: [] },
  ];
  const id = await stage(a, state, 0, parts);
  expect(
    (await a.api(`/storage/uploads/${id}/parts/0`, "PUT", parts[0])).status,
  ).toBe(200);
  const direct = {
    id: crypto.randomUUID(),
    revision: 0,
    header: headerOf(D.emptyState()),
    count: 0,
    changes: { upserts: [], deletes: [] },
  };
  expect(await (await a.api("/storage/commit", "POST", direct)).json()).toEqual(
    { revision: 1 },
  );
  expect(
    (await a.api(`/storage/uploads/${id}/commit`, "POST", {})).status,
  ).toBe(409);
  const newer = {
    ...direct,
    id: crypto.randomUUID(),
    revision: 1,
    header: {
      ...direct.header,
      settings: { ...direct.header.settings, unit: "lb" },
    },
  };
  expect(await (await a.api("/storage/commit", "POST", newer)).json()).toEqual({
    revision: 2,
  });
  expect(await (await a.api("/storage/commit", "POST", direct)).json()).toEqual(
    { revision: 1 },
  );
  expect(
    (
      await a.api("/storage/commit", "POST", {
        ...direct,
        header: newer.header,
      })
    ).status,
  ).toBe(422);
  const final = await read(a);
  expect(final.revision).toBe(2);
  expect(final.data.sessions).toEqual([]);
  expect(final.data.settings.unit).toBe("lb");
}, 30000);
