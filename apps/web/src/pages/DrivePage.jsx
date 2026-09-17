import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  FileText,
  Upload,
  FolderPlus,
  Search,
  ChevronRight,
  Download,
  Share2,
  Trash2,
  RotateCcw,
  Pencil,
  FolderInput,
} from "lucide-react";
import { api, uploadFile, downloadFile } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import {
  Modal,
  Field,
  ErrorBox,
  Empty,
  Loading,
  Badge,
  fileSize,
  prettyDate,
} from "../components/UI.jsx";
function Shares({ item, onClose, reload }) {
  const [target, setTarget] = useState("");
  const [access, setAccess] = useState("VIEWER");
  const [error, setError] = useState("");
  const people = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api("/departments").then((r) => r.data),
  });
  const shares = useQuery({
    queryKey: ["drive-shares", item.id],
    queryFn: () => api(`/drive/${item.id}/shares`).then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: ({ grantId } = {}) =>
      grantId
        ? api(`/drive/${item.id}/shares/${grantId}`, { method: "DELETE" })
        : api(`/drive/${item.id}/shares`, {
            method: "POST",
            body: JSON.stringify({
              [target.startsWith("d:") ? "departmentId" : "userId"]:
                target.slice(2),
              access,
            }),
          }),
    onSuccess: () => {
      setTarget("");
      shares.refetch();
      reload();
      setError("");
    },
    onError: (e) => setError(e.message),
  });
  return (
    <Modal title={`Share ${item.name}`} onClose={onClose}>
      <p className="mb-5 text-sm text-slate-500">
        Viewers can read and download. Editors can also add files and rename
        items. Folder access applies to everything inside.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Person or department">
          <select
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          >
            <option value="">Select a recipient</option>
            <optgroup label="People">
              {people.data
                ?.filter((u) => u.id !== item.ownerId && u.status === "ACTIVE")
                .map((u) => (
                  <option key={u.id} value={`u:${u.id}`}>
                    {u.displayName}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Departments">
              {departments.data?.map((d) => (
                <option key={d.id} value={`d:${d.id}`}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <div className="flex gap-3 mt-4">
          <select
            aria-label="Access level"
            className="input"
            value={access}
            onChange={(e) => setAccess(e.target.value)}
          >
            <option value="VIEWER">Viewer</option>
            <option value="EDITOR">Editor</option>
          </select>
          <button className="btn-primary" disabled={save.isPending}>
            Share
          </button>
        </div>
      </form>
      <ErrorBox error={error || shares.error} />
      <div className="mt-6 space-y-3">
        <div className="flex justify-between text-sm">
          <span>{item.owner.displayName}</span>
          <Badge value="OWNER" />
        </div>
        {shares.data?.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between text-sm gap-3"
          >
            <span>{s.user?.displayName || s.department?.name}</span>
            <div className="flex gap-2 items-center">
              <Badge value={s.access} />
              <button
                className="icon-btn"
                aria-label={`Remove access for ${s.user?.displayName || s.department?.name}`}
                disabled={save.isPending}
                onClick={() => save.mutate({ grantId: s.id })}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-slate-400">
        Access inherited from a parent folder must be changed on that folder.
      </p>
    </Modal>
  );
}
function Move({ item, onClose, reload }) {
  const [parent, setParent] = useState(null);
  const [error, setError] = useState("");
  const folders = useQuery({
    queryKey: ["drive-picker", parent],
    queryFn: () =>
      api(`/drive?view=mine${parent ? `&parentId=${parent}` : ""}`),
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/drive/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ parentId: parent }),
      }),
    onSuccess: () => {
      reload();
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  return (
    <Modal title={`Move ${item.name}`} onClose={onClose}>
      <div className="flex gap-2 items-center mb-4 text-sm flex-wrap">
        <button onClick={() => setParent(null)}>My Drive</button>
        {folders.data?.meta.breadcrumbs.map((b) => (
          <button
            key={b.id}
            className="flex items-center gap-2"
            onClick={() => setParent(b.id)}
          >
            <ChevronRight size={14} />
            {b.name}
          </button>
        ))}
      </div>
      <div className="card">
        {folders.data?.data
          .filter(
            (x) =>
              x.kind === "FOLDER" && x.id !== item.id && x.access === "OWNER",
          )
          .map((x) => (
            <button
              className="list-row w-full text-sm"
              key={x.id}
              onClick={() => setParent(x.id)}
            >
              <Folder size={18} />
              {x.name}
              <ChevronRight size={15} className="ml-auto" />
            </button>
          ))}
      </div>
      <ErrorBox error={error || folders.error} />
      <div className="form-actions">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={save.isPending || parent === item.parentId}
          onClick={() => save.mutate()}
        >
          Move here
        </button>
      </div>
    </Modal>
  );
}
export default function DrivePage() {
  const qc = useQueryClient();
  const [view, setView] = useState("mine");
  const [parent, setParent] = useState(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["drive", view, parent, search],
    queryFn: () =>
      api(
        `/drive?${new URLSearchParams({ view, ...(parent ? { parentId: parent } : {}), q: search })}`,
      ),
  });
  const reload = () => qc.invalidateQueries({ queryKey: ["drive"] });
  const save = useMutation({
    mutationFn: () =>
      api(modal?.kind === "rename" ? `/drive/${modal.item.id}` : "/drive", {
        method: modal?.kind === "rename" ? "PATCH" : "POST",
        body: JSON.stringify(
          modal?.kind === "rename" ? { name } : { name, parentId: parent },
        ),
      }),
    onSuccess: () => {
      setModal(null);
      setName("");
      setError("");
      reload();
    },
    onError: (e) => setError(e.message),
  });
  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const canAdd =
    view !== "trash" &&
    (parent
      ? ["OWNER", "EDITOR"].includes(query.data?.meta.folder?.access)
      : view === "mine");
  return (
    <>
      <PageHeader
        title="Drive"
        description="A home for your files. Share only with the people who need them."
        action={
          canAdd && (
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setName("");
                  setError("");
                  setModal({ kind: "create" });
                }}
              >
                <FolderPlus size={17} />
                New folder
              </button>
              <label
                className={`btn-primary ${busy ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Upload size={17} />
                {busy ? "Working…" : "Upload files"}
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  aria-label="Upload files"
                  disabled={busy}
                  onChange={(e) => {
                    const files = [...e.target.files];
                    e.target.value = "";
                    act(async () => {
                      for (const file of files) {
                        const uploaded = await uploadFile(file);
                        await api("/drive", {
                          method: "POST",
                          body: JSON.stringify({
                            name: file.name,
                            fileId: uploaded.id,
                            parentId: parent,
                          }),
                        });
                      }
                    });
                  }}
                />
              </label>
            </div>
          )
        }
      />
      <div className="toolbar">
        <div className="tabs">
          {[
            ["mine", "My Drive"],
            ["shared", "Shared with me"],
            ["trash", "Trash"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => {
                setView(id);
                setParent(null);
                setSearch("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {view !== "trash" && (
          <div className="relative ml-auto w-full sm:w-64">
            <Search
              size={16}
              className="absolute top-3 left-3 text-slate-400"
            />
            <input
              className="input pl-9"
              aria-label="Search files"
              placeholder="Search files and folders"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>
      <ErrorBox error={error || query.error} />
      {parent && (
        <div className="mb-4 flex flex-wrap gap-2 items-center text-sm text-slate-500">
          <button onClick={() => setParent(null)}>
            {view === "mine" ? "My Drive" : "Shared with me"}
          </button>
          {query.data?.meta.breadcrumbs.map((b) => (
            <button
              key={b.id}
              className="flex items-center gap-2"
              onClick={() => setParent(b.id)}
            >
              <ChevronRight size={13} />
              {b.name}
            </button>
          ))}
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="list-row bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span className="flex-1">Name</span>
          <span className="hidden md:block w-28">Updated</span>
          <span className="hidden md:block w-24">Size</span>
          <span className="w-36 text-right">Actions</span>
        </div>
        {query.isLoading ? (
          <Loading />
        ) : query.data?.data.length ? (
          query.data.data.map((item) => (
            <div className="list-row" key={item.id}>
              <div
                className={`p-2.5 rounded-xl ${item.kind === "FOLDER" ? "bg-amber-50 text-amber-500" : "bg-blue-50 text-blue-500"}`}
              >
                {item.kind === "FOLDER" ? (
                  <Folder size={21} />
                ) : (
                  <FileText size={21} />
                )}
              </div>
              <button
                className="flex-1 min-w-0 text-left"
                disabled={view === "trash"}
                onClick={() =>
                  item.kind === "FOLDER"
                    ? setParent(item.id)
                    : act(() => downloadFile(item.file.id, item.name))
                }
              >
                <p className="truncate text-sm font-medium">{item.name}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{item.owner.displayName}</span>
                  {item.shared && <Share2 size={11} />}
                  <span>{item.access.toLowerCase()}</span>
                </div>
              </button>
              <span className="hidden md:block w-28 text-xs text-slate-400">
                {prettyDate(item.updatedAt)}
              </span>
              <span className="hidden md:block w-24 text-xs text-slate-400">
                {item.file ? fileSize(item.file.sizeBytes) : "—"}
              </span>
              <div className="flex flex-wrap justify-end w-36">
                {view === "trash" ? (
                  <button
                    aria-label={`Restore ${item.name}`}
                    title="Restore"
                    className="icon-btn"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api(`/drive/${item.id}/restore`, { method: "POST" }),
                      )
                    }
                  >
                    <RotateCcw size={17} />
                  </button>
                ) : (
                  <>
                    {item.kind === "FILE" && (
                      <button
                        aria-label={`Download ${item.name}`}
                        title="Download"
                        className="icon-btn"
                        onClick={() =>
                          act(() => downloadFile(item.file.id, item.name))
                        }
                      >
                        <Download size={16} />
                      </button>
                    )}
                    {item.access !== "VIEWER" && (
                      <button
                        title="Rename"
                        aria-label={`Rename ${item.name}`}
                        className="icon-btn"
                        onClick={() => {
                          setName(item.name);
                          setModal({ kind: "rename", item });
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {item.access === "OWNER" && (
                      <>
                        <button
                          title="Share"
                          aria-label={`Share ${item.name}`}
                          className="icon-btn"
                          onClick={() => setModal({ kind: "share", item })}
                        >
                          <Share2 size={15} />
                        </button>
                        <button
                          title="Move"
                          aria-label={`Move ${item.name}`}
                          className="icon-btn"
                          onClick={() => setModal({ kind: "move", item })}
                        >
                          <FolderInput size={15} />
                        </button>
                        <button
                          title="Move to trash"
                          aria-label={`Trash ${item.name}`}
                          className="icon-btn"
                          onClick={() => setModal({ kind: "trash", item })}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          !query.error && (
            <Empty
              title={
                view === "trash" ? "Your trash is empty" : "No files here yet"
              }
              text={
                view === "shared"
                  ? "Files shared with you will appear here."
                  : "Create a folder or upload a file to get started."
              }
            />
          )
        )}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        {query.data?.data.length || 0} items ·{" "}
        {fileSize(query.data?.meta.usedBytes || 0)} in your Drive
        {view === "trash"
          ? " · Items in Trash still count toward storage usage."
          : ""}
      </p>
      {modal && ["create", "rename"].includes(modal.kind) && (
        <Modal
          title={modal.kind === "create" ? "New folder" : "Rename"}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field
              label="Name"
              value={name}
              autoFocus
              required
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
            <ErrorBox error={error} />
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={save.isPending}>
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.kind === "share" && (
        <Shares
          item={modal.item}
          reload={reload}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.kind === "move" && (
        <Move
          item={modal.item}
          reload={reload}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.kind === "trash" && (
        <Modal title="Move to trash?" onClose={() => setModal(null)}>
          <p className="text-sm text-slate-500">
            {modal.item.name} and its contents will be hidden from people with
            access. You can restore it from Trash.
          </p>
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api(`/drive/${modal.item.id}`, { method: "DELETE" });
                  setModal(null);
                })
              }
            >
              Move to trash
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
