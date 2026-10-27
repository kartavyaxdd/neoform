import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, ListOrdered } from "lucide-react";
import * as D from "./domain";
import { exerciseGroups, moveGroup, type Removal } from "./workoutActions";
import { ExerciseThumbnail } from "./ExerciseThumbnail";
export function SwipeRow({
  children,
  label,
  remove,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  remove: () => void;
  disabled?: boolean;
}) {
  const [offset, setOffset] = useState(0),
    suppressClick = useRef(false),
    gesture = useRef<{
      x: number;
      y: number;
      id: number;
      horizontal?: boolean;
    } | null>(null);
  return (
    <div
      className="swipe-shell"
      onClickCapture={(e) => {
        if (!suppressClick.current) return;
        e.preventDefault();
        e.stopPropagation();
        suppressClick.current = false;
      }}
      onPointerDown={(e) => {
        suppressClick.current = false;
        if (
          disabled ||
          (e.target as HTMLElement).closest(
            "select,a,textarea,[data-drag-handle],[data-horizontal-scroll],.swipe-delete",
          )
        )
          return;
        gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        const dx = e.clientX - g.x,
          dy = e.clientY - g.y;
        if (!g.horizontal && Math.abs(dy) > 12) {
          gesture.current = null;
          return;
        }
        if (dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          g.horizontal = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (g.horizontal) setOffset(Math.max(-120, Math.min(0, dx)));
      }}
      onPointerCancel={() => {
        gesture.current = null;
        setOffset(0);
      }}
      onPointerUp={(e) => {
        if (gesture.current?.horizontal) {
          suppressClick.current = true;
          e.preventDefault();
          if (e.clientX - gesture.current.x <= -72) remove();
        }
        gesture.current = null;
        setOffset(0);
      }}
    >
      {!disabled && (
        <button
          type="button"
          className="swipe-delete"
          aria-label={label}
          onClick={remove}
        >
          Remove
        </button>
      )}
      <div
        className="swipe-content"
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
export function UndoRemoval({
  undo,
  restore,
}: {
  undo: { item: Removal; until: number } | null;
  restore: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!undo) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [undo]);
  return undo && now < undo.until ? (
    <div className="undo-removal" role="status">
      Removed from this workout{" "}
      <button type="button" className="btn" onClick={restore}>
        Undo
      </button>
    </div>
  ) : null;
}
export function ExerciseQueue({
  session,
  exercises,
  onChange,
  onRemove,
  onSelect,
  onSaveOrder,
  renderDetail,
}: {
  session: D.Session;
  exercises: D.Exercise[];
  onChange: (s: D.Session) => void;
  onRemove?: (id: string) => void;
  onSelect?: (id: string) => void;
  onSaveOrder?: () => Promise<boolean>;
  renderDetail?: (group: D.Entry[]) => ReactNode;
}) {
  const [savingOrder, setSavingOrder] = useState(false),
    [orderMessage, setOrderMessage] = useState("");
  const groups = exerciseGroups(session),
    drag = useRef<{
      id: string;
      x: number;
      y: number;
      ready: boolean;
      timer: ReturnType<typeof setTimeout>;
      target?: string;
    } | null>(null),
    [dragging, setDragging] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (drag.current) clearTimeout(drag.current.timer);
    },
    [],
  );
  return (
    <div className="exercise-queue">
      <p className={renderDetail ? "sr-only" : "caption"}>
        Hold a handle to drag.{" "}
        {onRemove
          ? "Swipe left to remove. Today’s order changes immediately."
          : "Use Move up or down as a keyboard alternative. Save the program to apply this order."}
      </p>
      {groups.map((group, i) => {
        const id = group[0].id,
          name = group
            .map(
              (e) =>
                exercises.find((x) => x.id === e.exerciseId)?.name ??
                "Exercise",
            )
            .join(" + "),
          done = group
            .flatMap((e) => e.sets)
            .filter((t) => t.kind !== "warmup" && t.done).length,
          total = group
            .flatMap((e) => e.sets)
            .filter((t) => t.kind !== "warmup").length;
        const NameTag = onSelect ? "button" : "span";
        return (
          <SwipeRow
            key={id}
            label={`Remove ${name}`}
            remove={() => onRemove?.(id)}
            disabled={!onRemove}
          >
            <div data-queue-id={id}>
              <div
                className={"queue-row " + (dragging === id ? "dragging" : "")}
              >
                <button
                  type="button"
                  className="queue-handle icon-button"
                  data-drag-handle
                  aria-label={`Drag ${name}`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const g = {
                      id,
                      x: e.clientX,
                      y: e.clientY,
                      ready: false,
                      timer: setTimeout(() => {
                        g.ready = true;
                        setDragging(id);
                      }, 250),
                    };
                    drag.current = g;
                  }}
                  onPointerMove={(e) => {
                    const g = drag.current;
                    if (!g) return;
                    if (!g.ready) {
                      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) {
                        clearTimeout(g.timer);
                        drag.current = null;
                      }
                      return;
                    }
                    const target = document
                      .elementsFromPoint(e.clientX, e.clientY)
                      .map((x) => x.closest<HTMLElement>("[data-queue-id]"))
                      .find(Boolean);
                    if (target) g.target = target.dataset.queueId;
                    const sheet = e.currentTarget.closest(".modal");
                    if (sheet) {
                      const box = sheet.getBoundingClientRect();
                      if (e.clientY > box.bottom - 60) sheet.scrollBy(0, 12);
                      if (e.clientY < box.top + 60) sheet.scrollBy(0, -12);
                    }
                  }}
                  onPointerUp={() => {
                    const g = drag.current;
                    if (g) {
                      clearTimeout(g.timer);
                      if (g.ready && g.target)
                        onChange(moveGroup(session, g.id, g.target));
                    }
                    drag.current = null;
                    setDragging(null);
                  }}
                  onPointerCancel={() => {
                    if (drag.current) clearTimeout(drag.current.timer);
                    drag.current = null;
                    setDragging(null);
                  }}
                >
                  <GripVertical size={19} />
                </button>
                <NameTag
                  {...(onSelect ? { type: "button" as const } : {})}
                  className="queue-name"
                  onClick={onSelect ? () => onSelect(id) : undefined}
                >
                  <span className="queue-title-line">
                    {exercises.find((e) => e.id === group[0].exerciseId) && (
                      <ExerciseThumbnail
                        exercise={exercises.find(
                          (e) => e.id === group[0].exerciseId,
                        )!}
                      />
                    )}
                    <b>{name}</b>
                  </span>
                  <small>
                    {done} / {total} completed
                    {group[0].target
                      ? ` · ${group[0].target.min}–${group[0].target.max} reps · ${group[0].target.rir} RIR`
                      : ""}
                    {group.length > 1 ? " · linked group" : ""}
                  </small>
                </NameTag>
                <div className="queue-move">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${name} up`}
                    disabled={i === 0}
                    onClick={() =>
                      onChange(moveGroup(session, id, groups[i - 1][0].id))
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${name} down`}
                    disabled={i === groups.length - 1}
                    onClick={() =>
                      onChange(moveGroup(session, id, groups[i + 1][0].id))
                    }
                  >
                    ↓
                  </button>
                </div>
              </div>
              {renderDetail?.(group)}
            </div>
          </SwipeRow>
        );
      })}
      {onSaveOrder && (
        <button
          type="button"
          className="btn wide"
          disabled={savingOrder}
          aria-busy={savingOrder}
          onClick={async () => {
            setSavingOrder(true);
            setOrderMessage("");
            try {
              setOrderMessage(
                (await onSaveOrder())
                  ? "Order saved for future workouts."
                  : "Order was not saved. Check the sync or account warning and try again.",
              );
            } catch (e) {
              setOrderMessage((e as Error).message);
            } finally {
              setSavingOrder(false);
            }
          }}
        >
          <ListOrdered size={17} /> Save order for future workouts
        </button>
      )}
      {orderMessage && (
        <p role="status" className="caption">
          {orderMessage}
        </p>
      )}
    </div>
  );
}
