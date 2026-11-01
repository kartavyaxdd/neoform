import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const windows = process.platform === "win32";
function run(binary, args, env = process.env) {
  const result = spawnSync(binary, args, {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
    shell: windows && binary.endsWith(".bat"),
  });
  if (result.status !== 0)
    throw Error(`Android release step failed: ${path.basename(binary)}`);
}
function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status) throw Error("Git release verification failed.");
  return result.stdout.trim();
}
if (git(["status", "--porcelain", "--untracked-files=no"]))
  throw Error("Commit reviewed changes before building a release APK.");
const sha = git(["rev-parse", "HEAD"]);
const toolRoot = path.join(root, ".qa-state", "android-toolchain");
const javaRoot = path.join(toolRoot, "java");
const javaHome =
  process.env.JAVA_HOME ||
  (fs.existsSync(javaRoot)
    ? path.join(javaRoot, fs.readdirSync(javaRoot)[0])
    : "");
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(toolRoot, "sdk");
if (
  !javaHome ||
  !fs.existsSync(path.join(sdk, "platforms", "android-36", "android.jar"))
)
  throw Error(
    "Install JDK 21 and Android SDK 36, then set JAVA_HOME and ANDROID_HOME.",
  );
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  NEOFORM_RELEASE_SHA: sha,
  NEOFORM_ANDROID_VERSION_CODE: git(["rev-list", "--count", "HEAD"]),
};
run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], env);
run(process.execPath, ["scripts/shell-version.mjs"], env);
fs.writeFileSync("dist/__release.json", JSON.stringify({ sha }) + "\n");
run(
  process.execPath,
  ["node_modules/@capacitor/cli/bin/capacitor", "sync", "android"],
  env,
);
// The native bridge is available only to bundled scripts, never remote frames.
const nativeHtml = "android/app/src/main/assets/public/index.html";
const csp =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'";
fs.writeFileSync(
  nativeHtml,
  fs
    .readFileSync(nativeHtml, "utf8")
    .replace(
      "<head>",
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
    ),
);
const bundled = path.join(
  toolRoot,
  "gradle",
  "gradle-8.14.3",
  "bin",
  windows ? "gradle.bat" : "gradle",
);
const gradle = fs.existsSync(bundled)
  ? bundled
  : path.join(root, "android", windows ? "gradlew.bat" : "gradlew");
run(
  gradle,
  [
    "-Djava.net.preferIPv4Stack=true",
    "-p",
    "android",
    ":app:assembleRelease",
    ":app:testReleaseUnitTest",
    "--max-workers=2",
    "--console=plain",
  ],
  env,
);

// This installation's signing identity is generated once, outside the checkout.
// Passwords are never arguments, console output, build assets or GitHub secrets.
const signing = path.join(os.homedir(), ".neoform-android-signing");
fs.mkdirSync(signing, { recursive: true, mode: 0o700 });
const identityFile = path.join(signing, "identity.json"),
  keyStore = path.join(signing, "neoform-release.jks");
if (windows) {
  const acl = spawnSync(
    "icacls",
    [
      signing,
      "/inheritance:r",
      "/grant:r",
      `${os.userInfo().username}:(OI)(CI)F`,
    ],
    { stdio: "ignore", windowsHide: true },
  );
  if (acl.status) throw Error("Could not restrict signing directory access.");
}
if (!fs.existsSync(identityFile)) {
  if (fs.existsSync(keyStore))
    throw Error(
      "Existing signing store has no matching credential record; refusing replacement.",
    );
  fs.writeFileSync(
    identityFile,
    JSON.stringify({ password: randomBytes(32).toString("hex") }),
    { mode: 0o600, flag: "wx" },
  );
}
const signingEnv = {
  ...env,
  NEOFORM_ANDROID_STORE_PASSWORD: JSON.parse(
    fs.readFileSync(identityFile, "utf8"),
  ).password,
};
if (!fs.existsSync(keyStore))
  run(
    path.join(javaHome, "bin", windows ? "keytool.exe" : "keytool"),
    [
      "-genkeypair",
      "-keystore",
      keyStore,
      "-storetype",
      "JKS",
      "-alias",
      "neoform",
      "-keyalg",
      "RSA",
      "-keysize",
      "3072",
      "-validity",
      "10000",
      "-dname",
      "CN=NEOFORM Personal Android",
      "-storepass:env",
      "NEOFORM_ANDROID_STORE_PASSWORD",
      "-keypass:env",
      "NEOFORM_ANDROID_STORE_PASSWORD",
    ],
    signingEnv,
  );
const buildTools = path.join(sdk, "build-tools", "36.0.0");
const out = path.join(root, "dist", "downloads");
fs.mkdirSync(out, { recursive: true });
const apk = path.join(out, "neoform.apk");
run(
  path.join(buildTools, windows ? "zipalign.exe" : "zipalign"),
  [
    "-f",
    "-p",
    "4",
    "android/app/build/outputs/apk/release/app-release-unsigned.apk",
    apk,
  ],
  env,
);
const java = path.join(javaHome, "bin", windows ? "java.exe" : "java");
run(
  java,
  [
    "-jar",
    path.join(buildTools, "lib", "apksigner.jar"),
    "sign",
    "--ks",
    keyStore,
    "--ks-key-alias",
    "neoform",
    "--ks-pass",
    "env:NEOFORM_ANDROID_STORE_PASSWORD",
    "--key-pass",
    "env:NEOFORM_ANDROID_STORE_PASSWORD",
    apk,
  ],
  signingEnv,
);
run(
  java,
  [
    "-jar",
    path.join(buildTools, "lib", "apksigner.jar"),
    "verify",
    "--verbose",
    apk,
  ],
  env,
);
const apkSha256 = createHash("sha256")
  .update(fs.readFileSync(apk))
  .digest("hex");
const manifest = {
  applicationId: "app.neoform.android",
  version: JSON.parse(fs.readFileSync("android/version.json", "utf8")).version,
  versionCode: Number(env.NEOFORM_ANDROID_VERSION_CODE),
  sha,
  apkSha256,
  bytes: fs.statSync(apk).size,
  url: "/downloads/neoform.apk",
};
fs.writeFileSync(
  path.join(out, "release.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(out, "neoform.apk.sha256"),
  `${apkSha256}  neoform.apk\n`,
);
console.log(
  `Signed Android APK ready: ${manifest.bytes} bytes, source ${sha}, SHA-256 ${apkSha256}`,
);
