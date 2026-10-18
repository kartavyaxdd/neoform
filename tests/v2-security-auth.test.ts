import { it, expect } from "vitest";
import { equalAuthorization } from "../scripts/sidecar-auth.mjs";
it("handles nonASCII equal-character-length bearer input without throwing", () => {
  expect(equalAuthorization("\u00e9".repeat(71), "Bearer " + "a".repeat(64))).toBe(
    false,
  );
  expect(
    equalAuthorization("Bearer " + "a".repeat(64), "Bearer " + "a".repeat(64)),
  ).toBe(true);
});
it.each([undefined, null, 1, {}, [], ["Bearer a"]])(
  "rejects non-string headers (%j) without throwing",
  (value) => {
    expect(equalAuthorization(value, "Bearer synthetic")).toBe(false);
  },
);

it("handles repeated malformed synthetic HTTP authorization and remains available", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    const ok = equalAuthorization(
      req.headers.authorization,
      "Bearer " + "a".repeat(64),
    );
    res.writeHead(ok ? 200 : 401);
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    for (const auth of ["\u00e9".repeat(71), "Bearer bad", "\u00e9".repeat(71)])
      expect(
        (
          await fetch(`http://127.0.0.1:${port}`, {
            headers: { Authorization: auth },
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await fetch(`http://127.0.0.1:${port}`, {
          headers: { Authorization: "Bearer " + "a".repeat(64) },
        })
      ).status,
    ).toBe(200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

