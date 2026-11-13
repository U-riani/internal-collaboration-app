import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Avatar } from "./UI.jsx";

/**
 * Directory-backed person field. Values are user IDs; only explicit form data
 * is changed. This does not modify the request's approval workflow.
 */
export default function ApprovalPersonSelect({
  label,
  value,
  mode = "single",
  people = [],
  required = false,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef(null);
  const toggleButton = useRef(null);
  const listId = useId();
  const labelId = useId();
  const multiple = mode === "multiple";
  const ids = multiple
    ? (Array.isArray(value) ? value : [])
    : (typeof value === "string" && value ? [value] : []);
  const byId = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const visible = people.filter((person) => (
    (person.displayName || person.email || "").toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  ));

  useEffect(() => {
    if (!open) return;
    function outside(event) { if (!root.current?.contains(event.target)) setOpen(false); }
    function escape(event) {
      if (event.key === "Escape") { setOpen(false); toggleButton.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = (id) => {
    if (!multiple) { onChange(id === value ? "" : id); setOpen(false); return; }
    if (ids.includes(id)) onChange(ids.filter((item) => item !== id));
    else if (ids.length < 100) onChange([...ids, id]);
  };
  return (
    <div className="field approval-person-field" ref={root}>
      <span id={labelId}>{label}{required ? " *" : ""}</span>
      <div className="approval-person-control">
        {ids.map((id) => {
          const person = byId.get(id);
          const displayName = person?.displayName || person?.email || "Unavailable employee";
          return (
            <span key={id} className="approval-person-chip">
              <Avatar small name={displayName} userId={id} photoUrl={person?.avatarUrl} />
              <span>{displayName}</span>
              <button type="button" className="approval-person-remove" aria-label={"Remove " + displayName}
                onClick={() => toggle(id)}><X size={12} /></button>
            </span>
          );
        })}
        <button type="button" className="approval-person-trigger" ref={toggleButton}
          aria-labelledby={labelId} aria-expanded={open} aria-controls={listId}
          aria-haspopup="true" aria-required={required}
          onClick={() => setOpen((previous) => !previous)}>
          <span>{ids.length ? (multiple ? ids.length + " selected" : "Change person") : "Choose " + (multiple ? "people" : "a person") + "..."}</span>
          <ChevronDown size={16} />
        </button>
      </div>
      {open && (
        <div className="approval-person-dropdown" id={listId}>
          <label className="approval-person-search">
            <Search size={15} aria-hidden="true" />
            <input type="search" aria-label={"Search " + label} placeholder="Search employees..." value={search}
              onChange={(event) => setSearch(event.target.value)} autoFocus />
          </label>
          <div className="approval-person-list" role="group" aria-label={label + " employees"}>
            {visible.length ? visible.map((person) => {
              const checked = ids.includes(person.id);
              return (
                <label className={"approval-person-option" + (checked ? " is-selected" : "")} key={person.id}>
                  <Avatar small name={person.displayName} userId={person.id} photoUrl={person.photoUrl} />
                  <span>{person.displayName || person.email}</span>
                  <input type={multiple ? "checkbox" : "radio"} name={listId}
                    aria-label={label + ": " + (person.displayName || person.email)}
                    checked={checked} onChange={() => toggle(person.id)} />
                  {checked && <Check size={14} aria-hidden="true" />}
                </label>
              );
            }) : <p className="approval-person-empty">{people.length ? "No employees match" : "No active employees available"}</p>}
          </div>
        </div>
      )}
      <span className="approval-person-count">
        {required && !ids.length ? "Select at least one employee" :
          multiple ? ids.length + (ids.length === 1 ? " person selected" : " people selected") :
            ids.length ? "1 person selected" : "No person selected"}
      </span>
    </div>
  );
}
