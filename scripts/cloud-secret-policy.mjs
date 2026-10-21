import net from "node:net";
import crypto from "node:crypto";

export const MASTER_NAME = "GEMINI_KEY_MASTER";

export async function deployWithMaster({
  listSecrets,
  prepareSchema,
  deploy,
  provision = false,
  randomBytes = crypto.randomBytes,
  withInput = withMemorySecretInput,
}) {
  const existed = hasMasterSecret(await listSecrets());
  if (!existed && !provision)
    throw new Error(
      "GEMINI_KEY_MASTER missing; explicitly authorize fresh production provisioning with --provision-master.",
    );
  await prepareSchema();
  const present = hasMasterSecret(await listSecrets());
  if (existed && !present)
    throw new Error(
      "Production master disappeared during launch; refusing replacement. Restore the original secret.",
    );
  let result;
  if (present) {
    result = await deploy();
  } else {
    const entropy = randomBytes(32);
    let payload;
    try {
      payload = Buffer.from(
        JSON.stringify({ [MASTER_NAME]: entropy.toString("hex") }),
      );
      result = await withInput(payload, deploy);
    } catch {
      throw new Error(
        "Production secret provisioning/deployment failed; raw error withheld. Verify remote secret-name metadata before retrying; never rotate an existing master.",
      );
    } finally {
      entropy.fill(0);
      payload?.fill(0);
    }
  }
  if (!hasMasterSecret(await listSecrets()))
    throw new Error("Production encryption-master name verification failed.");
  return result;
}

// Windows named pipes are kernel memory, not disk files. The default ACL is
// scoped to the current user; never enable readableAll/writableAll.
export async function withMemorySecretInput(payload, consume) {
  if (process.platform !== "win32") {
    payload.fill(0);
    throw new Error(
      "Secure in-memory secret input currently requires Windows named pipes; no disk fallback.",
    );
  }
  const inputPath =
    "\\\\.\\pipe\\neoform-secret-" +
    crypto.randomBytes(16).toString("hex") +
    ".json";
  let socket;
  const server = net.createServer((connection) => {
    if (socket) {
      connection.destroy();
      return;
    }
    socket = connection;
    connection.on("error", () => {});
    connection.end(payload);
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(
        { path: inputPath, readableAll: false, writableAll: false },
        resolve,
      );
    });
    const result = await consume(inputPath);
    if (!socket)
      throw new Error(
        "Memory-only secret input was not consumed; refusing to claim provisioning success.",
      );
    return result;
  } finally {
    socket?.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    payload.fill(0);
  }
}

export function hasMasterSecret(metadata) {
  if (
    !Array.isArray(metadata) ||
    metadata.some(
      (item) =>
        !item ||
        typeof item.name !== "string" ||
        item.type !== "secret_text" ||
        Object.keys(item).some((key) => !["name", "type"].includes(key)),
    )
  )
    throw new Error(
      "Invalid secret-name metadata; no secret values are accepted.",
    );
  // Allow the existing encryption master and separate notification signing keys. Reject legacy
  // authentication bypasses and sidecar credentials even when bound as secrets.
  if (
    metadata.some(
      (item) =>
        ![
          MASTER_NAME,
          "REST_PUSH_VAPID_PUBLIC_KEY",
          "REST_PUSH_VAPID_PRIVATE_KEY",
        ].includes(item.name),
    )
  )
    throw new Error(
      "Production rejects unexpected secret bindings; inspect names only.",
    );
  return metadata.some((item) => item.name === MASTER_NAME);
}
