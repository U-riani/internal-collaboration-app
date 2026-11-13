import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/**
 * Controlled checkbox-based select used by Approval request forms.
 * Keeps the list open while choosing multiple values; never requires Ctrl/Cmd.
 */
export default function ApprovalMultiSelect({
  label,
  options = [],
  values = [],
  onChange,
  required = false,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef(null);
  const trigger = useRef(null);
  const labelId = useId();
  const listId = useId();
  const selected = Array.isArray(values) ? values : [];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (option) => {
    onChange(selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option]);
  };
  const visible = options.filter((option) =>
    option.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <div className="field approval-multiselect-field" ref={root}>
      <span id={labelId}>{label}{required ? " *" : ""}</span>
      <div className="approval-multiselect-control">
        {selected.map((option) => (
          <span className="approval-multiselect-tag" key={option}>
            <span>{option}</span>
            <button
              type="button"
              className="approval-multiselect-remove"
              aria-label={`Remove ${option}`}
              disabled={disabled}
              onClick={() => toggle(option)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          type="button"
          ref={trigger}
          className="approval-multiselect-trigger"
          aria-labelledby={labelId}
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="true"
          disabled={disabled}
          onClick={() => setOpen((previous) => !previous)}
        >
          <span>{selected.length ? `${selected.length} selected` : "Choose options..."}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="approval-multiselect-panel" id={listId}>
          {options.length > 6 && (
            <input
              className="input approval-multiselect-search"
              type="search"
              aria-label={`Search ${label} options`}
              placeholder="Search options..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          <div className="approval-multiselect-options" role="group" aria-label={`${label} options`}>
            {visible.length ? visible.map((option, index) => {
              const checked = selected.includes(option);
              return (
                <label
                  className={`approval-multiselect-option ${checked ? "is-selected" : ""}`}
                  key={`${index}-${option}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`${label}: ${option}`}
                    checked={checked}
                    onChange={() => toggle(option)}
                  />
                  <span>{option}</span>
                  {checked && <Check size={15} aria-hidden="true" />}
                </label>
              );
            }) : <p className="approval-multiselect-empty">No options match your search</p>}
          </div>
        </div>
      )}
      <span className="approval-multiselect-count">
        {selected.length} {selected.length === 1 ? "option" : "options"} selected
      </span>
    </div>
  );
}
