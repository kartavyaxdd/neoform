import { it, expect } from "vitest";
import { emptyState, startSession, type State } from "../src/domain";
import * as policy from "../src/syncPolicy";
const merge = (base: State, remote: State, local: State) =>
  (
    policy as unknown as {
      mergeThreeWay: (base: State, remote: State, local: State) => State;
    }
  ).mergeThreeWay(base, remote, local);
it("preserves remote edits and deletions when local only changed preferences", () => {
  const base = emptyState();
  base.sessions = [
    startSession("Edited remotely", []),
    startSession("Deleted remotely", []),
  ];
  base.profile = {
    name: "Base",
    experience: "New",
    goal: "Consistency",
    equipment: ["Barbell"],
    days: 3,
  };
  base.draft = startSession("Draft", []);
  base.decisions = [{ key: "decision", choice: "defer", at: 1 }];
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.settings.unit = "lb";
  remote.sessions[0].notes = "Cloud note";
  remote.sessions.pop();
  remote.profile!.name = "Remote";
  remote.draft!.notes = "Remote draft";
  remote.decisions[0].choice = "accept";
  const result = merge(base, remote, local);
  expect(result).toEqual({
    ...remote,
    settings: { ...remote.settings, unit: "lb" },
  });
});
it("propagates local deletions and retains independent additions on both devices", () => {
  const base = emptyState();
  base.sessions = [startSession("Delete locally", [])];
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.sessions = [startSession("Local addition", [])];
  remote.sessions.push(startSession("Remote addition", []));
  expect(merge(base, remote, local).sessions.map((s) => s.name)).toEqual([
    "Remote addition",
    "Local addition",
  ]);
});
it("rejects edit/delete conflicts in either direction and competing scalar edits", () => {
  const base = emptyState();
  base.sessions = [startSession("Base", [])];
  const edited = structuredClone(base),
    deleted = structuredClone(base);
  edited.sessions[0].notes = "Changed";
  deleted.sessions = [];
  expect(() => merge(base, edited, deleted)).toThrow(
    /sessions.*edit.*delet|sessions.*delet.*edit/i,
  );
  expect(() => merge(base, deleted, edited)).toThrow(
    /sessions.*edit.*delet|sessions.*delet.*edit/i,
  );
  const a = structuredClone(base),
    b = structuredClone(base);
  a.sessions[0].notes = "A";
  b.sessions[0].notes = "B";
  expect(() => merge(base, a, b)).toThrow(/notes.*both|both.*notes/i);
});
it("records a received common base and advances it to the sent snapshot despite newer local edits", () => {
  const data = emptyState(),
    box = { data, revision: 0, dirty: false, generation: 0 };
  const received = policy.receiveRemote(box, { data, revision: 3 }).box;
  expect(received).toHaveProperty("base", { data, revision: 3 });
  const sent = structuredClone(data);
  sent.settings.unit = "lb";
  const newer = structuredClone(sent);
  newer.settings.theme = "light";
  const acknowledged = (policy.acknowledge as (...args: any[]) => any)(
    { ...received, data: newer, dirty: true, generation: 2 },
    1,
    4,
    sent,
  );
  expect(acknowledged.base).toEqual({ data: sent, revision: 4 });
  expect(acknowledged.data).toEqual(newer);
  expect(acknowledged.dirty).toBe(true);
});
