import { useEffect, useMemo, useState } from "react";
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
  Globe2,
  Users,
  UserRound,
  Plus,
  Settings2,
  ShieldCheck,
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

const writeAccess = new Set(["OWNER", "MANAGER", "EDITOR"]);

function Permissions({ item, onClose, reload }) {
  const [filter, setFilter] = useState("");
  const [assignments, setAssignments] = useState({});
  const [permissionMode, setPermissionMode] = useState(
    item.permissionMode || "INHERIT",
  );
  const [includeDescendants, setIncludeDescendants] = useState(false);
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
    queryFn: () => api(`/drive/${item.id}/shares`),
  });
  const groupMembers = useQuery({
    queryKey: ["drive-space-members", item.space.id],
    queryFn: () => api(`/drive/spaces/${item.space.id}/members`),
    enabled: item.space.type === "GROUP",
  });

  useEffect(() => {
    if (!shares.data) return;
    const next = {};
    for (const grant of shares.data.data) {
      const key = grant.userId
        ? `u:${grant.userId}`
        : `d:${grant.departmentId}`;
      next[key] = grant.access;
    }
    setAssignments(next);
    setPermissionMode(shares.data.meta?.permissionMode || "INHERIT");
    setIncludeDescendants(
      shares.data.data.some((grant) => grant.scope === "DESCENDANTS"),
    );
  }, [shares.data]);

  const recipients = useMemo(() => {
    const groupMemberIds = new Set(
      (groupMembers.data?.data || []).map((member) => member.userId),
    );
    const rows = [
      ...(people.data || [])
        .filter(
          (person) =>
            person.status === "ACTIVE" &&
            !(item.space.type === "PERSONAL" && person.id === item.ownerId) &&
            (item.space.type !== "GROUP" || groupMemberIds.has(person.id)),
        )
        .map((person) => ({
          key: `u:${person.id}`,
          label: person.displayName,
          kind: item.space.type === "GROUP" ? "Group member" : "Person",
        })),
      ...(item.space.type === "GROUP" ? [] : departments.data || []).map(
        (department) => ({
          key: `d:${department.id}`,
          label: department.name,
          kind: "Department",
        }),
      ),
    ];
    const needle = filter.trim().toLocaleLowerCase();
    return needle
      ? rows.filter((row) => row.label.toLocaleLowerCase().includes(needle))
      : rows;
  }, [
    people.data,
    departments.data,
    groupMembers.data,
    filter,
    item.ownerId,
    item.space.type,
  ]);

  function setVisible(access) {
    setAssignments((current) => {
      const next = { ...current };
      for (const row of recipients) {
        if (access) next[row.key] = access;
        else delete next[row.key];
      }
      return next;
    });
  }

  const save = useMutation({
    mutationFn: () =>
      api(`/drive/${item.id}/shares`, {
        method: "PUT",
        body: JSON.stringify({
          permissionMode:
            item.space.type === "PERSONAL" ? undefined : permissionMode,
          grants: Object.entries(assignments).map(([target, access]) => ({
            [target.startsWith("u:") ? "userId" : "departmentId"]:
              target.slice(2),
            access,
            scope:
              item.kind === "FOLDER" &&
              (item.space.type !== "PERSONAL" || includeDescendants)
                ? "DESCENDANTS"
                : "ITEM_ONLY",
          })),
        }),
      }),
    onSuccess: () => {
      reload();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Modal title={`Permissions · ${item.name}`} onClose={onClose}>
      {item.space.type === "PERSONAL" ? (
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
          Personal items stay private unless you explicitly share them. Folder
          sharing is item-only by default.
        </div>
      ) : (
        <Field label="Visibility">
          <select
            className="input"
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value)}
          >
            <option value="INHERIT">Inherit from this shared space</option>
            <option value="CUSTOM">Selected recipients only</option>
          </select>
        </Field>
      )}

      {item.kind === "FOLDER" && item.space.type === "PERSONAL" && (
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={includeDescendants}
            onChange={(e) => setIncludeDescendants(e.target.checked)}
          />
          <span>
            <strong>Include current and future contents</strong>
            <span className="mt-1 block text-xs text-slate-500">
              Off means recipients can open this folder itself, but files and
              nested folders remain private unless shared separately.
            </span>
          </span>
        </label>
      )}

      <div className="mt-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search
              size={15}
              className="absolute left-3 top-3 text-slate-400"
            />
            <input
              className="input pl-9"
              placeholder="Search people or departments"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button
            className="btn-secondary"
            onClick={() => setVisible("VIEWER")}
          >
            All Viewer
          </button>
          <button
            className="btn-secondary"
            onClick={() => setVisible("EDITOR")}
          >
            All Editor
          </button>
          <button className="btn-secondary" onClick={() => setVisible(null)}>
            Deselect all
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
          {recipients.map((recipient) => (
            <div
              key={recipient.key}
              className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {recipient.label}
                </p>
                <p className="text-[11px] text-slate-400">{recipient.kind}</p>
              </div>
              <select
                className="input !w-32"
                aria-label={`Permission for ${recipient.label}`}
                value={assignments[recipient.key] || "NONE"}
                onChange={(e) =>
                  setAssignments((current) => {
                    const next = { ...current };
                    if (e.target.value === "NONE") delete next[recipient.key];
                    else next[recipient.key] = e.target.value;
                    return next;
                  })
                }
              >
                <option value="NONE">No access</option>
                <option value="VIEWER">Viewer</option>
                <option value="EDITOR">Editor</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <ErrorBox
        error={
          error ||
          shares.error ||
          people.error ||
          departments.error ||
          groupMembers.error
        }
      />
      <div className="form-actions">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          Save permissions
        </button>
      </div>
    </Modal>
  );
}

function SpaceMembers({ space, onClose, reload }) {
  const [roles, setRoles] = useState({});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const people = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const members = useQuery({
    queryKey: ["drive-space-members", space.id],
    queryFn: () => api(`/drive/spaces/${space.id}/members`),
  });

  useEffect(() => {
    if (!members.data) return;
    setRoles(
      Object.fromEntries(
        members.data.data.map((member) => [member.userId, member.role]),
      ),
    );
  }, [members.data]);

  const visible = (people.data || []).filter(
    (person) =>
      person.status === "ACTIVE" &&
      person.displayName
        .toLocaleLowerCase()
        .includes(filter.toLocaleLowerCase()),
  );

  const save = useMutation({
    mutationFn: () =>
      api(`/drive/spaces/${space.id}/members`, {
        method: "PUT",
        body: JSON.stringify({
          members: Object.entries(roles)
            .filter(([, role]) => role !== "NONE")
            .map(([userId, role]) => ({ userId, role })),
        }),
      }),
    onSuccess: () => {
      reload();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Modal title={`Members · ${space.name}`} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">
        {space.type === "GLOBAL"
          ? "Everyone can view Global. Add Editor or Manager roles for people who should maintain it."
          : "Group members receive the workspace role shown here. Item-level custom visibility can narrow access further."}
      </p>
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-3 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search people"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
        {visible.map((person) => (
          <div
            key={person.id}
            className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {person.displayName}
            </span>
            <select
              className="input !w-36"
              value={roles[person.id] || "NONE"}
              onChange={(e) =>
                setRoles((current) => ({
                  ...current,
                  [person.id]: e.target.value,
                }))
              }
            >
              <option value="NONE">
                {space.type === "GLOBAL" ? "Default viewer" : "Not a member"}
              </option>
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
              <option value="MANAGER">Manager</option>
            </select>
          </div>
        ))}
      </div>
      <ErrorBox error={error || people.error || members.error} />
      <div className="form-actions">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          Save members
        </button>
      </div>
    </Modal>
  );
}

function Move({ item, onClose, reload }) {
  const [parent, setParent] = useState(null);
  const [error, setError] = useState("");
  const folders = useQuery({
    queryKey: ["drive-picker", item.spaceId, parent],
    queryFn: () =>
      api(
        `/drive?spaceId=${item.spaceId}${parent ? `&parentId=${parent}` : ""}`,
      ),
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
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => setParent(null)}>{item.space.name}</button>
        {folders.data?.meta.breadcrumbs.map((crumb) => (
          <button
            key={crumb.id}
            className="flex items-center gap-2"
            onClick={() => setParent(crumb.id)}
          >
            <ChevronRight size={14} />
            {crumb.name}
          </button>
        ))}
      </div>
      <div className="card">
        {folders.data?.data
          .filter(
            (folder) =>
              folder.kind === "FOLDER" &&
              folder.id !== item.id &&
              writeAccess.has(folder.access),
          )
          .map((folder) => (
            <button
              className="list-row w-full text-sm"
              key={folder.id}
              onClick={() => setParent(folder.id)}
            >
              <Folder size={18} />
              {folder.name}
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

function CreateGroup({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api("/drive/spaces", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (result) => onCreated(result.data),
    onError: (e) => setError(e.message),
  });
  return (
    <Modal title="New shared group" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field
          label="Group name"
          value={name}
          required
          maxLength={200}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <ErrorBox error={error} />
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            Create group
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function DrivePage() {
  const qc = useQueryClient();
  const [section, setSection] = useState("personal");
  const [spaceId, setSpaceId] = useState(null);
  const [parent, setParent] = useState(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const spaces = useQuery({
    queryKey: ["drive-spaces"],
    queryFn: () => api("/drive/spaces"),
  });
  const personal = spaces.data?.data.find((space) => space.type === "PERSONAL");
  const global = spaces.data?.data.find((space) => space.type === "GLOBAL");
  const groups =
    spaces.data?.data.filter((space) => space.type === "GROUP") || [];

  useEffect(() => {
    if (section === "personal" && personal && spaceId !== personal.id)
      setSpaceId(personal.id);
    if (section === "shared" && !spaceId && global) setSpaceId(global.id);
  }, [section, personal, global, spaceId]);

  const selectedSpace =
    spaces.data?.data.find((space) => space.id === spaceId) || null;

  const queryEnabled =
    section === "shared-with-me" ||
    section === "trash" ||
    Boolean(section === "personal" ? personal : selectedSpace);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (section === "shared-with-me") params.set("view", "shared-with-me");
    else if (section === "trash") params.set("view", "trash");
    else if (spaceId) params.set("spaceId", spaceId);
    if (parent) params.set("parentId", parent);
    if (search) params.set("q", search);
    return params.toString();
  }, [section, spaceId, parent, search]);

  const query = useQuery({
    queryKey: ["drive", section, spaceId, parent, search],
    queryFn: () => api(`/drive?${queryString}`),
    enabled: queryEnabled,
  });

  const reload = () => {
    qc.invalidateQueries({ queryKey: ["drive"] });
    qc.invalidateQueries({ queryKey: ["drive-spaces"] });
  };

  const save = useMutation({
    mutationFn: () =>
      api(modal?.kind === "rename" ? `/drive/${modal.item.id}` : "/drive", {
        method: modal?.kind === "rename" ? "PATCH" : "POST",
        body: JSON.stringify(
          modal?.kind === "rename"
            ? { name }
            : { name, parentId: parent, spaceId },
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

  function switchSection(next) {
    setSection(next);
    setParent(null);
    setSearch("");
    if (next === "personal") setSpaceId(personal?.id || null);
    else if (next === "shared") setSpaceId(global?.id || groups[0]?.id || null);
    else setSpaceId(null);
  }

  const currentAccess =
    query.data?.meta.folder?.access || query.data?.meta.space?.access;
  const canAdd =
    !["trash", "shared-with-me"].includes(section) &&
    writeAccess.has(currentAccess);
  const canManageSpace =
    section === "shared" && selectedSpace?.access === "MANAGER";

  return (
    <>
      <PageHeader
        title="Drive"
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
                className={`btn-primary ${busy ? "pointer-events-none opacity-50" : ""}`}
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
                            spaceId,
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

      <div className="drive-toolbar toolbar sticky top-15 md:top-20 z-10 flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <div className="tabs">
          {[
            ["personal", "Personal"],
            ["shared", "Shared"],
            ["shared-with-me", "Shared with me"],
            ["trash", "Trash"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => switchSection(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {section !== "trash" && (
          <div className="relative ml-auto w-full sm:w-64">
            <Search
              size={16}
              className="absolute right-3 top-3 text-slate-400"
            />
            <input
              className="input pl-9 pe-7!"
              aria-label="Search files"
              placeholder="Search files and folders"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      <div
        className={
          section === "shared" ? "grid gap-4 lg:grid-cols-[230px_1fr]" : ""
        }
      >
        {section === "shared" && (
          <aside className="drive-space-nav card h-fit p-2">
            <button
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${selectedSpace?.type === "GLOBAL" ? "bg-slate-100 font-semibold" : ""}`}
              onClick={() => {
                setSpaceId(global?.id || null);
                setParent(null);
              }}
            >
              <Globe2 size={17} />
              Global
            </button>
            <div className="mt-3 flex items-center justify-between px-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Groups
              </span>
              {spaces.data?.meta.canCreateGroups && (
                <button
                  className="icon-btn"
                  title="New group"
                  onClick={() => setModal({ kind: "group" })}
                >
                  <Plus size={15} />
                </button>
              )}
            </div>
            <div className="mt-1 space-y-1">
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${spaceId === group.id ? "bg-slate-100 font-semibold" : ""}`}
                  onClick={() => {
                    setSpaceId(group.id);
                    setParent(null);
                  }}
                >
                  <Users size={16} />
                  <span className="truncate">{group.name}</span>
                </button>
              ))}
            </div>
            {canManageSpace && (
              <button
                className="btn-secondary mt-4 w-full"
                onClick={() =>
                  setModal({ kind: "members", space: selectedSpace })
                }
              >
                <Settings2 size={15} />
                Members
              </button>
            )}
          </aside>
        )}

        <main className="min-w-0">
          {section === "shared" && selectedSpace && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              {selectedSpace.type === "GLOBAL" ? (
                <Globe2 size={19} className="text-blue-500" />
              ) : (
                <Users size={19} className="text-violet-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{selectedSpace.name}</p>
                <p className="text-xs text-slate-400">
                  {selectedSpace.type === "GLOBAL"
                    ? "Company-wide shared space"
                    : "Group workspace"}
                </p>
              </div>
              <Badge value={selectedSpace.access} />
            </div>
          )}

          <ErrorBox error={error || query.error || spaces.error} />

          {parent && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <button onClick={() => setParent(null)}>
                {section === "shared-with-me"
                  ? "Shared with me"
                  : query.data?.meta.space?.name ||
                    selectedSpace?.name ||
                    "Personal"}
              </button>
              {query.data?.meta.breadcrumbs.map((crumb) => (
                <button
                  key={crumb.id}
                  className="flex items-center gap-2"
                  onClick={() => setParent(crumb.id)}
                >
                  <ChevronRight size={13} />
                  {crumb.name}
                </button>
              ))}
            </div>
          )}

          {/* <div className="drive-list-card card max-h-[calc(100vh-24.5rem)] md:max-h-[calc(100vh-13.94rem)] overflow-y-auto"> */}
          <div className="drive-list-card card max-h-[calc(100vh-420px)] md:max-h-[calc(100vh-13.94rem)] overflow-y-auto">
            <div className="list-row sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ">
              <span className="flex-1">Name</span>
              <span className="hidden w-28 md:block">Updated</span>
              <span className="hidden w-24 md:block">Size</span>
              <span className="drive-actions-header w-40 text-right">
                Actions
              </span>
            </div>

            {query.isLoading || spaces.isLoading ? (
              <Loading />
            ) : query.data?.data.length ? (
              query.data.data.map((item) => {
                const canEdit = writeAccess.has(item.access);
                const canManage =
                  item.access === "OWNER" || item.access === "MANAGER";
                const canDelete =
                  item.access === "OWNER" || item.access === "MANAGER";
                return (
                  <div className="drive-item-row list-row" key={item.id}>
                    <div
                      className={`rounded-xl p-2.5 ${item.kind === "FOLDER" ? "bg-amber-50 text-amber-500" : "bg-blue-50 text-blue-500"}`}
                    >
                      {item.kind === "FOLDER" ? (
                        <Folder size={21} />
                      ) : (
                        <FileText size={21} />
                      )}
                    </div>
                    <button
                      className="min-w-0 flex-1 text-left"
                      disabled={section === "trash"}
                      onClick={() =>
                        item.kind === "FOLDER"
                          ? setParent(item.id)
                          : act(() => downloadFile(item.file.id, item.name))
                      }
                    >
                      <p className="truncate text-sm font-medium">
                        {item.name}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{item.owner.displayName}</span>
                        {item.shared && <Share2 size={11} />}
                        <span>{item.access.toLowerCase()}</span>
                        {item.permissionMode === "CUSTOM" &&
                          item.space.type !== "PERSONAL" && (
                            <span className="flex items-center gap-1">
                              <ShieldCheck size={11} />
                              custom
                            </span>
                          )}
                      </div>
                    </button>
                    <span className="hidden w-28 text-xs text-slate-400 md:block">
                      {prettyDate(item.updatedAt)}
                    </span>
                    <span className="hidden w-24 text-xs text-slate-400 md:block">
                      {item.file ? fileSize(item.file.sizeBytes) : "—"}
                    </span>
                    <div className="drive-row-actions flex w-40 flex-wrap justify-end">
                      {section === "trash" ? (
                        <button
                          aria-label={`Restore ${item.name}`}
                          title="Restore"
                          className="icon-btn"
                          disabled={busy}
                          onClick={() =>
                            act(() =>
                              api(`/drive/${item.id}/restore`, {
                                method: "POST",
                              }),
                            )
                          }
                        >
                          <RotateCcw size={17} />
                        </button>
                      ) : (
                        <>
                          <div className="flex flex-1 items-center gap-2 md:hidden">
                            <span className="w-28 text-xs text-slate-400 ">
                              {prettyDate(item.updatedAt)}
                            </span>
                            <span className="w-24 text-xs text-slate-400 ">
                              {item.file ? fileSize(item.file.sizeBytes) : "—"}
                            </span>
                          </div>
                          <div>
                            {item.kind === "FILE" && (
                              <button
                                aria-label={`Download ${item.name}`}
                                title="Download"
                                className="icon-btn"
                                onClick={() =>
                                  act(() =>
                                    downloadFile(item.file.id, item.name),
                                  )
                                }
                              >
                                <Download size={16} />
                              </button>
                            )}
                            {canEdit && (
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
                            {canManage && (
                              <button
                                title="Permissions"
                                aria-label={`Permissions for ${item.name}`}
                                className="icon-btn"
                                onClick={() =>
                                  setModal({ kind: "share", item })
                                }
                              >
                                <Share2 size={15} />
                              </button>
                            )}
                            {canEdit && section !== "shared-with-me" && (
                              <button
                                title="Move"
                                aria-label={`Move ${item.name}`}
                                className="icon-btn"
                                onClick={() => setModal({ kind: "move", item })}
                              >
                                <FolderInput size={15} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                title="Move to trash"
                                aria-label={`Trash ${item.name}`}
                                className="icon-btn"
                                onClick={() =>
                                  setModal({ kind: "trash", item })
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              !query.error && (
                <Empty
                  title={
                    section === "trash"
                      ? "Your trash is empty"
                      : "No files here yet"
                  }
                  text={
                    section === "shared-with-me"
                      ? "Personal items shared directly with you will appear here."
                      : section === "shared"
                        ? "Create a folder or upload a file to this shared space."
                        : "Create a folder or upload a file to get started."
                  }
                />
              )
            )}
          </div>

          <p className="mt-4 text-xs text-slate-400">
            {query.data?.data.length || 0} items
            {section === "personal" &&
              ` · ${fileSize(query.data?.meta.usedBytes || 0)} in Personal`}
          </p>
        </main>
      </div>

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
        <Permissions
          item={modal.item}
          reload={reload}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "move" && (
        <Move
          item={modal.item}
          reload={reload}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "members" && (
        <SpaceMembers
          space={modal.space}
          reload={reload}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "group" && (
        <CreateGroup
          onClose={() => setModal(null)}
          onCreated={(space) => {
            reload();
            setSection("shared");
            setSpaceId(space.id);
            setParent(null);
            setModal(null);
          }}
        />
      )}
      {modal?.kind === "trash" && (
        <Modal title="Move to trash?" onClose={() => setModal(null)}>
          <p className="text-sm text-slate-500">
            {modal.item.name} and its contents will be hidden from people with
            access. You can restore personal items from Trash.
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
