import { useEffect, useRef, useState } from "react";
import { request, useStore } from "./store";
import { Button, Field } from "./ui";
import { GEMINI_MODEL, geminiProofSchema } from "./aiProof";
import { canUseGemini } from "./aiCoach";
export function GeminiKeySettings() {
  const publicWorkspace = !canUseGemini(useStore().user);
  const account = useStore().user?.id;
  const [key, setKey] = useState(""),
    [configured, setConfigured] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState<
      "save" | "remove" | "metadata" | "reply" | null
    >(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const epoch = useRef(0);
  useEffect(() => {
    if (publicWorkspace) return;
    const id = ++epoch.current,
      controller = new AbortController();
    setKey("");
    setBusy(false);
    setOperation(null);
    setNotice("");
    setError("");
    setConfigured(null);
    void request<{ configured: boolean }>("/ai/key", "GET", undefined, {
      signal: controller.signal,
    })
      .then((status) => {
        if (epoch.current === id) setConfigured(status.configured);
      })
      .catch((e) => {
        if (epoch.current === id && !controller.signal.aborted)
          setError(e.message);
      });
    return () => {
      epoch.current++;
      controller.abort();
    };
  }, [account, publicWorkspace]);
  async function save() {
    const value = key;
    setKey("");
    setBusy(true);
    setOperation("save");
    setError("");
    setNotice("");
    const id = ++epoch.current;
    try {
      const status = await request<{ configured: boolean }>("/ai/key", "PUT", {
        key: value,
      });
      if (epoch.current === id) {
        setConfigured(status.configured);
        setNotice("Gemini key saved for this account.");
      }
    } catch (e) {
      if (epoch.current === id) setError((e as Error).message);
    } finally {
      if (epoch.current === id) setBusy(false);
    }
  }
  async function remove() {
    setKey("");
    setBusy(true);
    setOperation("remove");
    setError("");
    setNotice("");
    const id = ++epoch.current;
    try {
      const status = await request<{ configured: boolean }>(
        "/ai/key",
        "DELETE",
        {},
      );
      if (epoch.current === id) {
        setConfigured(status.configured);
        setNotice("Gemini key removed.");
      }
    } catch (e) {
      if (epoch.current === id) setError((e as Error).message);
    } finally {
      if (epoch.current === id) setBusy(false);
    }
  }
  async function test(mode: "metadata" | "reply" = "metadata") {
    const id = ++epoch.current;
    setBusy(true);
    setOperation(mode);
    setError("");
    setNotice("");
    try {
      const result = await request<{
        connected: boolean;
        model: string;
        reply?: boolean;
        proof?: unknown;
      }>("/ai/test", "POST", { mode });
      if (
        mode === "reply" &&
        (!result.reply ||
          result.model !== GEMINI_MODEL ||
          !geminiProofSchema.safeParse(result.proof).success)
      )
        throw Error(
          "The server did not confirm a real Gemini reply. Refresh the app and try Test reply again.",
        );
      if (epoch.current === id)
        setNotice(
          result.connected
            ? mode === "reply"
              ? `Reply received · ${result.model}. No workout data was sent.`
              : `Key accepted · ${result.model} available. Test reply checks actual generation.`
            : "Connection not confirmed.",
        );
    } catch (e) {
      if (epoch.current === id) setError((e as Error).message);
    } finally {
      if (epoch.current === id) setBusy(false);
    }
  }
  if (publicWorkspace) return null;
  return (
    <section className="panel">
      <h2>Gemini AI</h2>
      <p className="caption">
        Use your own Google Gemini API key with {GEMINI_MODEL}. It is encrypted
        on the server for this account, never returned or included in backups.
        Google API charges and quotas may apply. No other provider or model
        fallback is used.
      </p>
      <p aria-live="polite" aria-atomic="true">
        {configured === null
          ? error
            ? "Connection status unavailable."
            : "Checking saved connection…"
          : configured
            ? "Gemini key configured."
            : "No Gemini key configured."}
      </p>
      <Field label="Gemini API key">
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={
            configured
              ? "Enter a new key to replace it"
              : "Paste your Gemini API key"
          }
        />
      </Field>
      <div className="actions wrap">
        <Button
          variant="primary"
          disabled={busy || !/^[A-Za-z0-9_.-]{20,200}$/.test(key)}
          onClick={() => void save()}
        >
          {busy && operation === "save" ? "Saving…" : "Save Gemini key"}
        </Button>
        <Button
          disabled={busy || configured !== true}
          onClick={() => void remove()}
        >
          {busy && operation === "remove" ? "Removing…" : "Remove Gemini key"}
        </Button>
        <Button
          disabled={busy || configured !== true}
          onClick={() => void test("metadata")}
        >
          {busy && operation === "metadata"
            ? "Checking connection…"
            : "Test connection"}
        </Button>
        <Button
          disabled={busy || configured !== true}
          onClick={() => void test("reply")}
        >
          {busy && operation === "reply" ? "Testing reply…" : "Test reply"}
        </Button>
      </div>
      <p className="caption">
        Test connection checks key/model access. Test reply sends a fixed
        diagnostic with no workout data and uses one shared daily AI attempt.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {error && (
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Google AI Studio
        </a>
      )}
    </section>
  );
}
