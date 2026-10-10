import { it, expect } from "vitest";
import * as D from "../src/domain";
it("derives rest from its deadline, handles elapsed time jumps and never goes negative", () => {
  const timer = { endAt: 100000, remaining: 90, paused: false };
  expect(D.restRemaining(timer, 10000)).toBe(90);
  expect(D.restRemaining(timer, 11001)).toBe(89);
  expect(D.restRemaining(timer, 95000)).toBe(5);
  expect(D.restRemaining(timer, 120000)).toBe(0);
});
it("keeps paused time stable regardless of page or wall clock", () => {
  expect(
    D.restRemaining({ endAt: 100000, remaining: 47, paused: true }, 900000),
  ).toBe(47);
  expect(D.restRemaining(null, 900000)).toBe(0);
});
