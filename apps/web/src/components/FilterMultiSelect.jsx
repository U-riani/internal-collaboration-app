import { useId, useMemo, useState } from "react";
import { Building2, FolderClosed, Search, UserRound } from "lucide-react";

/**
 * A checkbox multi-select with built-in search. Unlike a native multiple select,
 * selecting another row never clears earlier selections or requires Ctrl/Cmd.
 *
 * Controlled values and onToggle keep all existing filter logic in the parent.
 */
export default function FilterMultiSelect({
  label,
  options,
  values,
  onToggle,
  kind = "person",
}) {
  const [search, setSearch] = useState("");
  const listId = useId();
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return needle
      ? options.filter((option) =>
          option.label.toLocaleLowerCase().includes(needle),
        )
      : options;
  }, [options, search]);
  const Icon = kind === "department"
    ? Building2
    : kind === "group"
      ? FolderClosed
      : UserRound;

  return (
    <fieldset className="filter-multiselect">
      <legend className="filter-multiselect-heading">{label}</legend>
      <div className="filter-multiselect-panel">
        <label className="filter-multiselect-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="filter-multiselect-options" id={listId} role="group" aria-label={label}>
          {filtered.length ? filtered.map((option) => {
            const selected = values.includes(option.value);
            return (
              <label
                key={option.value}
                className={`filter-multiselect-option ${selected ? "is-selected" : ""}`}
              >
                <span className="filter-multiselect-icon" aria-hidden="true">
                  <Icon size={16} strokeWidth={1.8} />
                </span>
                <span className="filter-multiselect-name" title={option.label}>
                  {option.label}
                </span>
                <input
                  type="checkbox"
                  aria-label={`${label}: ${option.label}`}
                  checked={selected}
                  onChange={() => onToggle(option.value)}
                />
              </label>
            );
          }) : (
            <p className="filter-multiselect-empty">No matches found</p>
          )}
        </div>
      </div>
    </fieldset>
  );
}
