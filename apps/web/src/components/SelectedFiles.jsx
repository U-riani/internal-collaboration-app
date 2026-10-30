import { useState } from "react";
import { Paperclip, X } from "lucide-react";

// Keep the native picker, while allowing additional selections before submission.
export function useSelectedFiles(maxFiles = Infinity) {
  const [files, setFiles] = useState([]);
  const [selectionError, setSelectionError] = useState("");

  function addFiles(event) {
    const incoming = Array.from(event.target.files || []);
    // Allow choosing the same file again after removing it.
    event.target.value = "";
    if (!incoming.length) return;

    const next = [...files];
    for (const file of incoming) {
      if (
        !next.some(
          (selected) =>
            selected.name === file.name &&
            selected.size === file.size &&
            selected.lastModified === file.lastModified,
        )
      ) {
        next.push(file);
      }
    }

    if (next.length > maxFiles) {
      setSelectionError(`You can attach up to ${maxFiles} files at once.`);
      return;
    }
    setSelectionError("");
    setFiles(next);
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, i) => i !== index));
    setSelectionError("");
  }

  function clearFiles() {
    setFiles([]);
    setSelectionError("");
  }

  return { files, addFiles, removeFile, clearFiles, selectionError };
}

// Small, reusable preview: no extra modal and no change to the native picker.
export function SelectedFiles({ files, onRemove, disabled = false, className = "" }) {
  if (!files.length) return null;

  return (
    <div className={`selected-attachments space-y-1.5 ${className}`} aria-label="Selected attachments">
      {files.map((file, index) => (
        <div
          key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
          className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
        >
          <Paperclip size={13} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
          <button
            type="button"
            className="icon-btn shrink-0 p-1"
            aria-label={`Remove ${file.name}`}
            title="Remove attachment"
            disabled={disabled}
            onClick={() => onRemove(index)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
