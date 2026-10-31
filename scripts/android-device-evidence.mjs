// Only the disposable emulator launched by android-emulator-qa.mjs supplies these
// buffers. Never collect logs from a connected personal phone or another listener.
export function deviceFailureEvidence(api, crash, system, instrumentation) {
  if (!["33", "36"].includes(api)) throw Error("Unsupported Android QA API.");
  return [
    `Android API ${api} isolated device failure`,
    "Crash buffer:",
    (crash || "No crash buffer was returned.").slice(-8000),
    "System errors / WebView provider:",
    (system || "No system diagnostic returned.").slice(-4000),
    "Instrumentation:",
    (instrumentation || "No instrumentation result returned.").slice(-3500),
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
