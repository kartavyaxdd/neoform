import { it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { randomUUID, webcrypto } from "node:crypto";
import path from "node:path";
it("real SQLite Durable Object alarms encrypt, retry, cancel and retire expired subscriptions", async () => {
  const keys = await webcrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    ),
    publicKey = Buffer.from(
      await webcrypto.subtle.exportKey("raw", keys.publicKey),
    ).toString("base64url"),
    privateKey = (await webcrypto.subtle.exportKey("jwk", keys.privateKey)).d;
  const client = await webcrypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ),
    clientKey = Buffer.from(
      await webcrypto.subtle.exportKey("raw", client.publicKey),
    ).toString("base64url");
  const bundle = await build({
    stdin: {
      contents:
        'export {RestAlertDevice} from "./worker/restAlerts.ts";export default {fetch(){return new Response("QA")}}',
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  const root = path.resolve(".qa-state", "rest-alarm-" + randomUUID());
  if (!root.startsWith(path.resolve(".qa-state") + path.sep))
    throw Error("Invalid QA root");
  const sends = [];
  let mode = "success";
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      resourcePersistencePath: root,
      workers: [
        {
          name: "rest-test",
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: "2026-10-01",
          durableObjects: {
            REST_ALERTS: { className: "RestAlertDevice", useSQLite: true },
          },
          bindings: {
            REST_PUSH_VAPID_PUBLIC_KEY: publicKey,
            REST_PUSH_VAPID_PRIVATE_KEY: privateKey,
          },
          outboundService: async (req) => {
            sends.push({
              host: new URL(req.url).hostname,
              encoding: req.headers.get("Content-Encoding"),
              authorization: req.headers
                .get("Authorization")
                ?.startsWith("vapid "),
              bytes: (await req.arrayBuffer()).byteLength,
            });
            if (mode === "retry") {
              mode = "success";
              return new Response("", { status: 503 });
            }
            return new Response("", { status: mode === "expired" ? 410 : 201 });
          },
        },
      ],
    }),
  );
  try {
    await mf.ready;
    const ns = await mf.getDurableObjectNamespace("REST_ALERTS"),
      stub = ns.get(ns.idFromName("synthetic-installation")),
      token = "a".repeat(64);
    const call = (op, body) =>
      stub.fetch("https://device/" + op, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Rest-Device-Token": token,
        },
        body: JSON.stringify(body),
      });
    expect(
      (
        await call("register", {
          subscription: {
            endpoint: "https://web.push.apple.com/owned-synthetic",
            expirationTime: null,
            keys: {
              p256dh: clientKey,
              auth: Buffer.alloc(16, 7).toString("base64url"),
            },
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("schedule", { version: 1, timerId: "one", delaySeconds: 1 }))
        .status,
    ).toBe(200);
    await expect.poll(() => sends.length, { timeout: 6000 }).toBe(1);
    expect(sends[0]).toMatchObject({
      host: "web.push.apple.com",
      encoding: "aes128gcm",
      authorization: true,
    });
    expect(sends[0].bytes).toBeGreaterThan(4000);
    expect(
      (
        await call("schedule", {
          version: 2,
          timerId: "cancelled",
          delaySeconds: 1,
        })
      ).status,
    ).toBe(200);
    expect((await call("cancel", { version: 3 })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1200));
    expect(sends).toHaveLength(1);
    mode = "retry";
    await call("schedule", { version: 4, timerId: "retry", delaySeconds: 1 });
    await expect.poll(() => sends.length, { timeout: 9000 }).toBe(3);
    mode = "expired";
    await call("schedule", { version: 5, timerId: "expired", delaySeconds: 1 });
    await expect.poll(() => sends.length, { timeout: 6000 }).toBe(4);
    await expect
      .poll(
        async () =>
          (
            await call("schedule", {
              version: 6,
              timerId: "gone",
              delaySeconds: 60,
            })
          ).status,
      )
      .toBe(410);
  } finally {
    await mf.dispose();
  }
}, 30000);
