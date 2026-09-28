import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, LoaderCircle, Save, Table2 } from "lucide-react";
import { api } from "../lib/api.js";

const UNIVER_VERSION = "1.0.2";
const writeAccess = new Set(["OWNER", "MANAGER", "EDITOR"]);
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
        presets,
        sheetsCore,
        coreLocale,
        sheetsFilter,
        filterLocale,
        sheetsSort,
        sortLocale,
      ]) => ({
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
  const hostRef = useRef(null);
  const runtimeRef = useRef(null);
  const versionRef = useRef(1);
  const timerRef = useRef(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const conflictRef = useRef(false);
  const [sheet, setSheet] = useState(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");

  const canEdit = useMemo(
    () => Boolean(sheet && writeAccess.has(sheet.access)),
    [sheet],
  );

  useEffect(() => {
    let active = true;
    api(`/drive/sheets/${id}`)
      .then((result) => {
        if (!active) return;
        setSheet(result.data);
        versionRef.current = result.data.version;
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
    if (!sheet || !hostRef.current) return undefined;
    let disposed = false;
    let commandListener;
    let container;

    async function saveSnapshot() {
      const runtime = runtimeRef.current;
      if (!runtime || !writeAccess.has(sheet.access) || conflictRef.current) return;
      if (savingRef.current) {
        pendingRef.current = true;
        return;
      }

      const workbook = runtime.univerAPI.getActiveWorkbook();
      if (!workbook) return;

      savingRef.current = true;
      setStatus("Saving…");
      try {
        const result = await api(`/drive/sheets/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            snapshot: workbook.save(),
            version: versionRef.current,
          }),
        });
        versionRef.current = result.data.version;
        setStatus("Saved");
        setError("");
      } catch (e) {
        if (e.code === "SHEET_VERSION_CONFLICT") {
          conflictRef.current = true;
          setStatus("Conflict");
        } else {
          setStatus("Save failed");
        }
        setError(e.message);
      } finally {
        savingRef.current = false;
        if (pendingRef.current && !conflictRef.current) {
          pendingRef.current = false;
          saveSnapshot();
        }
      }
    }

    function scheduleSave() {
      if (!writeAccess.has(sheet.access) || conflictRef.current) return;
      setStatus("Unsaved changes");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(saveSnapshot, 900);
    }

    async function mount() {
      try {
        setStatus("Loading editor…");
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
        } = await loadUniver();
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

        const snapshot = sheet.snapshot;
        const hasSnapshot =
          snapshot && typeof snapshot === "object" && Object.keys(snapshot).length;
        const workbook = runtime.univerAPI.createWorkbook(
          hasSnapshot ? snapshot : { name: sheet.name },
        );

        if (!writeAccess.has(sheet.access)) {
          await workbook.getWorkbookPermission().setReadOnly();
        } else {
          commandListener = workbook.onCommandExecuted(() => scheduleSave());
        }

        setStatus(writeAccess.has(sheet.access) ? "Saved" : "View only");
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
  }, [id, sheet]);

  async function manualSave() {
    const runtime = runtimeRef.current;
    if (!runtime || !canEdit || conflictRef.current || savingRef.current) return;
    clearTimeout(timerRef.current);
    const workbook = runtime.univerAPI.getActiveWorkbook();
    if (!workbook) return;
    savingRef.current = true;
    setStatus("Saving…");
    try {
      const result = await api(`/drive/sheets/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          snapshot: workbook.save(),
          version: versionRef.current,
        }),
      });
      versionRef.current = result.data.version;
      setStatus("Saved");
      setError("");
    } catch (e) {
      if (e.code === "SHEET_VERSION_CONFLICT") {
        conflictRef.current = true;
        setStatus("Conflict");
      } else {
        setStatus("Save failed");
      }
      setError(e.message);
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <div className="flex h-[calc(100vh-9.1rem)] md:h-[calc(100vh-1.8rem)] min-h-[580px]  flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
        {canEdit && (
          <button
            className="btn-secondary shrink-0"
            onClick={manualSave}
            disabled={status === "Saving…" || conflictRef.current}
          >
            <Save size={16} />
            <span className="hidden sm:inline">Save</span>
          </button>
        )}
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
          {status === "Conflict" && (
            <button
              className="ml-2 font-semibold underline"
              onClick={() => window.location.reload()}
            >
              Reload latest version
            </button>
          )}
        </div>
      )}

      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden">
        {!sheet && !error && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
            <LoaderCircle size={18} className="animate-spin" />
            Loading spreadsheet…
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpreadsheetPage() {
  const { id } = useParams();
  return id === "new" ? <SheetCreate /> : <SheetEditor id={id} />;
}
