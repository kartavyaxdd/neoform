import { useEffect, useRef, useState } from "react";
import { request, useStore } from "./store";
import { Button, Field } from "./ui";
import { GEMINI_MODEL } from "./aiProof";
import { canUseGemini } from "./aiCoach";
export function GeminiKeySettings() {
  const publicWorkspace = !canUseGemini(useStore().user);
  const account = useStore().user?.id;
  const [key, setKey] = useState(""),
    [configured, setConfigured] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const epoch = useRef(0);
  useEffect(() => {
    if (publicWorkspace) return;
    const id = ++epoch.current,
      controller = new AbortController();
    setKey("");
    setBusy(false);
    setNotice("");
    setError("");
    setConfigured(false);
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
  async function test() {
    const id = ++epoch.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{ connected: boolean; model: string }>(
        "/ai/test",
        "POST",
        {},
      );
      if (epoch.current === id)
        setNotice(
          result.connected
            ? `Key accepted · ${result.model} available. Ask your coach to test a reply.`
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
        {configured ? "Gemini key configured." : "No Gemini key configured."}
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
          {busy ? "Saving…" : "Save Gemini key"}
        </Button>
        <Button disabled={busy || !configured} onClick={() => void remove()}>
          Remove Gemini key
        </Button>
        <Button disabled={busy || !configured} onClick={() => void test()}>
          Test connection
        </Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
