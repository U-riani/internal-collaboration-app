import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileArchive, FileSpreadsheet, FileText, Images, Layers3, Presentation } from "lucide-react";
import { api, downloadDriveArchive } from "../lib/api.js";
import { ErrorBox, Loading, Modal } from "./UI.jsx";
import "./drive-archive-modal.css";

function typeIcon(id) {
  if (id === "images") return <Images size={19} />;
  if (id === "excel") return <FileSpreadsheet size={19} />;
  if (id === "presentations") return <Presentation size={19} />;
  if (id === "archives") return <FileArchive size={19} />;
  if (id === "other") return <Layers3 size={19} />;
  return <FileText size={19} />;
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
    <Modal title="Download files" subtitle={locationName} onClose={onClose} className="drive-archive-modal">
      {options.isPending ? (
        <Loading />
      ) : (
        <div className="drive-archive-content">
          <p className="drive-archive-help">Choose which file types to include. The archive contains only files in this location.</p>
          {types.length ? (
            <div className="drive-archive-types">
              <label className="drive-archive-type drive-archive-type--all">
                <input type="checkbox" checked={allChecked}
                  onChange={(event) => { setChosen(event.target.checked ? types.map((type) => type.id) : []); setError(""); }} />
                <span className="drive-archive-type-text"><strong>All files</strong></span>
                <span className="drive-archive-count">{options.data.data.totalFiles}</span>
              </label>
              {types.map((type) => (
                <label key={type.id} className="drive-archive-type">
                  <input type="checkbox" checked={selected.includes(type.id)}
                    onChange={(event) => choose(type.id, event.target.checked)} />
                  <span className="drive-archive-type-icon">{typeIcon(type.id)}</span>
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
            <div className="drive-archive-selection">
              <strong>{count} {count === 1 ? "file" : "files"} selected</strong>
              <span>One ZIP archive</span>
            </div>
            <button type="button" className="btn-primary drive-archive-submit"
              disabled={download.isPending || !count} onClick={() => download.mutate()}>
              <Download size={16} />
              {download.isPending ? "Preparing ZIP…" : "Download ZIP"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
