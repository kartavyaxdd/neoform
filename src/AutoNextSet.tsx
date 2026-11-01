import { useEffect, useRef, useState } from "react";
import { useStore, saveChange } from "./store";
import { Native, isAndroid } from "./native";
import { useHealthState } from "./healthConnect";
import { recoveryEstimate } from "./healthRecovery";
import {
  automaticReduction,
  applyAutomaticReduction,
  undoAutomaticReduction,
  type AutoReduction,
} from "./healthTraining";
import type { NextSetReview } from "./useNextSetReview";
import { canonical } from "./coachingEvidence";
import { displayLoad, catalog } from "./domain";
export function AutoNextSet({
  entryId,
  review,
  blocked,
}: {
  entryId?: string;
  review: NextSetReview | null;
  blocked: boolean;
}) {
  const store = useStore(),
    health = useHealthState();
  const [applied, setApplied] = useState<AutoReduction | null>(null),
    [message, setMessage] = useState(""),
    [focusVersion, setFocusVersion] = useState(0);
  const latest = useRef({ store, health, review, entryId, blocked });
  latest.current = { store, health, review, entryId, blocked };
  const busy = useRef(false),
    seen = useRef("");
  useEffect(() => {
    const blur = () => setFocusVersion((v) => v + 1);
    window.addEventListener("focusout", blur);
    return () => window.removeEventListener("focusout", blur);
  }, []);
  const event = [
    store.user?.id,
    store.box.data.draft?.id,
    entryId,
    review?.advice.basis,
    review?.advice.kind,
    review?.checked,
    focusVersion,
    blocked,
  ].join("|");
  useEffect(() => {
    if (!isAndroid() || busy.current || seen.current === event) return;
    seen.current = event;
    const current = latest.current;
    const focused = document.activeElement;
    if (
      current.blocked ||
      focused?.matches("input,textarea,select,[contenteditable=true]") ||
      !current.health.controls?.autoReduce ||
      !current.entryId ||
      !current.review?.checked
    )
      return;
    const state = current.store.box.data,
      session = state.draft;
    if (!session) return;
    const proposal = automaticReduction(
      state,
      session,
      current.entryId,
      recoveryEstimate(current.health.snapshot),
      true,
    );
    if (!proposal) return;
    const owner = current.store.user?.id;
    busy.current = true;
    void (async () => {
      try {
        // Reserve before editing; a crash/reload/Undo must never apply this exercise twice.
        const reservation = await Native.healthReserveReduction({
          session: proposal.sessionId,
          entry: proposal.entryId,
          undo: {
            sessionId: proposal.sessionId,
            entryId: proposal.entryId,
            setId: proposal.setId,
            from: proposal.from,
            to: proposal.to,
          },
        });
        if (!reservation.reserved) return;
        let changed = false;
        const saved = await saveChange((state) => {
          const l = latest.current;
          if (
            l.store.user?.id !== owner ||
            !l.health.controls?.autoReduce ||
            l.blocked ||
            document.activeElement?.matches(
              "input,textarea,select,[contenteditable=true]",
            ) ||
            !state.draft
          )
            return state;
          const stillEligible = automaticReduction(
            state,
            state.draft,
            proposal.entryId,
            recoveryEstimate(l.health.snapshot),
            l.review?.checked === true,
          );
          if (!stillEligible || stillEligible.basis !== proposal.basis)
            return state;
          const next = applyAutomaticReduction(state, proposal);
          changed = next !== state;
          return next;
        });
        if (latest.current.store.user?.id !== owner) return;
        if (changed && saved) {
          setApplied(proposal);
          setMessage("");
        } else if (changed)
          setMessage(
            "The automatic change could not be saved. Review the next set manually.",
          );
      } catch {
        if (latest.current.store.user?.id === owner)
          setMessage(
            "Automatic adjustment unavailable. Your assigned targets remain under your control.",
          );
      } finally {
        busy.current = false;
      }
    })();
  }, [event]);
  useEffect(() => {
    setApplied(null);
    setMessage("");
  }, [store.user?.id, store.box.data.draft?.id]);
  const persisted = health.controls?.undo;
  const undoCandidate =
    applied ??
    (persisted && persisted.sessionId === store.box.data.draft?.id
      ? { ...persisted, basis: "" }
      : null);
  const state = store.box.data,
    entry = state.draft?.exercises.find((e) => e.id === undoCandidate?.entryId),
    exercise =
      entry &&
      [...catalog, ...state.customExercises].find(
        (e) => e.id === entry.exerciseId,
      );
  const visible =
    undoCandidate &&
    entry?.sets.some(
      (t) =>
        t.id === undoCandidate.setId &&
        !t.done &&
        canonical(t) === canonical(undoCandidate.to),
    );
  return (
    <>
      {message && (
        <p className="caption" role="status">
          {message}
        </p>
      )}
      {visible && (
        <div className="auto-next-set" role="status">
          <span>
            Next load adjusted to{" "}
            {Number(
              displayLoad(
                undoCandidate!.to.weight,
                entry!.convention ?? exercise?.convention ?? "total",
                state.settings.unit,
              ).toFixed(2),
            )}{" "}
            {state.settings.unit} · confirmed miss and lower recovery signals.
          </span>
          <button
            className="btn"
            aria-label="Undo load change"
            onClick={() =>
              void saveChange((s) =>
                undoAutomaticReduction(s, undoCandidate!),
              ).then((saved) => {
                if (saved) setApplied(null);
                else
                  setMessage(
                    "Undo could not be saved. Review the current row.",
                  );
              })
            }
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
