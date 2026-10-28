import {
  cloneElement,
  createContext,
  isValidElement,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft } from "lucide-react";
export function Button({
  children,
  onClick,
  variant = "",
  disabled = false,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      type={type}
      className={"btn " + variant}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {isValidElement<{ "aria-label"?: string }>(children)
        ? cloneElement(children, { "aria-label": label })
        : children}
    </label>
  );
}
export function Num({
  label,
  value,
  onChange,
  min = 0,
  max = 2000,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = useState(String(Number(value.toFixed(2))));
  useEffect(() => setText(String(Number(value.toFixed(2)))), [value]);
  return (
    <input
      aria-label={label}
      type="number"
      inputMode={step < 1 ? "decimal" : "numeric"}
      enterKeyHint="next"
      onFocus={(event) => event.currentTarget.select()}
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (
          e.target.value !== "" &&
          Number.isFinite(n) &&
          n >= min &&
          n <= max &&
          (step < 1 || Number.isInteger(n))
        )
          onChange(n);
      }}
      onBlur={() => setText(String(Number(value.toFixed(2))))}
    />
  );
}
const SheetContext = createContext<{
  host: HTMLDialogElement | null;
  setChildren: React.Dispatch<React.SetStateAction<number>>;
} | null>(null);

export function SheetNavigation({
  pages,
  title,
  render,
  close,
  back,
  presentation,
  depth = 0,
}: {
  pages: string[];
  title: (page: string) => string;
  render: (page: string) => ReactNode;
  close: () => void;
  back: () => void;
  presentation: (page: string) => "screen" | "sheet";
  depth?: number;
}) {
  const page = pages[depth];
  return (
    <Modal
      title={title(page)}
      close={depth ? back : close}
      presentation={presentation(page)}
    >
      {render(page)}
      {depth + 1 < pages.length && (
        <SheetNavigation
          pages={pages}
          title={title}
          render={render}
          close={close}
          back={back}
          presentation={presentation}
          depth={depth + 1}
        />
      )}
    </Modal>
  );
}

export function Modal({
  title,
  children,
  close,
  back,
  footer,
  presentation = "sheet",
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  back?: () => void;
  footer?: ReactNode;
  presentation?: "screen" | "sheet";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const parent = useContext(SheetContext);
  const [host, setHost] = useState<HTMLDialogElement | null>(null);
  const attach = useCallback((node: HTMLDialogElement | null) => {
    ref.current = node;
    setHost(node);
  }, []);
  const [childCount, setChildren] = useState(0);
  const root = parent?.host ?? host;
  const register = parent?.setChildren;
  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (register) register((n) => n + 1);
    else dialog?.showModal();
    return () => {
      if (register) register((n) => n - 1);
      else dialog?.close();
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    };
  }, [register]);
  useLayoutEffect(() => {
    if (!root?.open) return;
    const view = root.querySelector<HTMLElement>(".modal-view:not([hidden])");
    const heading = view?.querySelector("h2[id]");
    if (heading) root.setAttribute("aria-labelledby", heading.id);
    root.classList.toggle(
      "screen-modal",
      view?.dataset.presentation === "screen",
    );
    if (view && !view.contains(document.activeElement))
      view.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
  });
  const view = (
    <SheetContext.Provider value={{ host: root, setChildren }}>
      <section
        className="modal-view"
        hidden={childCount > 0}
        data-presentation={presentation}
        aria-labelledby={titleId}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={parent || back ? "Back" : "Close dialog"}
            data-sheet-close
            onClick={back ?? close}
          >
            {parent || back || presentation === "screen" ? (
              <ChevronLeft size={23} />
            ) : (
              <X size={20} />
            )}
          </button>
        </div>
        <div className="modal-body">
          <Suspense
            fallback={
              <p className="sheet-loading" role="status">
                Opening…
              </p>
            }
          >
            {children}
          </Suspense>
        </div>
        {footer && <div className="modal-foot">{footer}</div>}
      </section>
    </SheetContext.Provider>
  );
  if (parent) return root ? createPortal(view, root) : null;
  return (
    <dialog
      ref={attach}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        ref.current
          ?.querySelector<HTMLButtonElement>(
            ".modal-view:not([hidden]) [data-sheet-close]",
          )
          ?.click();
      }}
    >
      {view}
    </dialog>
  );
}
