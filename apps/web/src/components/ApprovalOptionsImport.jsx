import { useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { parseOptionSpreadsheet, prepareOptionImport } from "../lib/approval-option-import.js";

export function downloadApprovalOptionsTemplate() {
  // CSV opens in Excel and can be saved as XLSX by the administrator.
  const csv = "\uFEFFOption\nLaptop\nMonitor\nKeyboard\nMouse\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "approval-options-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function ApprovalOptionsImport({ fieldLabel, currentOptions, onImport, onClose }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [column, setColumn] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState("append");

  const maxColumns = rows ? Math.min(100, Math.max(...rows.map((row) => row.length), 1)) : 0;
  const summary = (() => {
    if (!rows) return null;
    try { return { ...prepareOptionImport(rows, { column, hasHeader, mode, current: currentOptions }), error: null }; }
    catch (err) { return { error: err.message }; }
  })();

  async function loadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const result = await parseOptionSpreadsheet(file);
      setFileName(file.name);
      setRows(result);
      setColumn(0);
    } catch (err) {
      setRows(null);
      setFileName("");
      setError(err.message || "Unable to read this spreadsheet.");
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    try {
      const result = prepareOptionImport(rows, { column, hasHeader, mode, current: currentOptions });
      onImport(result.options);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="approval-import-panel" aria-label={"Import options for " + fieldLabel}>
      <div className="approval-import-title">
        <div><strong>Import from Excel / CSV</strong><p>Choose a column, preview its values and confirm the import.</p></div>
        <button type="button" className="icon-btn" aria-label="Close import" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="approval-import-upload">
        <label className="btn-secondary approval-config-secondary approval-import-file">
          <Upload size={15} /> {busy ? "Reading file..." : "Choose .xlsx or .csv"}
          <input type="file" className="approval-import-file-input" accept=".xlsx,.csv" disabled={busy} onChange={loadFile} />
        </label>
        <button type="button" className="btn-secondary approval-config-secondary" onClick={downloadApprovalOptionsTemplate}>
          <Download size={15} /> Download template
        </button>
      </div>
      {fileName && <p className="approval-import-filename"><FileSpreadsheet size={15} /> {fileName} · {rows.length} populated rows</p>}
      {rows && (
        <>
          <div className="approval-import-controls">
            <label>Column
              <select className="input app-modern-select" aria-label="Import column" value={column} onChange={(event) => setColumn(Number(event.target.value))}>
                {Array.from({ length: maxColumns }, (_, index) => (
                  <option key={index} value={index}>
                    {"Column " + (index + 1) + (rows[0]?.[index] ? " · " + String(rows[0][index]).slice(0, 40) : "")}
                  </option>
                ))}
              </select>
            </label>
            <label>Import mode
              <select className="input app-modern-select" aria-label="Import mode" value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="append">Append to existing</option>
                <option value="replace">Replace existing</option>
              </select>
            </label>
          </div>
          <label className="approval-import-header">
            <input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} />
            First row contains column names (skip first row)
          </label>
          <div className="approval-import-preview">
            <strong>Preview · selected column</strong>
            <ol>
              {rows.slice(hasHeader ? 1 : 0).filter((row) => String(row[column] ?? "").trim()).slice(0, 6).map((row, i) => (
                <li key={i}>{String(row[column]).trim()}</li>
              ))}
            </ol>
          </div>
          {summary?.error ? <p className="approval-import-error" role="alert">{summary.error}</p> : (
            <p className="approval-import-summary">
              {summary.imported} new options · {summary.duplicates} duplicate rows skipped · {summary.options.length}/500 total
            </p>
          )}
          <div className="approval-import-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={Boolean(summary?.error) || busy} onClick={apply}>Import options</button>
          </div>
        </>
      )}
      {error && <p className="approval-import-error" role="alert">{error}</p>}
    </section>
  );
}
