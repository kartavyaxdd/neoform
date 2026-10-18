import { writeFile } from "node:fs/promises";
const base = "http://localhost:8787";
const r = await fetch(base + "/api/register", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "v2-provider-" + crypto.randomUUID() + "@example.test",
    password: "synthetic-provider-proof-passphrase",
  }),
});
if (r.status !== 201) throw new Error("QA registration failed " + r.status);
const cookie = r.headers.get("set-cookie").split(";")[0];
const started = Date.now();
const input = {
  goal: "Build muscle",
  experience: "New",
  days: 2,
  minutes: 45,
  equipment: ["Dumbbell"],
  emphasis: "Balanced",
  limitation: "None",
};
const res = await fetch(base + "/api/ai/generate", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify(input),
});
const data = await res.json();
await writeFile(
  "evidence/v2/provider-probe.json",
  JSON.stringify(
    { status: res.status, elapsedMs: Date.now() - started, ...data },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    status: res.status,
    elapsedMs: Date.now() - started,
    proof: data.proof,
    error: data.error,
  }),
);
if (!res.ok) process.exitCode = 1;
