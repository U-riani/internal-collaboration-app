import {
  useEffect,
  useId,
  useRef,
  useState,
  cloneElement,
  isValidElement,
} from "react";
import { X, File, Download, LoaderCircle, Search } from "lucide-react";
import { downloadFile } from "../lib/api.js";
import { cachedAvatarImage, cachedAvatarManifest } from "../lib/avatar-cache.js";
export function Modal({ title, children, onClose, wide = false, headerIcon = null, subtitle = null, badge = null, className = "" }) {
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
      className={`modal ${wide ? "modal-wide" : ""} ${className}`.trim()}
    >
      <div className="modal-head">
        {headerIcon && <span className="modal-head-leading" aria-hidden="true">{headerIcon}</span>}
        <div className="modal-head-copy">
          <div className="modal-head-title-row">
            <h2 id={id}>{title}</h2>
            {badge && <span className="modal-head-badge" title={badge}>{badge}</span>}
          </div>
          {subtitle && <p className="modal-head-subtitle">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="icon-btn modal-close-btn"
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
// Reuse the same icon + input structure across Drive search surfaces.
// Consumers supply a scoped visual class so the search behaves like its host page.
export function SearchBar({
  className = "",
  inputClassName = "",
  ariaLabel,
  placeholder,
  value,
  onChange,
  type = "search",
  iconSize = 16,
}) {
  return (
    <label className={className}>
      <Search size={iconSize} aria-hidden="true" />
      <input
        type={type}
        className={inputClassName}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
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
export function Avatar({ name = "", small = false, photoUrl, userId, className = "", style }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const onUpdated = (event) => {
      if (event.detail?.userId === userId) setRevision((value) => value + 1);
    };
    window.addEventListener("collab:avatar-updated", onUpdated);
    return () => window.removeEventListener("collab:avatar-updated", onUpdated);
  }, [userId]);

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    setImageUrl(null);

    const loadImage = async () => {
      try {
        // An explicit null is authoritative: this person has no photo.
        // For ID-only callers, resolve a shared manifest first to avoid 404 probes.
        const source = photoUrl === undefined && userId
          ? (await cachedAvatarManifest())[userId]
          : photoUrl;
        if (!active || !source) return;
        const blob = await cachedAvatarImage(source);
        if (!active || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } catch {
        if (active) setImageUrl(null);
      }
    };
    void loadImage();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl, userId, revision]);

  return (
    <span className={["avatar", small ? "avatar-small" : "", className].filter(Boolean).join(" ")} style={style}>
      {name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")}
      {imageUrl && <img className="avatar-image" src={imageUrl} alt="" />}
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

export function prettyTime(value) {
  return value
    ? new Date(value).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    : "";
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
