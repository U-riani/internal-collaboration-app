import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/** Searchable single selection for imported option lists with more than 25 rows. */
export default function ApprovalSearchSelect({ label, options = [], value = "", onChange, required = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef(null);
  const buttonRef = useRef(null);
  const labelId = useId();
  const listId = useId();
  const visible = options.filter((option) => option.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  useEffect(() => {
    if (!open) return;
    function outside(event) { if (!root.current?.contains(event.target)) setOpen(false); }
    function escape(event) { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div className="field approval-search-select" ref={root}>
      <span id={labelId}>{label}{required ? " *" : ""}</span>
      <div className="approval-search-select-control">
        <button ref={buttonRef} type="button" aria-labelledby={labelId} aria-expanded={open} aria-controls={listId}
          className="approval-search-select-trigger" onClick={() => setOpen((current) => !current)}>
          <span>{value || "Choose..."}</span><ChevronDown size={16} />
        </button>
        {Boolean(value) && !required && <button type="button" className="approval-person-remove"
          aria-label={"Clear " + label} onClick={() => onChange("")}><X size={14} /></button>}
      </div>
      {open && (
        <div className="approval-search-select-panel" id={listId}>
          <label className="approval-person-search">
            <Search size={15} aria-hidden="true" />
            <input type="search" aria-label={"Search " + label + " options"} autoFocus value={search}
              onChange={(event) => setSearch(event.target.value)} placeholder="Search options..." />
          </label>
          <div className="approval-search-select-list">
            {visible.length ? visible.map((option) => (
              <button type="button" className={"approval-search-select-option" + (value === option ? " is-selected" : "")}
                key={option} aria-label={"Select " + label + ": " + option}
                onClick={() => { onChange(option); setOpen(false); }}>
                <span>{option}</span>{value === option && <Check size={15} />}
              </button>
            )) : <p className="approval-person-empty">No matching options</p>}
          </div>
        </div>
      )}
      {required && !value && <span className="approval-person-count">Select an option</span>}
    </div>
  );
}
