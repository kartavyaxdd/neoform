import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  useId,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
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
export function Modal({
  title,
  children,
  close,
  footer,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog?.open && !dialog.contains(document.activeElement))
      dialog
        .querySelector<HTMLElement>("input,select,textarea,button")
        ?.focus();
  }, [title]);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={close}
      aria-labelledby={titleId}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  );
}
