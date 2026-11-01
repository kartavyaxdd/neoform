import { describe, expect, it } from "vitest";
import {
  deviceFailureEvidence,
  workflowError,
} from "../scripts/android-device-evidence.mjs";

describe("isolated Android failure evidence", () => {
  it("preserves a native crash after the app process has exited", () => {
    const crash =
      "FATAL EXCEPTION: main\nProcess: app.neoform.android, PID: 1234\njava.lang.IllegalStateException: Synthetic failure\n    at app.neoform.android.MainActivity.onCreate(MainActivity.java:1)";
    const result = deviceFailureEvidence(
      "33",
      crash,
      "Synthetic emulator only",
      "Process crashed.",
    );
    expect(result).toContain(crash);
    expect(result).toContain("Android API 33");
    expect(result).toContain("Process crashed.");
  });
  it("bounds evidence and puts the crash before verbose instrument output", () => {
    const result = deviceFailureEvidence(
      "36",
      "Synthetic crash",
      "s".repeat(30000),
      "i".repeat(30000),
    );
    expect(result.length).toBeLessThanOrEqual(16000);
    expect(result.indexOf("Synthetic crash")).toBeLessThan(
      result.indexOf("s".repeat(20)),
    );
  });
  it("escapes control characters so crash text cannot inject workflow commands", () => {
    const line = workflowError("33", "Synthetic%\r\n::warning::not a command");
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain("Synthetic%25%0D%0A::warning::not a command");
    expect(() => workflowError("../evil", "x")).toThrow();
  });
});
it("retains a native abort cause within GitHub's short annotation preview", () => {
  const crash =
    "F/DEBUG: Abort message: JNI DETECTED ERROR IN APPLICATION: synthetic stale reply proxy\n" +
    "F/DEBUG: native-frame\n".repeat(2000);
  const evidence = deviceFailureEvidence(
    "33",
    crash,
    "Current WebView package: synthetic-105\n" + "noise\n".repeat(1000),
    "Process crashed after recreation",
  );
  expect(evidence.slice(0, 4000)).toContain("synthetic stale reply proxy");
  expect(evidence.slice(0, 4000)).toContain("Process crashed after recreation");
  expect(evidence.slice(0, 4000)).toContain("synthetic-105");
});
