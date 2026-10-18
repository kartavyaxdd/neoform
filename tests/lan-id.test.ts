import { afterEach, expect, it, vi } from "vitest";
import { uid } from "../src/domain";
afterEach(() => vi.unstubAllGlobals());
it("creates unique UUID v4 IDs on LAN HTTP without crypto.randomUUID", () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  vi.stubGlobal("crypto", { getRandomValues });
  const values = Array.from({ length: 100 }, () => uid());
  expect(new Set(values).size).toBe(100);
  for (const value of values) expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
