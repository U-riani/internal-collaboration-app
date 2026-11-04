import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clipboard,
  Code2,
  LockKeyhole,
  Pencil,
  Search,
  ShieldCheck,
  ShieldPlus,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ErrorBox, Modal } from "./UI.jsx";
import "./administration-roles.css";

const emptyRole = {
  code: "",
  name: "",
  description: "",
  permissionCodes: [],
};

function permissionCodes(role) {
  return (role?.permissions ?? [])
    .map((entry) => entry.permission?.code ?? entry.code)
    .filter(Boolean);
}

function RolePermission({ permission, selected, onToggle, compact = false, disabled = false }) {
  return (
    <label
      className={[
        "admin-role-permission",
        compact ? "is-compact" : "is-matrix",
        selected ? "is-selected" : "",
        disabled ? "is-disabled" : "",
      ].filter(Boolean).join(" ")}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={() => onToggle(permission.code)}
      />
      <span className="admin-role-permission-copy">
        <strong>{permission.code}</strong>
        <small>{permission.description || "No description"}</small>
      </span>
      {!compact && selected && <span className="admin-role-permission-mark" aria-hidden="true" />}
    </label>
  );
}

export default function RoleManagement() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyRole);
  const [editing, setEditing] = useState(null);
  const [roleSearch, setRoleSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api("/roles").then((response) => response.data),
    enabled: hasPermission("roles.manage"),
  });
  const permissions = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api("/permissions").then((response) => response.data),
    enabled: hasPermission("roles.manage"),
  });

  const permissionList = useMemo(() =>
    [...(permissions.data || [])].sort((a, b) => a.code.localeCompare(b.code)),
  [permissions.data]);

  const filteredRoles = useMemo(() => {
    const search = roleSearch.trim().toLocaleLowerCase();
    return [...(roles.data || [])]
      .filter((role) => !search || [
        role.name,
        role.code,
        role.description,
        ...(role.code === "SYSTEM_ADMIN"
          ? permissionList.map((permission) => permission.code)
          : permissionCodes(role)),
      ].some((value) => String(value || "").toLocaleLowerCase().includes(search)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roles.data, roleSearch, permissionList]);

  const filteredPermissions = useMemo(() => {
    const search = permissionSearch.trim().toLocaleLowerCase();
    return permissionList.filter((permission) => !search ||
      (permission.code + " " + (permission.description || ""))
        .toLocaleLowerCase().includes(search));
  }, [permissionList, permissionSearch]);

  const createRole = useMutation({
    mutationFn: () => api("/roles", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setForm({ ...emptyRole, permissionCodes: [] });
      setCreateError("");
    },
    onError: (err) => setCreateError(err.message),
  });

  const updateRole = useMutation({
    mutationFn: () => api("/roles/" + editing.id, {
      method: "PATCH",
      body: JSON.stringify({
        name: editing.name,
        description: editing.description || null,
        permissionCodes: editing.permissionCodes,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditing(null);
      setEditError("");
    },
    onError: (err) => setEditError(err.message),
  });

  const openEditor = (role) => {
    if (role.code === "SYSTEM_ADMIN") return;
    setEditing({ ...role, description: role.description || "", permissionCodes: permissionCodes(role) });
    setPermissionSearch("");
    setCopiedCode(false);
    setEditError("");
  };

  const toggleCreatePermission = (code) => {
    setForm((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(code)
        ? current.permissionCodes.filter((item) => item !== code)
        : [...current.permissionCodes, code],
    }));
  };

  const toggleEditPermission = (code) => {
    setEditing((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(code)
        ? current.permissionCodes.filter((item) => item !== code)
        : [...current.permissionCodes, code],
    }));
  };

  const changeVisiblePermissions = (selected) => {
    const visibleCodes = new Set(filteredPermissions.map((permission) => permission.code));
    setEditing((current) => ({
      ...current,
      permissionCodes: selected
        ? [...new Set([...current.permissionCodes, ...visibleCodes])]
        : current.permissionCodes.filter((code) => !visibleCodes.has(code)),
    }));
  };

  if (!hasPermission("roles.manage")) return null;

  return (
    <div className="admin-roles-layout" aria-label="Roles management">
      <aside className="admin-role-create-card">
        <form
          className="admin-role-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            setCreateError("");
            createRole.mutate();
          }}
        >
          <div className="admin-role-create-heading">
            <span className="admin-role-heading-icon"><ShieldPlus size={19} /></span>
            <div className="admin-role-heading-copy">
              <h2>Create role</h2>
              <p>Declare a customized security authority</p>
            </div>
            <span className="admin-role-heading-dot" aria-hidden="true" />
          </div>

          <div className="admin-role-field">
            <div className="admin-role-label-line"><label htmlFor="admin-new-role-name">Role name</label><small>Required</small></div>
            <span className="admin-role-input-wrap">
              <ShieldCheck size={15} aria-hidden="true" />
              <input id="admin-new-role-name" className="input" required placeholder="Role name"
                value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </span>
          </div>

          <div className="admin-role-field">
            <div className="admin-role-label-line"><label htmlFor="admin-new-role-code">Role code</label><small>e.g. STORE_MANAGER</small></div>
            <span className="admin-role-input-wrap">
              <Code2 size={15} aria-hidden="true" />
              <input id="admin-new-role-code" className="input" required placeholder="STORE_MANAGER"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
            </span>
          </div>

          <div className="admin-role-field">
            <label htmlFor="admin-new-role-description">Description</label>
            <textarea id="admin-new-role-description" className="admin-role-textarea" rows={3}
              placeholder="Description (optional)" value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>

          <section className="admin-role-create-permissions" aria-label="Create role permissions">
            <div className="admin-role-create-permissions-head">
              <span><SlidersHorizontal size={15} /> Permissions checklist</span>
              <span className="admin-role-selected-count">{form.permissionCodes.length} selected</span>
            </div>
            <div className="admin-role-permission-tools">
              <button type="button" disabled={!permissionList.length}
                onClick={() => setForm((current) => ({ ...current, permissionCodes: permissionList.map((item) => item.code) }))}>
                Select all
              </button>
              <button type="button" disabled={!form.permissionCodes.length}
                onClick={() => setForm((current) => ({ ...current, permissionCodes: [] }))}>
                Clear
              </button>
            </div>
            <div className="admin-role-create-permission-list">
              {permissions.isLoading ? <p className="admin-role-list-message">Loading permissions…</p>
                : permissions.isError ? <p className="admin-role-list-message" role="alert">Unable to load permissions.</p>
                  : permissionList.length ? permissionList.map((permission) => (
                    <RolePermission key={permission.id || permission.code} permission={permission}
                      selected={form.permissionCodes.includes(permission.code)} onToggle={toggleCreatePermission} compact />
                  )) : <p className="admin-role-list-message">No permissions available.</p>}
            </div>
          </section>

          <ErrorBox error={createError} />
          <button type="submit" className="btn-primary admin-role-create-submit" disabled={createRole.isPending}>
            <ShieldPlus size={16} aria-hidden="true" />
            {createRole.isPending ? "Creating…" : "Create role"}
          </button>
        </form>
      </aside>

      <section className="admin-role-directory" aria-label="Configured roles">
        <div className="admin-role-directory-header">
          <div className="admin-role-directory-title">
            <h2>Configured Roles</h2>
            <span>{roles.data?.length || 0} roles defined</span>
          </div>
          <label className="admin-role-directory-search">
            <Search size={15} aria-hidden="true" />
            <input type="search" aria-label="Filter roles or permission codes" placeholder="Filter roles or tokens..."
              value={roleSearch} onChange={(event) => setRoleSearch(event.target.value)} />
          </label>
        </div>

        <div className="admin-role-cards">
          {roles.isLoading ? <p className="admin-role-list-message">Loading roles…</p>
            : roles.isError ? <p className="admin-role-list-message" role="alert">Unable to load roles.</p>
              : !filteredRoles.length ? <p className="admin-role-list-message">No roles match your search.</p>
                : filteredRoles.map((role) => {
                  const protectedRole = role.code === "SYSTEM_ADMIN";
                  const codes = protectedRole && permissionList.length
                    ? permissionList.map((permission) => permission.code)
                    : permissionCodes(role);
                  return (
                    <article key={role.id} className={"admin-role-card " + (protectedRole ? "is-protected" : "")}>
                      <div className="admin-role-card-header">
                        <div className="admin-role-card-heading">
                          <h3>{role.name}</h3>
                          <span className="admin-role-code-badge">{role.code}</span>
                          {protectedRole && <span className="admin-role-protected-badge"><LockKeyhole size={11} /> Protected</span>}
                        </div>
                        <button type="button" className="admin-role-edit-button" aria-label={"Edit " + role.name}
                          title={protectedRole ? "System Administrator cannot be changed" : "Edit role"}
                          disabled={protectedRole} onClick={() => openEditor(role)}>
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <p className="admin-role-card-description">{role.description || "No description"}</p>
                      {protectedRole && (
                        <p className="admin-role-protected-note">
                          <ShieldCheck size={14} aria-hidden="true" />
                          System Administrator always has every application permission and cannot be downgraded.
                        </p>
                      )}
                      <div className="admin-role-permission-tags" aria-label={"Permissions for " + role.name}>
                        {codes.length ? codes.map((code) => <span key={code}>{code}</span>)
                          : <span className="is-empty">No permissions assigned</span>}
                      </div>
                    </article>
                  );
                })}
        </div>
      </section>

      {editing && (
        <Modal title={"Edit role: " + editing.name} badge="CONFIGURED ROLE"
          subtitle={"Role definition · " + editing.code + (editing.createdAt
            ? " · Created " + new Date(editing.createdAt).toLocaleDateString() : "")}
          headerIcon={<ShieldCheck size={19} />} className="admin-role-edit-modal" wide
          onClose={() => { setEditing(null); setEditError(""); }}>
          <form className="admin-role-edit-form" onSubmit={(event) => {
            event.preventDefault();
            setEditError("");
            updateRole.mutate();
          }}>
            <section className="admin-role-credentials" aria-label="Role credentials">
              <div className="admin-role-credentials-heading">
                <h3><ShieldCheck size={15} aria-hidden="true" /> Role credentials</h3>
                <span>Role details</span>
              </div>
              <div className="admin-role-credentials-grid">
                <div className="admin-role-field">
                  <label htmlFor="admin-edit-role-code">Role code <small>Unique immutable key</small></label>
                  <div className="admin-role-code-readonly">
                    <input id="admin-edit-role-code" value={editing.code} readOnly aria-readonly="true" />
                    <button type="button" aria-label="Copy role code" title="Copy role code"
                      onClick={() => {
                        if (!navigator.clipboard?.writeText) return;
                        navigator.clipboard.writeText(editing.code).then(() => setCopiedCode(true)).catch(() => setCopiedCode(false));
                      }}>
                      {copiedCode ? <Check size={15} /> : <Clipboard size={15} />}
                    </button>
                  </div>
                </div>
                <div className="admin-role-field">
                  <label htmlFor="admin-edit-role-name">Role name <small>Visible in directory</small></label>
                  <input id="admin-edit-role-name" className="admin-role-plain-input" required
                    value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                </div>
                <div className="admin-role-field admin-role-credentials-description">
                  <label htmlFor="admin-edit-role-description">Description</label>
                  <textarea id="admin-edit-role-description" className="admin-role-textarea" rows={2}
                    value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
                </div>
              </div>
            </section>

            <section className="admin-role-matrix-section" aria-label="Permissions matrix">
              <div className="admin-role-matrix-heading">
                <div>
                  <div className="admin-role-matrix-title">
                    <h3>Permissions matrix</h3>
                    <span>{editing.permissionCodes.length} of {permissionList.length} active</span>
                  </div>
                  <p>Toggle granular capabilities granted to users holding this role.</p>
                </div>
                <div className="admin-role-matrix-controls">
                  <label className="admin-role-matrix-search">
                    <Search size={14} aria-hidden="true" />
                    <input type="search" aria-label="Filter permissions" placeholder="Filter permissions..."
                      value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} />
                  </label>
                  <button type="button" onClick={() => changeVisiblePermissions(true)}
                    disabled={!filteredPermissions.length}>Select all</button>
                  <button type="button" onClick={() => changeVisiblePermissions(false)}
                    disabled={!filteredPermissions.length}>Deselect</button>
                </div>
              </div>
              <div className="admin-role-matrix-grid">
                {permissions.isLoading ? <p className="admin-role-list-message">Loading permissions…</p>
                  : permissions.isError ? <p className="admin-role-list-message" role="alert">Unable to load permissions.</p>
                    : filteredPermissions.length ? filteredPermissions.map((permission) => (
                      <RolePermission key={permission.id || permission.code} permission={permission}
                        selected={editing.permissionCodes.includes(permission.code)} onToggle={toggleEditPermission} />
                    )) : <p className="admin-role-list-message">No matching permissions.</p>}
              </div>
            </section>

            <ErrorBox error={editError} />
            <div className="admin-role-edit-actions">
              <span className="admin-role-tenant-note"><span aria-hidden="true" /> Permissions are saved only after confirmation.</span>
              <div>
                <button type="button" className="admin-role-cancel" onClick={() => { setEditing(null); setEditError(""); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary admin-role-save" disabled={updateRole.isPending}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  {updateRole.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
