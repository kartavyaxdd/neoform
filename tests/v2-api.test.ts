import { it, expect, describe } from "vitest";
import { qaTarget } from "./qa-target";
const base = qaTarget();
const input = {
  goal: "Build muscle",
  experience: "New",
  days: 2,
  minutes: 45,
  equipment: ["Dumbbell"],
  emphasis: "Balanced",
  limitation: "None",
};
const api = (path: string, body: unknown, cookie = "", origin = base) =>
  fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
// These real-Worker tests must never send a valid generation request. Provider
// availability/error handling is mocked in v2-worker; genuine generation is opt-in.
describe("provider-independent generator API", { timeout: 30000 }, () => {
  it("generator requires account auth and same origin", async () => {
    expect((await api("/api/ai/generate", input)).status).toBe(401);
    expect(
      (await api("/api/ai/generate", input, "", "http://evil.test")).status,
    ).toBe(403);
  });
  it("generator rejects malformed and arbitrary inputs before provider invocation", async () => {
    const r = await api("/api/register", {
      email: `v2-api-${crypto.randomUUID()}@example.test`,
      password: "synthetic-v2-api-passphrase",
    });
    expect(r.status).toBe(201);
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    for (const bad of [
      { ...input, prompt: "run shell" },
      { ...input, days: 100 },
      { ...input, equipment: [] },
    ])
      expect((await api("/api/ai/generate", bad, cookie)).status).toBe(400);
  });
});
