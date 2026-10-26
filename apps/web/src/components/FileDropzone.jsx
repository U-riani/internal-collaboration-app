import { useState } from "react";
import { Paperclip, UploadCloud, X } from "lucide-react";

// One picker for Messages, Tasks, Drive and Approvals. The caller owns the
// selection until its associated message, task or request has been saved.
export default function FileDropzone({
  files = [],
  onChange,
  onFilesSelected,
  disabled = false,
  label = "Attachments",
  compact = false,
  maxFiles = 50,
}) {
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");

  function addFiles(incoming) {
    if (disabled) return;
    const picked = Array.from(incoming || []).filter((file) => file.size > 0);
    if (!picked.length) return;
    if (onFilesSelected) {
      onFilesSelected(picked);
      setNotice("");
      return;
    }
    const next = [...files];
    for (const file of picked) {
      if (next.some((item) =>
        item.name === file.name &&
        item.size === file.size &&
        item.lastModified === file.lastModified
      )) continue;
      if (next.length >= maxFiles) {
        setNotice(`Select up to ${maxFiles} attachments at once.`);
        break;
      }
      next.push(file);
    }
    onChange?.(next);
    if (next.length <= maxFiles && picked.length <= maxFiles - files.length)
      setNotice("");
  }

  function hasDraggedFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  return (
    <div className="space-y-2">
      <div
        className={`rounded-xl border-2 border-dashed transition-colors ${
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50/50"
        } ${disabled ? "opacity-50" : ""}`}
        onDragOver={(event) => {
          if (!disabled && hasDraggedFiles(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          if (!disabled && hasDraggedFiles(event)) {
            event.preventDefault();
            event.stopPropagation();
            addFiles(event.dataTransfer.files);
          }
          setDragging(false);
        }}
      >
        <label className={`flex cursor-pointer items-center justify-center gap-2 px-3 text-center text-sm text-slate-600 ${compact ? "py-2" : "py-5"}`}>
          <UploadCloud size={compact ? 17 : 21} className="shrink-0 text-blue-500" />
          <span>{label} — choose files or drag & drop</span>
          <input
            className="sr-only"
            type="file"
            multiple
            aria-label={label}
            disabled={disabled}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {notice && <p role="alert" className="text-xs text-red-600">{notice}</p>}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected files">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
            >
              <Paperclip size={13} className="shrink-0" />
              <span className="max-w-48 truncate" title={file.name}>{file.name}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-slate-100"
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => onChange?.(files.filter((_, i) => i !== index))}
              ><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
