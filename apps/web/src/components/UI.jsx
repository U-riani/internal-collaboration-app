import {
  useEffect,
  useId,
  useRef,
  useState,
  cloneElement,
  isValidElement,
} from "react";
import { X, File, Download, LoaderCircle } from "lucide-react";
import { downloadFile } from "../lib/api.js";
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`modal ${wide ? "modal-wide" : ""}`}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Field({ label, children, ...props }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {isValidElement(children) ? (
        cloneElement(children, { id })
      ) : (
        <input id={id} className="input" {...props} />
      )}
    </label>
  );
}
export function ErrorBox({ error }) {
  return error ? (
    <div className="error-box" role="alert">
      {typeof error === "string" ? error : error.message}
    </div>
  ) : null;
}
export function Empty({ title, text }) {
  return (
    <div className="empty">
      <div className="empty-symbol">◇</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="animate-spin mx-auto" size={22} />
      <p>Loading…</p>
    </div>
  );
}
export function Badge({ value }) {
  return (
    <span className={`status status-${value?.toLowerCase()}`}>
      {value?.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
export function Avatar({ name = "", small = false }) {
  return (
    <span className={`avatar ${small ? "avatar-small" : ""}`}>
      {name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function prettyDate(value) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No deadline";
}
export function fileSize(n = 0) {
  return !n
    ? "0 B"
    : n >= 1048576
      ? `${(n / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;
}
export function Attachments({ items = [] }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  return (
    <>
      <div className="attachments">
        {items.map(({ file = null, ...rest }) => {
          const f = file || rest;
          return (
            <button
              key={f.id}
              type="button"
              className="attachment"
              disabled={busy === f.id}
              onClick={async () => {
                setBusy(f.id);
                setError("");
                try {
                  await downloadFile(f.id, f.originalName);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              <File size={17} />
              <span className="truncate">{f.originalName}</span>
              <small>{fileSize(f.sizeBytes)}</small>
              <Download size={15} />
            </button>
          );
        })}
      </div>
      <ErrorBox error={error} />
    </>
  );
}
