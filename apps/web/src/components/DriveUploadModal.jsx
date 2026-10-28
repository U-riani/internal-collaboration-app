import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { api, uploadFileWithProgress } from "../lib/api.js";
import { fileSize, Modal } from "./UI.jsx";
import "./DriveUploadModal.css";

const writableAccess = new Set(["OWNER", "MANAGER", "EDITOR", "EDITOR_DELETE"]);

function fileAppearance(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["xlsx", "xls", "xlsm", "csv"].includes(ext))
    return { Icon: FileSpreadsheet, tone: "sheet" };
  if (ext === "pdf") return { Icon: FileText, tone: "pdf" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return { Icon: FileArchive, tone: "archive" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return { Icon: FileImage, tone: "image" };
  if (["mp4", "mov", "webm", "avi"].includes(ext))
    return { Icon: FileVideo, tone: "video" };
  return { Icon: File, tone: "document" };
}

export default function DriveUploadModal({
  onClose,
  onUploaded,
  spaceId,
  initialParentId,
  initialName,
}) {
  const [entries, setEntries] = useState([]);
  const [tab, setTab] = useState("upload");
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [destination, setDestination] = useState({
    parentId: initialParentId,
    name: initialName || "Drive",
  });
  const [browseId, setBrowseId] = useState(initialParentId);
  const [browseData, setBrowseData] = useState(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [transferSpeed, setTransferSpeed] = useState(0);
  const picker = useRef(null);
  const sequence = useRef(0);
  const active = useRef(null);
  const skipped = useRef(new Set());
  const closed = useRef(false);
  const runningRef = useRef(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (tab !== "drive") return undefined;
    let ignore = false;
    const params = new URLSearchParams();
    if (spaceId) params.set("spaceId", spaceId);
    if (browseId) params.set("parentId", browseId);
    setBrowseLoading(true);
    setBrowseError("");
    api("/drive?" + params.toString())
      .then((data) => {
        if (!ignore) setBrowseData(data);
      })
      .catch((reason) => {
        if (!ignore) {
          setBrowseData(null);
          setBrowseError(reason.message);
        }
      })
      .finally(() => {
        if (!ignore) setBrowseLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [tab, spaceId, browseId]);

  function addFiles(files) {
    if (!files || !files.length) return;
    const incoming = Array.from(files).map((file) => ({
      id: ++sequence.current,
      file,
      status: file.size ? "queued" : "error",
      loaded: 0,
      message: file.size ? "" : "Empty files cannot be uploaded",
    }));
    setEntries((previous) => [...previous, ...incoming]);
    setError("");
    setTab("upload");
  }

  function updateEntry(id, patch) {
    if (closed.current) return;
    setEntries((previous) =>
      previous.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  function removeEntry(entry) {
    skipped.current.add(entry.id);
    if (active.current?.id === entry.id && entry.status === "uploading") {
      active.current.controller.abort();
    }
    setEntries((previous) => previous.filter((item) => item.id !== entry.id));
  }

  async function uploadSelected() {
    if (runningRef.current) return;
    const batch = entries.filter(
      (entry) => entry.status === "queued" || (entry.status === "error" && entry.file.size),
    );
    if (!batch.length) return;
    runningRef.current = true;
    setRunning(true);
    setError("");
    for (const entry of batch) {
      if (closed.current || skipped.current.has(entry.id)) continue;
      const controller = new AbortController();
      active.current = { id: entry.id, controller };
      const started = Date.now();
      updateEntry(entry.id, { status: "uploading", loaded: 0, message: "" });
      setTransferSpeed(0);
      try {
        const uploaded = await uploadFileWithProgress(entry.file, {
          signal: controller.signal,
          onProgress: (loaded) => {
            updateEntry(entry.id, { loaded: Math.min(loaded, entry.file.size) });
            const elapsed = (Date.now() - started) / 1000;
            if (!closed.current && elapsed > 0.3) setTransferSpeed(loaded / elapsed);
          },
        });
        // Once the file is stored, linking it to Drive must finish to avoid
        // leaving a successfully uploaded file without a Drive entry.
        active.current = { id: entry.id, controller: null };
        updateEntry(entry.id, { status: "saving", loaded: entry.file.size });
        await api("/drive", {
          method: "POST",
          body: JSON.stringify({
            name: entry.file.name,
            fileId: uploaded.id,
            parentId: destination.parentId,
            spaceId,
          }),
        });
        updateEntry(entry.id, { status: "done", loaded: entry.file.size });
        onUploaded?.();
      } catch (reason) {
        if (controller.signal.aborted || reason.name === "AbortError") {
          updateEntry(entry.id, { status: "cancelled", loaded: 0, message: "Upload cancelled" });
        } else {
          updateEntry(entry.id, { status: "error", loaded: 0, message: reason.message });
        }
      } finally {
        active.current = null;
      }
    }
    runningRef.current = false;
    if (!closed.current) {
      setRunning(false);
      setTransferSpeed(0);
    }
  }

  function close() {
    closed.current = true;
    active.current?.controller?.abort();
    onClose();
  }

  function handleDrop(event) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (!running) addFiles(event.dataTransfer.files);
  }

  const waiting = entries.filter(
    (entry) => entry.status === "queued" || (entry.status === "error" && entry.file.size),
  ).length;
  const complete = entries.filter((entry) => entry.status === "done").length;
  const totalBytes = entries.reduce((sum, entry) => sum + entry.file.size, 0);
  const transferred = entries.reduce(
    (sum, entry) =>
      sum + (entry.status === "done" || entry.status === "saving"
        ? entry.file.size
        : entry.status === "uploading"
          ? entry.loaded
          : 0),
    0,
  );
  const percent = totalBytes ? Math.round((transferred / totalBytes) * 100) : 0;
  const activeFile = entries.find(
    (entry) => entry.status === "uploading" || entry.status === "saving",
  );
  const remaining = totalBytes - transferred;
  const eta = transferSpeed > 0 ? Math.ceil(remaining / transferSpeed) : null;
  const folders = (browseData?.data || []).filter(
    (item) => item.kind === "FOLDER" && writableAccess.has(item.access),
  );
  const breadcrumbs = browseData?.meta?.breadcrumbs || [];
  const folderName = browseData?.meta?.folder?.name || browseData?.meta?.space?.name || initialName || "Drive";
  const currentBrowseAccess = browseData?.meta?.folder?.access || browseData?.meta?.space?.access;
  const canUseFolder = writableAccess.has(currentBrowseAccess);

  return (
    <Modal
      title="Upload files"
      subtitle="Add files to Workspace Drive"
      badge={"Destination: " + destination.name}
      headerIcon={<CloudUpload size={23} strokeWidth={2.2} />}
      wide
      onClose={close}
    >
      <div className="drive-upload-modal">
        <div className="drive-upload-tabs" role="tablist" aria-label="Upload options">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "upload"}
            className={tab === "upload" ? "active" : ""}
            onClick={() => setTab("upload")}
          >
            <Upload size={15} /> Upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "drive"}
            className={tab === "drive" ? "active" : ""}
            onClick={() => setTab("drive")}
            disabled={running}
          >
            <HardDrive size={15} /> My Drive
          </button>
          <span className="drive-upload-secure"><CheckCircle2 size={15} /> Secure upload</span>
        </div>

        {tab === "upload" ? (
          <>
            <div
              className={"drive-upload-dropzone" + (dragging ? " is-dragging" : "")}
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current += 1;
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) {
                  dragDepth.current = 0;
                  setDragging(false);
                }
              }}
              onDrop={handleDrop}
            >
              <div className="drive-upload-drop-icon">
                <FileText size={18} className="drive-upload-float-icon upper" />
                <FolderOpen size={35} />
                <FileImage size={17} className="drive-upload-float-icon lower" />
              </div>
              <strong>Drag files here</strong>
              <span>or select items directly from your device</span>
              <button
                type="button"
                className="btn-primary drive-upload-browse"
                onClick={() => picker.current?.click()}
                disabled={running}
              >
                <FolderOpen size={16} /> Browse device
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                className="sr-only"
                aria-label="Choose files to upload"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <div className="drive-upload-format-hints" aria-label="Examples of supported file formats">
                <span>DOC, PDF, XLSX</span><span>PNG, JPG, MP4</span><span>ZIP archives</span>
              </div>
            </div>

            <div className="drive-upload-file-heading">
              <h3>Selected files <span>{entries.length} items</span></h3>
              <button
                type="button"
                onClick={() => {
                  if (!running) setEntries([]);
                }}
                disabled={!entries.length || running}
              >
                <X size={14} /> Clear all
              </button>
            </div>

            {entries.length > 0 && (
              <div className="drive-upload-summary" aria-live="polite">
                <div className="drive-upload-summary-text">
                  <span>
                    <i className="drive-upload-dot" />
                    {running
                      ? "Uploading " + (complete + 1) + " of " + entries.length + " files"
                      : complete === entries.length
                        ? "All files uploaded"
                        : complete + " of " + entries.length + " files uploaded"}
                    {" · " + fileSize(transferred) + " of " + fileSize(totalBytes)}
                  </span>
                  <span>
                    {running && transferSpeed > 0
                      ? fileSize(transferSpeed) + "/s" + (eta !== null ? " · ~" + eta + "s left" : "")
                      : percent + "%"}
                  </span>
                </div>
                <div className="drive-upload-track">
                  <div style={{ width: percent + "%" }} />
                </div>
              </div>
            )}

            <div className="drive-upload-file-list" aria-live="polite">
              {entries.length === 0 ? (
                <p className="drive-upload-empty">Selected files will appear here before uploading.</p>
              ) : (
                entries.map((entry) => {
                  const { Icon, tone } = fileAppearance(entry.file.name);
                  const ratio = entry.file.size
                    ? Math.round((entry.loaded / entry.file.size) * 100)
                    : 0;
                  return (
                    <div className="drive-upload-file" key={entry.id}>
                      <div className={"drive-upload-file-icon tone-" + tone}><Icon size={21} /></div>
                      <div className="drive-upload-file-details">
                        <div className="drive-upload-file-name" title={entry.file.name}>{entry.file.name}</div>
                        <div className="drive-upload-file-meta">
                          {fileSize(entry.file.size)}
                          <span aria-hidden="true">·</span>
                          <span className={"drive-upload-status status-" + entry.status}>
                            {entry.status === "done" && <Check size={13} />}
                            {entry.status === "error" && <AlertCircle size={13} />}
                            {entry.status === "uploading"
                              ? "Uploading " + ratio + "%"
                              : entry.status === "saving"
                                ? "Saving to Drive…"
                                : entry.status === "done"
                                  ? "Uploaded to Drive"
                                  : entry.status === "error"
                                    ? entry.message
                                    : entry.status === "cancelled"
                                      ? "Cancelled"
                                      : "Ready to upload"}
                          </span>
                        </div>
                        {(entry.status === "uploading" || entry.status === "saving") && (
                          <div className="drive-upload-track file-track">
                            <div style={{ width: (entry.status === "saving" ? 100 : ratio) + "%" }} />
                          </div>
                        )}
                      </div>
                      {entry.status === "done" && (
                        <span className="drive-upload-complete"><Check size={13} /> Done</span>
                      )}
                      {entry.status === "error" && entry.file.size > 0 && !running && (
                        <button
                          className="drive-upload-retry"
                          type="button"
                          aria-label={"Retry " + entry.file.name}
                          title="Retry upload"
                          onClick={() => updateEntry(entry.id, { status: "queued", loaded: 0, message: "" })}
                        ><RotateCcw size={16} /></button>
                      )}
                      <button
                        className="drive-upload-remove"
                        type="button"
                        aria-label={(entry.status === "uploading" ? "Cancel " : "Remove ") + entry.file.name}
                        title={entry.status === "uploading" ? "Cancel upload" : "Remove from list"}
                        disabled={entry.status === "saving"}
                        onClick={() => removeEntry(entry)}
                      ><X size={17} /></button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="drive-upload-browser">
            <p>Choose a destination folder in the current Drive space.</p>
            <div className="drive-upload-browser-path">
              <button type="button" onClick={() => setBrowseId(null)}>Drive root</button>
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.id}>
                  <ChevronRight size={14} />
                  <button
                    type="button"
                    onClick={() => setBrowseId(crumb.id)}
                    aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}
                  >{crumb.name}</button>
                </span>
              ))}
            </div>
            {browseLoading ? (
              <div className="drive-upload-browser-state"><LoaderCircle className="drive-upload-spin" size={20} /> Loading folders…</div>
            ) : browseError ? (
              <p className="drive-upload-browser-error" role="alert">{browseError}</p>
            ) : folders.length ? (
              <div className="drive-upload-folder-list">
                {folders.map((folder) => (
                  <button type="button" key={folder.id} onClick={() => setBrowseId(folder.id)}>
                    <Folder size={19} /><span>{folder.name}</span><ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="drive-upload-browser-state">No editable subfolders here.</div>
            )}
            <button
              type="button"
              className="btn-primary drive-upload-use-folder"
              disabled={browseLoading || !!browseError || !browseData || !canUseFolder || running}
              onClick={() => {
                setDestination({ parentId: browseId, name: folderName });
                setTab("upload");
              }}
            >
              <Check size={16} /> Use this folder
            </button>
          </div>
        )}

        <div className="drive-upload-footer">
          <span>
            {complete > 0 ? complete + " file" + (complete === 1 ? "" : "s") + " saved to Drive" : "Files are saved to the selected folder"}
          </span>
          <button
            type="button"
            className="btn-primary drive-upload-submit"
            disabled={running || (waiting === 0 && complete !== entries.length)}
            onClick={waiting ? uploadSelected : close}
          >
            {running ? <LoaderCircle size={17} className="drive-upload-spin" /> : waiting ? <CloudUpload size={17} /> : <Check size={17} />}
            {running ? "Uploading…" : waiting ? "Upload " + waiting + " file" + (waiting === 1 ? "" : "s") : "Done"}
          </button>
        </div>
        {error && <p className="drive-upload-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
