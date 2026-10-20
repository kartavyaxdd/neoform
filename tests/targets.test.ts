import { it, expect } from "vitest";
import {
  createEntry,
  prepareWorkout,
  targetSchema,
  exerciseSchema,
  catalog,
  target,
  weeklyTarget,
  starterProgram,
  records,
  csvSessions,
  startSession,
  completeSession,
} from "../src/domain";
it("carries explicit template rep/effort/rest targets into the session snapshot", () => {
  const t = { ...target("bench"), min: 5, max: 8, rir: 3, rest: 180 };
  const e = createEntry(catalog[0], t);
  expect(e.target).toEqual({ min: 5, max: 8, rir: 3, rest: 180 });
  expect(e.sets[0].reps).toBe(5);
  expect(e.sets[0].rir).toBe(3);
});
it("deloads explicit targets without mutating the template", () => {
  const p = starterProgram("balanced");
  const t = p.workouts[0].exercises[0];
  const before = structuredClone(t);
  const e = createEntry(catalog[0], t, true);
  expect(e.sets).toHaveLength(2);
  expect(e.sets.every((s) => s.rir === 4)).toBe(true);
  expect(e.target?.rir).toBe(4);
  expect(t).toEqual(before);
  expect(weeklyTarget(p, 6).deload).toBe(true);
});
it("never combines convention records and guards CSV formula cells", () => {
  const a = createEntry(catalog[0]),
    b = { ...createEntry(catalog[0]), convention: "per-side" as const };
  a.sets[0] = { ...a.sets[0], weight: 60, reps: 10, done: true };
  b.sets[0] = { ...b.sets[0], weight: 100, reps: 10, done: true };
  const s = completeSession(startSession("=DANGEROUS()", [a, b]));
  const prs = records([s], catalog);
  expect(prs).toHaveLength(2);
  expect(prs.find((x) => x.convention === "per-side")?.e1rm).toBeNull();
  expect(csvSessions([s], catalog)).toContain(
    "' =DANGEROUS()".replace(" ", ""),
  );
});

it("uses an explicit first-session load reference without inventing completed effort", () => {
 const p=starterProgram('balanced'), w=p.workouts[0];
 w.exercises=[{...target('bench'),startingLoad:25}];
 const e=prepareWorkout(w,p,catalog,[])[0];
 expect(e.sets.every(s=>s.weight===25 && !s.done && s.effortReported===false)).toBe(true);
 expect(targetSchema.safeParse({...w.exercises[0],startingLoad:-1}).success).toBe(false);
 const previous={...startSession('Prior',[createEntry(catalog[0],w.exercises[0])]),phase:'accumulation' as const};
 previous.exercises[0].sets[0]={...previous.exercises[0].sets[0],done:true,weight:30};
 expect(prepareWorkout(w,p,catalog,[previous])[0].sets[0].weight).toBe(30);
 w.exercises[0].setup={label:'Different rack',execution:'Different ROM',availableLoads:[]};
 expect(prepareWorkout(w,p,catalog,[])[0].sets[0].weight).toBe(0);
});
it("keeps forearm and neck exercises distinct from biceps and core", () => {
 for(const muscle of ['Forearms','Neck']){
  const ex=exerciseSchema.parse({...catalog[0],muscle});
  expect(ex.muscle).toBe(muscle);
 }
});
