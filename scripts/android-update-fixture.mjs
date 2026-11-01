import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Debug-signed synthetic upgrade for fresh emulators only. Never uses release keys.
const current = Number(process.env.NEOFORM_ANDROID_VERSION_CODE || "1");
if (!Number.isInteger(current) || current < 1 || current >= 2147483647)
  throw Error("Invalid emulator fixture version.");
const windows = process.platform === "win32";
const bundled = path.resolve(
  ".qa-state/android-toolchain/gradle/gradle-8.14.3/bin/gradle.bat",
);
const gradle =
  windows && fs.existsSync(bundled)
    ? bundled
    : path.resolve("android", windows ? "gradlew.bat" : "gradlew");
const result = spawnSync(
  gradle,
  [
    "-Djava.net.preferIPv4Stack=true",
    "-p",
    "android",
    ":app:assembleDebug",
    "--max-workers=2",
    "--console=plain",
  ],
  {
    env: { ...process.env, NEOFORM_ANDROID_VERSION_CODE: String(current + 1) },
    stdio: "inherit",
    windowsHide: true,
    shell: windows,
  },
);
if (result.status !== 0)
  throw Error("Synthetic update APK could not be built.");
const out = "android/app/build/generated/update-fixture";
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(
  "android/app/build/outputs/apk/debug/app-debug.apk",
  path.join(out, "neoform-update.apk"),
);
console.log(
  "Prepared a debug-signed emulator upgrade fixture; no installation performed.",
);
