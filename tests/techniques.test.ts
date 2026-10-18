import { expect, it } from "vitest";
import * as D from "../src/domain";
import * as T from "../src/techniques";

it("appends raw mini bouts to the activation group with explicit rest and no load invention", () => {
  const e = T.configureTechnique(D.createEntry(D.catalog[0]), "myoreps");
  e.sets[0].weight = 20;
  const next = T.appendBout(e, { weight: 20, reps: 5, rir: 2, rest: 20 });
  expect(next.sets[1]).toMatchObject({
    weight: 20,
    reps: 5,
    rir: 2,
    rest: 20,
    bout: "mini",
    groupId: e.sets[0].groupId,
    done: false,
  });
  expect(e.sets).toHaveLength(1);
  expect(() =>
    T.appendBout(e, { weight: 15, reps: 5, rir: 2, rest: 20 }),
  ).toThrow(/same load/i);
});

it.each(["drop-set", "down-set"] as const)(
  "%s requires an explicitly lower raw load, not a guessed percentage",
  (technique) => {
    const e = T.configureTechnique(
      D.createEntry(D.catalog.find((x) => x.id === "pulldown")!),
      technique,
    );
    e.sets.forEach((s) => (s.weight = 40));
    expect(() =>
      T.appendBout(e, { weight: 40, reps: 6, rir: 2, rest: 30 }),
    ).toThrow(/lower/i);
    const next = T.appendBout(e, { weight: 35, reps: 6, rir: 2, rest: 30 });
    expect(next.sets.at(-1)).toMatchObject({
      weight: 35,
      bout: technique === "drop-set" ? "drop" : "down",
    });
  },
);
it("giant sets retain a rep goal and same-load raw bouts through schema roundtrip", () => {
  const e = T.configureTechnique(D.createEntry(D.catalog[0]), "giant-set");
  e.sets[0] = { ...e.sets[0], weight: 25, reps: 12, done: true };
  const next = T.appendBout(e, { weight: 25, reps: 8, rir: 3, rest: 60 });
  expect(() =>
    T.appendBout(e, { weight: 20, reps: 8, rir: 3, rest: 60 }),
  ).toThrow(/same load/i);
  next.sets[1].done = true;
  const roundtrip = D.sessionSchema.parse(
    JSON.parse(JSON.stringify(D.startSession("QA", [next]))),
  );
  expect(T.giantProgress(roundtrip.exercises[0])).toEqual({
    reps: 20,
    goal: 30,
  });
});

it("pairs pre-exhaust isolation before an overlapping compound without changing logged sessions", () => {
  const isolation = D.createEntry(D.catalog.find((x) => x.id === "pushdown")!);
  const compound = D.createEntry(D.catalog.find((x) => x.id === "bench")!);
  const session = D.startSession("QA", [compound, isolation]);
  const paired = T.pairTechnique(
    session,
    isolation.id,
    compound.id,
    "pre-exhaust",
    D.catalog,
  );
  expect(paired.exercises.map((e) => e.id)).toEqual([
    isolation.id,
    compound.id,
  ]);
  expect(paired.exercises[0].techniqueGroup).toBe(
    paired.exercises[1].techniqueGroup,
  );
  expect(paired.exercises.every((e) => e.technique === "pre-exhaust")).toBe(
    true,
  );
  expect(session.exercises[0].technique).toBeUndefined();
  expect(() =>
    T.pairTechnique(
      session,
      compound.id,
      isolation.id,
      "pre-exhaust",
      D.catalog,
    ),
  ).toThrow(/isolation/i);
});
it("never applies straight progression to an advanced, grouped or legacy-drop context", () => {
  const e = D.createEntry(D.catalog[0]);
  expect(T.canApplyStraightProgression(e)).toBe(true);
  for (const technique of [
    "myoreps",
    "drop-set",
    "down-set",
    "giant-set",
    "tempo",
    "pre-exhaust",
    "superset",
  ] as const)
    expect(T.canApplyStraightProgression({ ...e, technique })).toBe(false);
  expect(
    T.canApplyStraightProgression({
      ...e,
      sets: [{ ...e.sets[0], kind: "drop" }],
    }),
  ).toBe(false);
});

it("manually starts one myorep activation without rewriting source or completed work", () => {
  const e = D.createEntry(D.catalog[0]);
  const before = structuredClone(e);
  const configured = T.configureTechnique(e, "myoreps");
  expect(configured.technique).toBe("myoreps");
  expect(configured.sets).toHaveLength(1);
  expect(configured.sets[0]).toMatchObject({ bout: "activation", done: false });
  expect(configured.sets[0].reps).toBeGreaterThanOrEqual(10);
  expect(configured.target).toMatchObject({ min: 10, max: 20 });
  expect(configured.sets[0].groupId).toBeTruthy();
  expect(e).toEqual(before);
  expect(() =>
    T.configureTechnique(
      { ...e, sets: [{ ...e.sets[0], done: true }] },
      "myoreps",
    ),
  ).toThrow(/logged/i);
});
it("unpairs the entire untouched group and preserves each raw load", () => {
  const a = D.createEntry(D.catalog.find((x) => x.id === "bench")!),
    b = D.createEntry(D.catalog.find((x) => x.id === "curl")!);
  const s = T.pairTechnique(
    D.startSession("QA", [a, b]),
    a.id,
    b.id,
    "superset",
    D.catalog,
  );
  const added = T.appendBout(s.exercises[0], {
    weight: 10,
    reps: 8,
    rir: 2,
    rest: 90,
  });
  expect(added.sets.at(-1)?.groupId).toBe(
    `${s.exercises[0].techniqueGroup}:${a.sets.length}`,
  );
  const unpaired = T.unpairTechnique(s, a.id);
  expect(
    unpaired.exercises.every(
      (e) => e.technique === "straight" && !e.techniqueGroup,
    ),
  ).toBe(true);
  expect(unpaired.exercises[0].sets[0].weight).toBe(a.sets[0].weight);
  s.exercises[1].sets[0].done = true;
  expect(() => T.unpairTechnique(s, a.id)).toThrow(/logged/i);
});
it("switches unlogged sequences back to genuine straight rows without stale drop kinds", () => {
  const e = T.configureTechnique(D.createEntry(D.catalog[0]), "drop-set");
  e.sets[0].weight = 20;
  const next = T.configureTechnique(
    T.appendBout(e, { weight: 15, reps: 6, rir: 2, rest: 20 }),
    "straight",
  );
  expect(
    next.sets.every(
      (s) => s.kind === "working" && s.bout === "straight" && !s.groupId,
    ),
  ).toBe(true);
  expect(
    T.canApplyStraightProgression({
      ...next,
      tempo: { eccentric: 2, pause: 1, concentric: 1 },
    }),
  ).toBe(false);
});
it("aligns paired round IDs despite unequal warmup counts", () => {
  const a = D.createEntry(D.catalog.find((x) => x.id === "bench")!),
    b = D.createEntry(D.catalog.find((x) => x.id === "curl")!);
  a.sets = [{ ...a.sets[0], id: D.uid(), kind: "warmup" }, ...a.sets];
  const paired = T.pairTechnique(
    D.startSession("QA", [a, b]),
    a.id,
    b.id,
    "superset",
    D.catalog,
  );
  expect(paired.exercises[0].sets[1].groupId).toBe(
    paired.exercises[1].sets[0].groupId,
  );
});
it("preserves completed warmups when configuring future working bouts", () => {
  const e = D.createEntry(D.catalog[0]);
  const warmup = {
    ...e.sets[0],
    id: D.uid(),
    kind: "warmup" as const,
    done: true,
  };
  e.sets = [warmup, ...e.sets];
  const next = T.configureTechnique(e, "myoreps");
  expect(next.sets[0]).toEqual(warmup);
  expect(next.sets[1].bout).toBe("activation");
});
it("allows consecutive normally-rested down sets at the same reduced load", () => {
  const e = T.configureTechnique(D.createEntry(D.catalog[0]), "down-set");
  e.sets.forEach((s) => (s.weight = 40));
  const first = T.appendBout(e, { weight: 35, reps: 10, rir: 2, rest: 120 });
  expect(
    T.appendBout(first, { weight: 35, reps: 10, rir: 2, rest: 120 }).sets.at(-1)
      ?.bout,
  ).toBe("down");
});
it("replaces irrelevant straight progression with whole-sequence guidance and no numeric target", () => {
  const e = T.configureTechnique(D.createEntry(D.catalog[0]), "myoreps");
  const raw = {
    ...D.recommend(e.exerciseId, [], D.catalog, { min: 8, max: 12 }),
    action: "load" as const,
    weight: 50,
    reps: 10,
  };
  const reviewed = T.reviewRecommendation(e, raw);
  expect(reviewed.action).toBe("hold");
  expect(reviewed.weight).toBeUndefined();
  expect(reviewed.reps).toBeUndefined();
  expect(reviewed.reason).toMatch(/whole.sequence/i);
  expect(T.reviewRecommendation(D.createEntry(D.catalog[0]), raw)).toBe(raw);
});
it("requires activation setup before appending legacy optional-metadata sequences", () => {
  const e = { ...D.createEntry(D.catalog[0]), technique: "myoreps" as const };
  expect(() =>
    T.appendBout(e, { weight: 0, reps: 5, rir: 2, rest: 30 }),
  ).toThrow(/configure/i);
});
