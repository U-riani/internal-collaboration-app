import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, File, FileArchive, FileImage, FileSpreadsheet, FileText, Folder, Layers3, Presentation } from "lucide-react";
import { api, downloadDriveArchive } from "../lib/api.js";
import { ErrorBox, Loading, Modal, SelectionCheckbox } from "./UI.jsx";
import "./drive-archive-modal.css";

function typeIcon(id) {
  if (id === "images") return <FileImage size={21} />;
  if (id === "excel") return <FileSpreadsheet size={21} />;
  if (id === "presentations") return <Presentation size={21} />;
  if (id === "archives") return <FileArchive size={21} />;
  if (id === "other") return <Layers3 size={21} />;
  if (id.startsWith("ext:")) return <File size={21} />;
  return <FileText size={21} />;
}

function iconTone(id) {
  return ["images", "excel", "pdf", "word", "presentations", "archives"].includes(id)
    ? id : "other";
}

export default function DriveArchiveModal({ scope, locationName, onClose }) {
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState("");
  const options = useQuery({
    queryKey: ["drive-archive-options", scope.view, scope.spaceId, scope.parentId],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(scope)) {
        if (value) params.set(key, value);
      }
      return api(`/drive/archive/options?${params}`);
    },
    staleTime: 0,
  });
  const types = options.data?.data?.types || [];
  const selected = chosen === null ? types.map((type) => type.id) : chosen;
  const allChecked = types.length > 0 && types.every((type) => selected.includes(type.id));
  const count = types.reduce((total, type) =>
    total + (selected.includes(type.id) ? type.count : 0), 0);

  const download = useMutation({
    mutationFn: () => downloadDriveArchive(
      scope,
      allChecked ? undefined : selected,
      locationName,
    ),
    onSuccess: onClose,
    onError: (cause) => setError(cause.message || "ZIP download failed"),
  });

  function choose(id, checked) {
    setChosen(checked ? [...selected, id] : selected.filter((type) => type !== id));
    setError("");
  }

  return (
    <Modal
      title="Download files"
      badge="ZIP"
      headerIcon={<FileArchive size={22} strokeWidth={1.9} />}
      subtitle={<span className="drive-archive-context">
        <span>Folder context:</span>
        <span className="drive-archive-location"><Folder size={14} strokeWidth={2} />{locationName || "Drive"}</span>
      </span>}
      onClose={onClose}
      className="drive-archive-modal"
    >
      {options.isPending ? (
        <Loading />
      ) : (
        <div className="drive-archive-content">
          <p className="drive-archive-help">Choose which file types to include. The archive contains only files in this location.</p>
          {options.isError ? null : types.length ? (
            <div className="drive-archive-types" role="group" aria-label="File types to download">
              <label className="drive-archive-type drive-archive-type--all">
                <SelectionCheckbox checked={allChecked}
                  onChange={(event) => { setChosen(event.target.checked ? types.map((type) => type.id) : []); setError(""); }} />
                <span className="drive-archive-type-text">
                  <strong>All files</strong>
                  <span>Every file stored in this directory</span>
                </span>
                <span className="drive-archive-count">{options.data.data.totalFiles}</span>
              </label>
              {types.map((type) => (
                <label key={type.id} className="drive-archive-type">
                  <SelectionCheckbox checked={selected.includes(type.id)}
                    onChange={(event) => choose(type.id, event.target.checked)} />
                  <span className={`drive-archive-type-icon drive-archive-type-icon--${iconTone(type.id)}`} aria-hidden="true">{typeIcon(type.id)}</span>
                  <span className="drive-archive-type-text">
                    <strong>{type.label}</strong>
                    <span>{type.extensions}</span>
                  </span>
                  <span className="drive-archive-count">{type.count}</span>
                </label>
              ))}
            </div>
          ) : <p className="drive-archive-empty">There are no downloadable files directly in this location.</p>}
          <ErrorBox error={error || options.error} />
          <div className="drive-archive-footer">
            <strong className="drive-archive-selection" aria-live="polite">{count} {count === 1 ? "file" : "files"} selected</strong>
            <button type="button" className="btn-primary drive-archive-submit"
              disabled={options.isError || download.isPending || !count} onClick={() => download.mutate()}>
              <Download size={17} strokeWidth={2.2} />
              {download.isPending ? "Preparing ZIP…" : "Download ZIP"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
