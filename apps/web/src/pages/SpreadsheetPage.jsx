import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  LoaderCircle,
  Plus,
  Save,
  Settings2,
  Table2,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { useSocket } from "../hooks/useSocket.js";
import {
  cloneSpreadsheetSnapshot,
  mergeSpreadsheetSnapshots,
} from "../lib/spreadsheet-collaboration.js";
import { connectUniverPermissions } from "../lib/univer-permissions.js";

const UNIVER_VERSION = "1.0.2";
const writeAccess = new Set(["OWNER", "MANAGER", "EDITOR"]);
const MAX_ROWS = 1048576;
const MAX_COLUMNS = 16384;
const MAX_MERGE_RETRIES = 4;
let univerLoader;

function ensureStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadUniver() {
  if (!univerLoader) {
    ensureStylesheet(
      "univer-sheets-core-css",
      `https://cdn.jsdelivr.net/npm/@univerjs/preset-sheets-core@${UNIVER_VERSION}/lib/index.css`,
    );
    ensureStylesheet(
      "univer-sheets-filter-css",
      `https://cdn.jsdelivr.net/npm/@univerjs/preset-sheets-filter@${UNIVER_VERSION}/lib/index.css`,
    );
    ensureStylesheet(
      "univer-sheets-sort-css",
      `https://cdn.jsdelivr.net/npm/@univerjs/preset-sheets-sort@${UNIVER_VERSION}/lib/index.css`,
    );

    const remoteImport = (url) => import(/* @vite-ignore */ url);
    univerLoader = Promise.all([
      remoteImport(`https://esm.sh/@univerjs/core@${UNIVER_VERSION}`),
      remoteImport(`https://esm.sh/@univerjs/presets@${UNIVER_VERSION}`),
      remoteImport(
        `https://esm.sh/@univerjs/preset-sheets-core@${UNIVER_VERSION}`,
      ),
      remoteImport(
        `https://esm.sh/@univerjs/preset-sheets-core@${UNIVER_VERSION}/locales/en-US`,
      ),
      remoteImport(
        `https://esm.sh/@univerjs/preset-sheets-filter@${UNIVER_VERSION}`,
      ),
      remoteImport(
        `https://esm.sh/@univerjs/preset-sheets-filter@${UNIVER_VERSION}/locales/en-US`,
      ),
      remoteImport(
        `https://esm.sh/@univerjs/preset-sheets-sort@${UNIVER_VERSION}`,
      ),
      remoteImport(
        `https://esm.sh/@univerjs/preset-sheets-sort@${UNIVER_VERSION}/locales/en-US`,
      ),
    ]).then(
      ([
        core,
        presets,
        sheetsCore,
        coreLocale,
        sheetsFilter,
        filterLocale,
        sheetsSort,
        sortLocale,
      ]) => ({
        ...core,
        ...presets,
        ...sheetsCore,
        ...sheetsFilter,
        ...sheetsSort,
        coreLocale: coreLocale.default || coreLocale,
        filterLocale: filterLocale.default || filterLocale,
        sortLocale: sortLocale.default || sortLocale,
      }),
    );
  }
  return univerLoader;
}

function userInitials(displayName) {
  const parts = String(displayName || "User")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return (parts.map((part) => part[0]).join("") || "U").toUpperCase();
}

function SheetCreate() {
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState([]);
  const [spaceId, setSpaceId] = useState("");
  const [name, setName] = useState("Untitled spreadsheet");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/drive/spaces")
      .then((result) => {
        if (!active) return;
        const editable = result.data.filter((space) =>
          writeAccess.has(space.access),
        );
        setSpaces(editable);
        const personal = editable.find((space) => space.type === "PERSONAL");
        setSpaceId(personal?.id || editable[0]?.id || "");
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!spaceId || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await api("/drive/sheets", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), spaceId }),
      });
      navigate(`/drive/sheets/${result.data.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl py-8">
      <div className="mb-5 flex items-center gap-3">
        <Link to="/drive" className="icon-btn" title="Back to Drive">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New spreadsheet</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a live spreadsheet in one of your Drive spaces.
          </p>
        </div>
      </div>

      <form className="card space-y-5 p-5" onSubmit={create}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Spreadsheet name
          </span>
          <input
            className="input"
            value={name}
            maxLength={200}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Drive space
          </span>
          <select
            className="input"
            value={spaceId}
            disabled={loading}
            onChange={(e) => setSpaceId(e.target.value)}
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name} · {space.type.toLowerCase()}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-slate-400">
            This first version creates the spreadsheet at the root of the selected
            space. You can move it into a folder from Drive afterwards.
          </span>
        </label>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link to="/drive" className="btn-secondary">
            Cancel
          </Link>
          <button
            className="btn-primary"
            disabled={saving || loading || !spaceId || !name.trim()}
          >
            {saving ? (
              <LoaderCircle className="animate-spin" size={17} />
            ) : (
              <Table2 size={17} />
            )}
            Create spreadsheet
          </button>
        </div>
      </form>
    </div>
  );
}

function SheetEditor({ id }) {
  const { user } = useAuth();
  const hostRef = useRef(null);
  const runtimeRef = useRef(null);
  const versionRef = useRef(1);
  const baseSnapshotRef = useRef(null);
  const editGenerationRef = useRef(0);
  const remountPendingSaveRef = useRef(false);
  const timerRef = useRef(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const conflictRef = useRef(null);
  const [sheet, setSheet] = useState(null);
  const [permissionUsers, setPermissionUsers] = useState(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [conflictInfo, setConflictInfo] = useState(null);
  const [activeUsers, setActiveUsers] = useState([]);
  const [dimensions, setDimensions] = useState({ rows: 1000, columns: 20 });
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeRows, setResizeRows] = useState("1000");
  const [resizeColumns, setResizeColumns] = useState("20");
  const [resizeError, setResizeError] = useState("");

  const socketRef = useSocket({
    "sheet:presence": (payload) => {
      if (payload?.sheetId !== id) return;
      setActiveUsers(Array.isArray(payload.users) ? payload.users : []);
    },
  });

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;

    const join = () => socket.emit("sheet:join", id);
    socket.on("connect", join);
    join();

    return () => {
      socket.off("connect", join);
      socket.emit("sheet:leave", id);
      setActiveUsers([]);
    };
  }, [id, socketRef]);

  const canEdit = useMemo(
    () => Boolean(sheet && writeAccess.has(sheet.access)),
    [sheet],
  );

  function getActiveWorksheet() {
    return runtimeRef.current?.univerAPI
      .getActiveWorkbook()
      ?.getActiveSheet?.();
  }

  function refreshDimensions() {
    const worksheet = getActiveWorksheet();
    if (!worksheet) return null;
    const next = {
      rows: worksheet.getMaxRows(),
      columns: worksheet.getMaxColumns(),
    };
    setDimensions(next);
    return next;
  }

  function growRows(amount = 1000) {
    if (!canEdit) return;
    const worksheet = getActiveWorksheet();
    if (!worksheet) return;
    const current = worksheet.getMaxRows();
    const next = Math.min(current + amount, MAX_ROWS);
    if (next === current) return;
    worksheet.setRowCount(next);
    refreshDimensions();
  }

  function growColumns(amount = 10) {
    if (!canEdit) return;
    const worksheet = getActiveWorksheet();
    if (!worksheet) return;
    const current = worksheet.getMaxColumns();
    const next = Math.min(current + amount, MAX_COLUMNS);
    if (next === current) return;
    worksheet.setColumnCount(next);
    refreshDimensions();
  }

  function openResize() {
    const current = refreshDimensions() || dimensions;
    setResizeRows(String(current.rows));
    setResizeColumns(String(current.columns));
    setResizeError("");
    setResizeOpen(true);
  }

  function applyResize(e) {
    e.preventDefault();
    if (!canEdit) return;
    const worksheet = getActiveWorksheet();
    if (!worksheet) return;

    const rows = Number.parseInt(resizeRows, 10);
    const columns = Number.parseInt(resizeColumns, 10);
    const currentRows = worksheet.getMaxRows();
    const currentColumns = worksheet.getMaxColumns();

    if (!Number.isInteger(rows) || !Number.isInteger(columns)) {
      setResizeError("Rows and columns must be whole numbers.");
      return;
    }
    if (rows < currentRows || columns < currentColumns) {
      setResizeError(
        "Resize can only grow the sheet. This prevents accidental data loss.",
      );
      return;
    }
    if (rows > MAX_ROWS || columns > MAX_COLUMNS) {
      setResizeError(
        `This spreadsheet currently allows up to ${MAX_ROWS.toLocaleString()} rows and ${MAX_COLUMNS.toLocaleString()} columns.`,
      );
      return;
    }

    if (rows !== currentRows) worksheet.setRowCount(rows);
    if (columns !== currentColumns) worksheet.setColumnCount(columns);
    refreshDimensions();
    setResizeOpen(false);
  }

  function clearConflict() {
    conflictRef.current = null;
    setConflictInfo(null);
  }

  function conflictMessage(conflicts, editor) {
    const labels = [...new Set(conflicts.map((item) => item.label))];
    const visible = labels.slice(0, 4).join(", ");
    const more = labels.length > 4 ? ` and ${labels.length - 4} more` : "";
    const actor = editor?.displayName?.trim() || "Someone else";
    return `${actor} changed the same ${labels.length === 1 ? "item" : "items"}${visible ? ` (${visible}${more})` : ""}. Your changes are still open. Choose which version to keep.`;
  }

  async function persistSnapshot(localSnapshot, { forceConflicts = false } = {}) {
    let candidate = cloneSpreadsheetSnapshot(localSnapshot);
    let base = cloneSpreadsheetSnapshot(
      baseSnapshotRef.current || sheet?.snapshot || {},
    );
    let version = versionRef.current;
    let mergedRemoteChanges = false;
    let mergedEditor = null;

    for (let attempt = 0; attempt < MAX_MERGE_RETRIES; attempt += 1) {
      try {
        const result = await api(`/drive/sheets/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            snapshot: candidate,
            version,
          }),
        });

        versionRef.current = result.data.version;
        baseSnapshotRef.current = cloneSpreadsheetSnapshot(candidate);
        clearConflict();

        return {
          saved: true,
          merged: mergedRemoteChanges,
          mergedEditor,
          snapshot: cloneSpreadsheetSnapshot(candidate),
          version: result.data.version,
          updatedAt: result.data.updatedAt,
        };
      } catch (saveError) {
        if (saveError.code !== "SHEET_VERSION_CONFLICT") throw saveError;

        const latestResult = await api(`/drive/sheets/${id}`);
        const latest = latestResult.data;
        const conflictEditor = latest.lastEditor || saveError.details?.editor || null;
        const merge = mergeSpreadsheetSnapshots(base, latest.snapshot, candidate);

        if (merge.conflicts.length && !forceConflicts) {
          const pendingConflict = {
            latest,
            editor: conflictEditor,
            snapshot: merge.snapshot,
            conflicts: merge.conflicts,
          };
          conflictRef.current = pendingConflict;
          setConflictInfo(pendingConflict);
          setStatus("Conflict");
          setError(conflictMessage(merge.conflicts, conflictEditor));
          return { saved: false, conflict: true };
        }

        candidate = merge.snapshot;
        base = cloneSpreadsheetSnapshot(latest.snapshot);
        version = latest.version;
        mergedRemoteChanges = true;
        mergedEditor = conflictEditor || mergedEditor;
      }
    }

    const retryError = new Error(
      "This spreadsheet is changing very quickly. Please press Save again.",
    );
    retryError.code = "SHEET_MERGE_RETRY_LIMIT";
    throw retryError;
  }

  async function saveCurrentWorkbook({ forceConflicts = false } = {}) {
    const runtime = runtimeRef.current;
    if (!runtime || !canEdit || (conflictRef.current && !forceConflicts)) return;
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }

    const workbook = runtime.univerAPI.getActiveWorkbook();
    if (!workbook) return;

    const generationAtStart = editGenerationRef.current;
    const localSnapshot = workbook.save();
    savingRef.current = true;
    setStatus("Saving…");
    try {
      const result = await persistSnapshot(localSnapshot, { forceConflicts });
      if (result?.saved) {
        setError("");

        if (!result.merged) {
          setStatus("Saved");
        } else {
          const changedDuringSave = editGenerationRef.current !== generationAtStart;
          const currentWorkbook = runtimeRef.current?.univerAPI.getActiveWorkbook();
          let snapshotToShow = result.snapshot;
          let rebaseConflicts = [];

          if (changedDuringSave && currentWorkbook) {
            const rebase = mergeSpreadsheetSnapshots(
              localSnapshot,
              result.snapshot,
              currentWorkbook.save(),
            );
            snapshotToShow = rebase.snapshot;
            rebaseConflicts = rebase.conflicts;
          }

          pendingRef.current = false;
          if (rebaseConflicts.length) {
            const pendingConflict = {
              latest: {
                ...(sheet || {}),
                snapshot: cloneSpreadsheetSnapshot(result.snapshot),
                version: result.version,
                updatedAt: result.updatedAt,
                lastEditor: result.mergedEditor,
              },
              editor: result.mergedEditor,
              snapshot: cloneSpreadsheetSnapshot(snapshotToShow),
              conflicts: rebaseConflicts,
            };
            conflictRef.current = pendingConflict;
            setConflictInfo(pendingConflict);
            setStatus("Conflict");
            setError(conflictMessage(rebaseConflicts, result.mergedEditor));
          } else if (changedDuringSave) {
            remountPendingSaveRef.current = true;
            setStatus("Unsaved changes");
          } else {
            setStatus("Merged & saved");
          }

          setSheet((current) =>
            current
              ? {
                  ...current,
                  snapshot: cloneSpreadsheetSnapshot(snapshotToShow),
                  version: result.version,
                  updatedAt: result.updatedAt,
                }
              : current,
          );
        }
      }
    } catch (saveError) {
      setStatus("Save failed");
      setError(saveError.message);
    } finally {
      savingRef.current = false;
      if (
        pendingRef.current &&
        !conflictRef.current &&
        !remountPendingSaveRef.current
      ) {
        pendingRef.current = false;
        queueMicrotask(() => saveCurrentWorkbook());
      }
    }
  }

  async function keepMyChanges() {
    if (!conflictRef.current || savingRef.current) return;
    await saveCurrentWorkbook({ forceConflicts: true });
  }

  async function loadLatestVersion() {
    if (savingRef.current) return;
    clearTimeout(timerRef.current);
    savingRef.current = true;
    setStatus("Loading latest…");
    try {
      const result = await api(`/drive/sheets/${id}`);
      versionRef.current = result.data.version;
      baseSnapshotRef.current = cloneSpreadsheetSnapshot(result.data.snapshot);
      editGenerationRef.current = 0;
      remountPendingSaveRef.current = false;
      pendingRef.current = false;
      clearConflict();
      setError("");
      setSheet(result.data);
      setStatus("Saved");
    } catch (loadError) {
      setStatus("Load failed");
      setError(loadError.message);
    } finally {
      savingRef.current = false;
    }
  }

  useEffect(() => {
    let active = true;
    setPermissionUsers(null);
    Promise.all([
      api(`/drive/sheets/${id}`),
      api(`/drive/sheets/${id}/collaborators`),
    ])
      .then(([result, collaboratorResult]) => {
        if (!active) return;
        versionRef.current = result.data.version;
        baseSnapshotRef.current = cloneSpreadsheetSnapshot(result.data.snapshot);
        editGenerationRef.current = 0;
        remountPendingSaveRef.current = false;
        conflictRef.current = null;
        setConflictInfo(null);
        setPermissionUsers(collaboratorResult.data);
        setSheet(result.data);
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message);
        setStatus("Could not load");
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!sheet || !permissionUsers || !user || !hostRef.current) return undefined;
    let disposed = false;
    let commandListener;
    let container;

    function scheduleSave() {
      if (!writeAccess.has(sheet.access) || conflictRef.current) return;
      setStatus("Unsaved changes");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveCurrentWorkbook(), 900);
    }

    async function mount() {
      try {
        setStatus("Loading editor…");
        const univerModules = await loadUniver();
        const {
          createUniver,
          LocaleType,
          mergeLocales,
          UniverSheetsCorePreset,
          UniverSheetsFilterPreset,
          UniverSheetsSortPreset,
          coreLocale,
          filterLocale,
          sortLocale,
        } = univerModules;
        if (disposed || !hostRef.current) return;

        container = document.createElement("div");
        container.style.height = "100%";
        container.style.width = "100%";
        hostRef.current.appendChild(container);

        const runtime = createUniver({
          locale: LocaleType.EN_US,
          locales: {
            [LocaleType.EN_US]: mergeLocales(
              coreLocale,
              filterLocale,
              sortLocale,
            ),
          },
          presets: [
            UniverSheetsCorePreset({
              container,
            }),
            UniverSheetsFilterPreset(),
            UniverSheetsSortPreset(),
          ],
        });
        runtimeRef.current = runtime;

        connectUniverPermissions({
          runtime,
          modules: univerModules,
          currentUser: user,
          users: permissionUsers,
          ownerUserId: sheet.owner?.id,
        });

        const snapshot = sheet.snapshot;
        const hasSnapshot =
          snapshot && typeof snapshot === "object" && Object.keys(snapshot).length;
        const workbook = runtime.univerAPI.createWorkbook(
          hasSnapshot ? snapshot : { name: sheet.name },
        );

        const worksheet = workbook.getActiveSheet?.();
        if (worksheet) {
          setDimensions({
            rows: worksheet.getMaxRows(),
            columns: worksheet.getMaxColumns(),
          });
        }

        if (!writeAccess.has(sheet.access)) {
          await workbook.getWorkbookPermission().setReadOnly();
        } else {
          commandListener = workbook.onCommandExecuted(() => {
            editGenerationRef.current += 1;
            scheduleSave();
            requestAnimationFrame(refreshDimensions);
          });
        }

        if (conflictRef.current) {
          setStatus("Conflict");
        } else if (remountPendingSaveRef.current && writeAccess.has(sheet.access)) {
          remountPendingSaveRef.current = false;
          setStatus("Unsaved changes");
          timerRef.current = setTimeout(() => saveCurrentWorkbook(), 50);
        } else {
          setStatus(writeAccess.has(sheet.access) ? "Saved" : "View only");
        }
      } catch (e) {
        if (!disposed) {
          setError(e.message || "Could not load the spreadsheet editor");
          setStatus("Editor failed");
        }
      }
    }

    mount();

    return () => {
      disposed = true;
      clearTimeout(timerRef.current);
      commandListener?.dispose?.();
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      if (runtime) {
        queueMicrotask(() => runtime.univer.dispose());
      }
      container?.remove();
    };
  }, [id, permissionUsers, sheet, user]);

  function manualSave() {
    clearTimeout(timerRef.current);
    saveCurrentWorkbook();
  }

  return (
    <>
      <div className="flex h-[calc(100vh-9.1rem)] min-h-[580px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:h-[calc(100vh-1.8rem)]">
        <div className="flex min-h-14 items-center gap-3 border-b border-slate-200 px-3 sm:px-4">
          <Link to="/drive" className="icon-btn shrink-0" title="Back to Drive">
            <ArrowLeft size={18} />
          </Link>
          <Table2 size={20} className="shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">
              {sheet?.name || "Spreadsheet"}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>{sheet?.space?.name || "Drive"}</span>
              <span>·</span>
              <span>{status}</span>
              {sheet?.access && (
                <>
                  <span>·</span>
                  <span>{sheet.access.toLowerCase()}</span>
                </>
              )}
            </div>
          </div>

          {activeUsers.length > 0 && (
            <>
              <div
                className="hidden shrink-0 items-center gap-1.5 lg:flex"
                aria-label="People currently in this spreadsheet"
              >
                <span className="text-[11px] text-slate-400">Here now</span>
                {activeUsers.slice(0, 3).map((user) => (
                  <div
                    key={user.id}
                    className="flex max-w-[150px] items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-0.5 pr-2"
                    title={`${user.displayName} is in this spreadsheet`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                      {userInitials(user.displayName)}
                    </span>
                    <span className="max-w-24 truncate text-[11px] font-medium text-slate-600">
                      {user.displayName}
                    </span>
                  </div>
                ))}
                {activeUsers.length > 3 && (
                  <span
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500"
                    title={activeUsers
                      .slice(3)
                      .map((user) => user.displayName)
                      .join(", ")}
                  >
                    +{activeUsers.length - 3}
                  </span>
                )}
              </div>
              <div
                className="flex shrink-0 -space-x-1 lg:hidden"
                title={`Here now: ${activeUsers
                  .map((user) => user.displayName)
                  .join(", ")}`}
                aria-label={`${activeUsers.length} people currently in this spreadsheet`}
              >
                {activeUsers.slice(0, 3).map((user) => (
                  <span
                    key={user.id}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-100 text-[10px] font-bold text-emerald-700"
                  >
                    {userInitials(user.displayName)}
                  </span>
                ))}
                {activeUsers.length > 3 && (
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 px-1 text-[9px] font-bold text-slate-600">
                    +{activeUsers.length - 3}
                  </span>
                )}
              </div>
            </>
          )}

          {canEdit && (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                className="icon-btn hidden sm:inline-flex"
                title="Resize spreadsheet"
                aria-label="Resize spreadsheet"
                onClick={openResize}
              >
                <Settings2 size={16} />
              </button>
              <button
                className="btn-secondary shrink-0"
                onClick={manualSave}
                disabled={status === "Saving…" || Boolean(conflictInfo)}
              >
                <Save size={16} />
                <span className="hidden sm:inline">Save</span>
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            <div>{error}</div>
            {conflictInfo && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-700 hover:bg-red-100"
                  onClick={keepMyChanges}
                  disabled={savingRef.current}
                >
                  Keep my changes
                </button>
                <button
                  className="rounded-md border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-700 hover:bg-red-100"
                  onClick={loadLatestVersion}
                  disabled={savingRef.current}
                >
                  Use latest version
                </button>
              </div>
            )}
          </div>
        )}

        <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden">
          {(!sheet || !permissionUsers) && !error && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
              <LoaderCircle size={18} className="animate-spin" />
              Loading spreadsheet…
            </div>
          )}
        </div>

        {sheet && (
          <div className="flex min-h-11 flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="mr-auto whitespace-nowrap">
              {dimensions.rows.toLocaleString()} rows · {dimensions.columns.toLocaleString()} columns
            </span>
            {canEdit && (
              <>
                <button
                  className="btn-secondary !min-h-8 !px-2.5 !py-1 text-xs"
                  onClick={() => growRows(1000)}
                  disabled={dimensions.rows >= MAX_ROWS}
                  title="Add 1,000 rows to the end of the active sheet"
                >
                  <Plus size={14} />
                  1,000 rows
                </button>
                <button
                  className="btn-secondary !min-h-8 !px-2.5 !py-1 text-xs"
                  onClick={() => growColumns(10)}
                  disabled={dimensions.columns >= MAX_COLUMNS}
                  title="Add 10 columns to the end of the active sheet"
                >
                  <Plus size={14} />
                  10 columns
                </button>
                <button
                  className="btn-secondary !min-h-8 !px-2.5 !py-1 text-xs sm:hidden"
                  onClick={openResize}
                >
                  <Settings2 size={14} />
                  Resize
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {resizeOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setResizeOpen(false);
          }}
        >
          <form
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onSubmit={applyResize}
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-900">
                  Resize spreadsheet
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Increase the active sheet capacity without changing the default
                  size of new spreadsheets.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close resize dialog"
                onClick={() => setResizeOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Total rows
                </span>
                <input
                  className="input"
                  type="number"
                  min={dimensions.rows}
                  max={MAX_ROWS}
                  step="1"
                  value={resizeRows}
                  onChange={(e) => setResizeRows(e.target.value)}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Total columns
                </span>
                <input
                  className="input"
                  type="number"
                  min={dimensions.columns}
                  max={MAX_COLUMNS}
                  step="1"
                  value={resizeColumns}
                  onChange={(e) => setResizeColumns(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Current: {dimensions.rows.toLocaleString()} rows × {dimensions.columns.toLocaleString()} columns. Shrinking is disabled to prevent accidental data loss.
            </div>

            {resizeError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {resizeError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setResizeOpen(false)}
              >
                Cancel
              </button>
              <button className="btn-primary">Apply</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export default function SpreadsheetPage() {
  const { id } = useParams();
  return id === "new" ? <SheetCreate /> : <SheetEditor id={id} />;
}
