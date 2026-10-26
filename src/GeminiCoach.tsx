import { useEffect, useRef, useState } from "react";
import { request, useStore } from "./store";
import {
  buildCoachContext,
  canUseGemini,
  coachReplySchema,
  type CoachFocus,
  type CoachReply,
} from "./aiCoach";
import { geminiProofSchema } from "./aiProof";
import { GeminiKeySettings } from "./GeminiKeySettings";
import { AiWizard } from "./AiWizard";
import { Button, Field } from "./ui";
type Message = { role: "user" | "assistant"; text: string; reply?: CoachReply };
export function GeminiCoach({ focus }: { focus?: CoachFocus }) {
  const store = useStore(),
    [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [generate, setGenerate] = useState(false);
  const pending = useRef<{ id: string; controller: AbortController } | null>(
    null,
  );
  function cancel() {
    const job = pending.current;
    pending.current = null;
    if (job) {
      job.controller.abort();
      void request("/ai/cancel", "POST", { requestId: job.id }).catch(() => {});
    }
    setBusy(false);
  }
  useEffect(() => {
    setMessages([]);
    setQuestion("");
    setError("");
    return () => {
      const job = pending.current;
      pending.current = null;
      if (job) {
        job.controller.abort();
        void request("/ai/cancel", "POST", { requestId: job.id }).catch(
          () => {},
        );
      }
    };
  }, [store.user?.id]);
  async function ask(text = question) {
    if (busy || text.trim().length < 3) return;
    setError("");
    const id = crypto.randomUUID(),
      controller = new AbortController();
    pending.current = { id, controller };
    setBusy(true);
    const timeout = setTimeout(() => {
      if (pending.current?.id === id) {
        cancel();
        setError("Gemini timed out. Try again when connected.");
      }
    }, 125000);
    try {
      const context = buildCoachContext(store.box.data, Date.now(), focus);
      const result = await request<{ reply: unknown; proof: unknown }>(
        "/ai/chat",
        "POST",
        {
          question: text.trim(),
          context,
          conversation: messages
            .slice(-4)
            .map(({ role, text }) => ({ role, text: text.slice(0, 2000) })),
        },
        { signal: controller.signal, headers: { "X-Neoform-Generation": id } },
      );
      const reply = coachReplySchema.parse(result.reply);
      geminiProofSchema.parse(result.proof);
      if (pending.current?.id !== id) return;
      setMessages((m) => [
        ...m,
        { role: "user", text: text.trim() },
        { role: "assistant", text: reply.answer, reply },
      ]);
      setQuestion("");
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          (e as Error).name === "ZodError"
            ? "Gemini returned an invalid reply. Try again."
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timeout);
      if (pending.current?.id === id) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  if (!canUseGemini(store.user)) return <p>Unlock Sharma to use Gemini.</p>;
  if (generate) return <AiWizard close={() => setGenerate(false)} />;
  return (
    <div className="gemini-coach">
      <div className="gemini-intro">
        <span className="eyebrow">GEMINI · YOUR TRAINING</span>
        <h3>A second opinion, grounded in your log.</h3>
        <p className="caption">
          Shares a bounded snapshot of this profile’s recent training and
          current program with Google when you ask. Profile name and private
          notes are omitted. Replies stay in this sheet; chat and generation
          share the server’s daily AI allowance.
        </p>
      </div>
      {focus && (
        <div className="panel">
          <b>{focus.title}</b>
          <p>{focus.reason}</p>
        </div>
      )}
      <div className="actions wrap">
        <Button
          disabled={busy}
          onClick={() =>
            void ask(
              focus
                ? "Explain the selected recommendation and what evidence or uncertainty matters."
                : "Review my current program and recent training. What should I keep, and what needs more evidence?",
            )
          }
        >
          {focus ? "Explain recommendation" : "Review my program"}
        </Button>
        <Button disabled={busy} onClick={() => setGenerate(true)}>
          Generate a program
        </Button>
      </div>
      <div className="gemini-messages" aria-live="polite" aria-busy={busy}>
        {messages.map((m, i) => (
          <article className={`gemini-message ${m.role}`} key={i}>
            <b>{m.role === "user" ? "You" : "Gemini"}</b>
            <p>{m.text}</p>
            {m.reply && (
              <>
                <p className="caption">Next check: {m.reply.nextCheck}</p>
                {(m.reply.uncertainties.length > 0 ||
                  m.reply.sourceIds.length > 0) && (
                  <details>
                    <summary>Evidence &amp; uncertainty</summary>
                    <ul>
                      {m.reply.uncertainties.map((u, j) => (
                        <li key={j}>{u}</li>
                      ))}
                    </ul>
                    <p className="caption">
                      Log references:{" "}
                      {m.reply.sourceIds
                        .map((id) => {
                          const session = store.box.data.sessions.find(
                            (s) => s.id === id,
                          );
                          const program = store.box.data.programs.find(
                            (p) => p.id === id,
                          );
                          return session
                            ? `${session.date} · ${session.name}`
                            : (program?.name ?? "Earlier saved workout");
                        })
                        .join("; ") || "No saved references cited"}
                    </p>
                  </details>
                )}
              </>
            )}
          </article>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <Field label="Ask your coach">
          <textarea
            maxLength={1500}
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What should I focus on next workout?"
          />
        </Field>
        <div className="actions">
          <Button
            variant="primary"
            disabled={busy || question.trim().length < 3}
            type="submit"
          >
            {busy ? "Thinking…" : "Ask Gemini"}
          </Button>
          {busy && <Button onClick={cancel}>Cancel</Button>}
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      <details className="panel">
        <summary>Gemini connection</summary>
        <GeminiKeySettings />
      </details>
    </div>
  );
}
