import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const api = process.argv[2];
if (!["33", "36"].includes(api))
  throw Error("Specify isolated Android API 33 or 36.");
const sdk =
  process.env.ANDROID_HOME || path.resolve(".qa-state/android-toolchain/sdk");
const windows = process.platform === "win32";
const base = path.resolve(`.qa-state/android-emulator-${api}`);
fs.mkdirSync(base, { recursive: true });
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  ANDROID_AVD_HOME: path.join(base, "avds"),
  ANDROID_USER_HOME: path.join(base, "user"),
};
fs.mkdirSync(env.ANDROID_AVD_HOME, { recursive: true });
fs.mkdirSync(env.ANDROID_USER_HOME, { recursive: true });
const adb = path.join(sdk, "platform-tools", windows ? "adb.exe" : "adb");
const serial = "emulator-5556",
  name = `neoform-qa-${api}`;
function run(binary, args, options = {}) {
  const r = spawnSync(binary, args, {
    encoding: "utf8",
    env,
    windowsHide: true,
    timeout: 120000,
    shell: windows && binary.endsWith(".bat"),
    ...options,
  });
  if (r.status !== 0) {
    fs.writeFileSync(
      path.join(base, "operation-error.log"),
      `${r.stdout ?? ""}\n${r.stderr ?? ""}`,
    );
    console.error(
      (r.stderr || r.stdout || "Android operation timed out")
        .split("\n")
        .slice(-30)
        .join("\n"),
    );
    throw Error(
      `Android QA operation failed: ${path.basename(binary)} ${args[0]}`,
    );
  }
  return r.stdout;
}
if (run(adb, ["devices"]).includes(serial))
  throw Error(
    "QA emulator port already occupied; refusing to claim an existing device.",
  );
const cliRoots = [
  "cmdline-tools/latest/bin",
  "cmdline-tools/bootstrap/cmdline-tools/bin",
];
const avdmanager = cliRoots
  .map((p) => path.join(sdk, p, windows ? "avdmanager.bat" : "avdmanager"))
  .find((p) => fs.existsSync(p));
if (!avdmanager) throw Error("Android command-line tools not found.");
run(
  avdmanager,
  [
    "create",
    "avd",
    "--force",
    "--name",
    name,
    "--package",
    `system-images;android-${api};google_apis;x86_64`,
    "--path",
    path.join(base, "device"),
  ],
  { input: "no\n" },
);
const log = fs.openSync(path.join(base, "emulator.log"), "w");
const emulator = spawn(
  path.join(sdk, "emulator", windows ? "emulator.exe" : "emulator"),
  [
    "-avd",
    name,
    "-port",
    "5556",
    "-no-window",
    "-no-audio",
    "-no-boot-anim",
    "-no-snapshot",
    "-gpu",
    "swiftshader",
    "-memory",
    "2048",
    ...(process.env.NEOFORM_QA_SOFTWARE_EMULATOR === "1"
      ? ["-accel", "off"]
      : []),
  ],
  { env, windowsHide: true, stdio: ["ignore", log, log] },
);
let booted = false;
try {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline && emulator.exitCode === null) {
    const r = spawnSync(
      adb,
      ["-s", serial, "shell", "getprop", "sys.boot_completed"],
      { env, encoding: "utf8", windowsHide: true, timeout: 5000 },
    );
    if (r.status === 0 && r.stdout.trim() === "1") {
      booted = true;
      break;
    }
    await delay(2000);
  }
  if (!booted) {
    console.error(
      fs
        .readFileSync(path.join(base, "emulator.log"), "utf8")
        .split("\n")
        .slice(-40)
        .join("\n"),
    );
    throw Error(
      "Isolated emulator did not boot within five minutes; inspect its QA log. No physical device was used.",
    );
  }
  console.log(`Android API ${api} booted on owned ${serial}.`);
  run(adb, [
    "-s",
    serial,
    "install",
    "-r",
    "android/app/build/outputs/apk/debug/app-debug.apk",
  ]);
  run(adb, [
    "-s",
    serial,
    "install",
    "-r",
    "android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
  ]);
  const result = run(adb, [
    "-s",
    serial,
    "shell",
    "am",
    "instrument",
    "-w",
    "-r",
    "app.neoform.android.test/androidx.test.runner.AndroidJUnitRunner",
  ]);
  fs.writeFileSync(path.join(base, "instrumentation.log"), result);
  if (
    !/OK \(\d+ tests?\)/.test(result) ||
    /FAILURES|INSTRUMENTATION_FAILED/.test(result)
  ) {
    console.error(result);
    throw Error("Android instrumented tests failed.");
  }
  console.log(result.match(/OK \(\d+ tests?\)/)[0]);
} finally {
  if (emulator.exitCode === null) {
    spawnSync(adb, ["-s", serial, "emu", "kill"], {
      env,
      windowsHide: true,
      stdio: "ignore",
      timeout: 10000,
    });
    emulator.kill();
  }
  fs.closeSync(log);
}
