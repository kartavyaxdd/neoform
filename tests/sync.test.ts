import { it, expect } from "vitest";
import { emptyState } from "../src/domain";
import { acknowledge, receiveRemote } from "../src/syncPolicy";
it("never marks newer edits clean when an earlier request returns", () => {
  const box = { data: emptyState(), revision: 4, dirty: true, generation: 2 };
  expect(acknowledge(box, 1, 5)).toEqual({ ...box, revision: 5 });
  expect(acknowledge(box, 2, 5).dirty).toBe(false);
});
it("preserves local edits when a remote revision differs and only replaces clean snapshots", () => {
  const data = emptyState();
  data.settings.unit = "lb";
  const box = { data: emptyState(), revision: 1, dirty: true, generation: 1 };
  const remote = { revision: 2, data };
  expect(receiveRemote(box, remote)).toEqual({ box, conflict: true });
  expect(
    receiveRemote({ ...box, dirty: false }, remote).box.data.settings.unit,
  ).toBe("lb");
});
