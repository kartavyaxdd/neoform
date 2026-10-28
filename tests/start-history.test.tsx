import { describe, expect, it, vi } from "vitest";
import * as D from "../src/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const fixture = vi.hoisted(() => ({
  snapshot: {} as any,
  hooks: [] as any[],
  cursor: 0,
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<any>("react");
  return {
    ...actual,
    useState: (initial: any) => {
      const index = fixture.cursor++;
      if (!(index in fixture.hooks))
        fixture.hooks[index] =
          typeof initial === "function" ? initial() : initial;
      return [
        fixture.hooks[index],
        (next: any) => {
          fixture.hooks[index] =
            typeof next === "function" ? next(fixture.hooks[index]) : next;
        },
      ];
    },
    useEffect: () => {},
    useMemo: (fn: any) => fn(),
    useRef: (initial: any) => ({ current: initial }),
  };
});
vi.mock("../src/store", () => ({
  useStore: () => fixture.snapshot,
  deviceSaveAcknowledged: () => undefined,
  change: (fn: any) => {
    fixture.snapshot = {
      ...fixture.snapshot,
      box: { ...fixture.snapshot.box, data: fn(fixture.snapshot.box.data) },
    };
  },
  saveChange: async (fn: any) => {
    fixture.snapshot = {
      ...fixture.snapshot,
      box: { ...fixture.snapshot.box, data: fn(fixture.snapshot.box.data) },
    };
    return true;
  },
  request: vi.fn(),
  initialize: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  sync: vi.fn(),
  resolveConflict: vi.fn(),
  exportPendingCopies: vi.fn(() => []),
  clearLocal: vi.fn(),
  lockProfile: vi.fn(),
  openProfile: vi.fn(),
}));
vi.mock("../src/restAlerts", () => ({
  useRestAlerts: () => ({ armed: false }),
  useRestAlertState: () => ({}),
  claimRestTimer: vi.fn(),
  cancelRestAlertForSwitch: vi.fn(),
  enableRestAlerts: vi.fn(),
  disableRestAlerts: vi.fn(),
  testRestAlert: vi.fn(),
}));
import App from "../src/App";
import { SessionLogger } from "../src/CompactLogger";

function find(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
function render() {
  fixture.cursor = 0;
  return App();
}
function setup() {
  const data = D.emptyState();
  data.profile = {
    name: "Synthetic UI audit",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell"],
    days: 3,
  };
  data.programs = [D.starterProgram("balanced")];
  fixture.snapshot = {
    user: { id: "synthetic-audit" },
    ready: true,
    status: "Synced",
    box: { data, dirty: false, revision: 0 },
  };
  fixture.hooks = [];
  vi.stubGlobal("localStorage", { getItem: () => "train", setItem: vi.fn() });
  vi.stubGlobal("window", { scrollTo: vi.fn() });
  return data;
}
describe("Synthetic product UI audit reproductions", () => {
  it("starts from an equivalent refreshed snapshot without mistaking new references for new history", () => {
    const data = setup(),
      program = data.programs[0],
      workout = program.workouts[0];
    const screen = render();
    find(screen, (n) => n.type?.name === "WorkoutHome").props.start(
      workout,
      program,
    );
    const preview = fixture.hooks[1].content;
    fixture.snapshot.box.data = structuredClone(fixture.snapshot.box.data);
    render();
    preview.props.start(
      D.prepareWorkout(workout, program, D.catalog, [], "Intermediate"),
    );
    expect(fixture.snapshot.box.data.draft?.name).toBe(workout.name);
  });
  it("preview Start preserves a draft which arrived after opening the preview", () => {
    const data = setup(),
      program = data.programs[0],
      workout = program.workouts[0];
    const screen = render();
    const home = find(screen, (n) => n.type?.name === "WorkoutHome");
    home.props.start(workout, program);
    const originalPreview = fixture.hooks[1].content;
    const remoteDraft = D.startSession("Synthetic other-device workout", [
      D.createEntry(D.catalog[1]),
    ]);
    fixture.snapshot.box.data = {
      ...fixture.snapshot.box.data,
      draft: remoteDraft,
    };
    render();
    originalPreview.props.start(
      D.prepareWorkout(workout, program, D.catalog, [], "Intermediate"),
    );
    expect(fixture.snapshot.box.data.draft.id).toBe(remoteDraft.id);
    expect(fixture.snapshot.box.data.draft.name).toBe(remoteDraft.name);
    expect(
      fixture.snapshot.box.data.draft.exercises.some(
        (entry: D.Entry) => entry.id === remoteDraft.exercises[0].id,
      ),
    ).toBe(true);
  });
  it("history editor permits actual historical set additions", () => {
    setup();
    fixture.cursor = 0;
    fixture.hooks = [];
    const session = D.startSession("Synthetic backfill", [
      D.createEntry(D.catalog[0]),
    ]);
    const tree = SessionLogger({
      session,
      exercises: D.catalog,
      unit: "kg",
      history: true,
      setSession: vi.fn(),
      remove: vi.fn(),
    });
    const add = find(tree, (n) => n.props?.variant === "ghost add-set");
    expect(session.exercises[0].sets).toHaveLength(3);
    expect(add.props.disabled).toBe(false);
  });
  it("actual HistoryEditor form submits on logger tab and Undo clicks", async () => {
    setup();
    vi.stubGlobal("localStorage", {
      getItem: () => "history",
      setItem: vi.fn(),
    });
    const root = render();
    find(root, (n) => n.type?.name === "History").props.backfill();
    const editor = fixture.hooks[1].content;
    const session = D.startSession("Synthetic history", [
      D.createEntry(D.catalog[0]),
      D.createEntry(D.catalog[1]),
    ]);
    for (const entry of session.exercises)
      for (const set of entry.sets) set.done = true;
    fixture.hooks = [];
    fixture.cursor = 0;
    const html = renderToStaticMarkup(
      createElement(editor.type, { ...editor.props, session }),
    );
    const controls = [...html.matchAll(/<button\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => /role="tab"|set-type-button|complete-set/.test(tag));
    expect(controls.length).toBeGreaterThan(3);
    expect(controls.every((tag) => /type="button"/.test(tag))).toBe(true);
  });
});
