import { afterEach, describe, expect, it, vi } from "vitest";
import { healthDeadline } from "../src/healthOperation";
afterEach(() => vi.useRealTimers());
describe("bounded Android health operations", () => {
  it("returns a completed native operation and releases its timer", async () => {
    vi.useFakeTimers();
    await expect(healthDeadline(Promise.resolve("ready"), 1000)).resolves.toBe(
      "ready",
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects an unreturned permission callback without accepting a late result", async () => {
    vi.useFakeTimers();
    let resolve!: (v: string) => void;
    const cancelled = vi.fn();
    const result = healthDeadline(
      new Promise<string>((r) => {
        resolve = r;
      }),
      1000,
      cancelled,
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: "HEALTH_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    resolve("late");
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("preserves a native rejection without waiting for the deadline", async () => {
    vi.useFakeTimers();
    await expect(
      healthDeadline(Promise.reject(new Error("Denied")), 1000),
    ).rejects.toThrow("Denied");
    expect(vi.getTimerCount()).toBe(0);
  });
});
