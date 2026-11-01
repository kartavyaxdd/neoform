// Only the disposable emulator launched by android-emulator-qa.mjs supplies these
// buffers. Never collect logs from a connected personal phone or another listener.
export function deviceFailureEvidence(api, crash, system, instrumentation) {
  if (!["33", "36"].includes(api)) throw Error("Unsupported Android QA API.");
  const important = (crash || "")
    .split("\n")
    .filter((line) =>
      /Abort message:|JNI DETECTED|Fatal signal|FATAL EXCEPTION|Process:|Caused by:|pid:.*tid:/.test(
        line,
      ),
    )
    .slice(-16)
    .join("\n");
  return [
    `Android API ${api} isolated device failure`,
    "Crash cause:",
    (important || crash || "No crash buffer was returned.").slice(0, 1500),
    "Instrumentation outcome:",
    (instrumentation || "No instrumentation result returned.").slice(-1200),
    "WebView provider:",
    (system || "No system diagnostic returned.").slice(0, 1000),
    "Crash buffer:",
    (crash || "No crash buffer was returned.").slice(-6500),
    "System errors:",
    (system || "No system diagnostic returned.").slice(-3000),
  ]
    .join("\n")
    .slice(0, 16000);
}
export function workflowError(api, evidence) {
  if (!["33", "36"].includes(api)) throw Error("Unsupported Android QA API.");
  const escaped = evidence
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  return `::error title=Android API ${api} device failure::${escaped}`;
}
