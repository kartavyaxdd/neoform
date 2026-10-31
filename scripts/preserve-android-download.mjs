import fs from "node:fs";
import { createHash } from "node:crypto";
const base = "https://neoform-bca721354a.kartavya-neoform.workers.dev";
const response = await fetch(base + "/downloads/release.json", {
  cache: "no-store",
  signal: AbortSignal.timeout(20000),
});
if (!response.ok || !response.headers.get("content-type")?.includes("json"))
  throw Error(
    "Published Android manifest unavailable; refusing to remove an existing download with a web-only deployment. Stage a signed APK first.",
  );
const manifest = await response.json();
if (
  manifest.applicationId !== "app.neoform.android" ||
  !/^[a-f0-9]{40}$/.test(manifest.sha) ||
  !/^[a-f0-9]{64}$/.test(manifest.apkSha256) ||
  manifest.url !== "/downloads/neoform.apk" ||
  !Number.isInteger(manifest.bytes) ||
  manifest.bytes < 1000 ||
  manifest.bytes > 25 * 1024 * 1024
)
  throw Error("Published Android manifest is invalid.");
const download = await fetch(base + manifest.url, {
  cache: "no-store",
  signal: AbortSignal.timeout(90000),
});
if (!download.ok) throw Error("Published APK unavailable.");
const buffer = Buffer.from(await download.arrayBuffer());
if (
  buffer.length !== manifest.bytes ||
  buffer[0] !== 0x50 ||
  buffer[1] !== 0x4b ||
  createHash("sha256").update(buffer).digest("hex") !== manifest.apkSha256
)
  throw Error("Published APK checksum or size mismatch.");
fs.mkdirSync("dist/downloads", { recursive: true });
fs.writeFileSync("dist/downloads/neoform.apk", buffer);
fs.writeFileSync(
  "dist/downloads/release.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
fs.writeFileSync(
  "dist/downloads/neoform.apk.sha256",
  `${manifest.apkSha256}  neoform.apk\n`,
);
console.log(
  `Preserved published Android APK from source ${manifest.sha}. Its own manifest remains authoritative.`,
);
