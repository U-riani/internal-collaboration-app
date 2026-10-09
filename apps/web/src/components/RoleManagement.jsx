import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ErrorBox, Field, Modal } from "./UI.jsx";

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

function PermissionPicker({ permissions, selected, onChange, disabled = false }) {
  const toggle = (code) => {
    if (disabled) return;
    onChange(
      selected.includes(code)
        ? selected.filter((item) => item !== code)
        : [...selected, code],
    );
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {permissions.map((permission) => (
        <label
          key={permission.id}
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm"
        >
          <input
            type="checkbox"
            className="mt-1"
            checked={selected.includes(permission.code)}
            disabled={disabled}
            onChange={() => toggle(permission.code)}
          />
          <span>
            <span className="block font-medium text-slate-800">
              {permission.code}
            </span>
            <span className="text-xs text-slate-500">
              {permission.description || "No description"}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default function RoleManagement() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyRole);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

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

  const createRole = useMutation({
    mutationFn: () =>
      api("/roles", {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setForm(emptyRole);
      setError("");
    },
    onError: (err) => setError(err.message),
  });

  const updateRole = useMutation({
    mutationFn: () =>
      api(`/roles/${editing.id}`, {
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
      setError("");
    },
    onError: (err) => setError(err.message),
  });

  if (!hasPermission("roles.manage")) return null;

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form
          className="card h-fit p-6"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            createRole.mutate();
          }}
        >
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="text-blue-600" />
            <h2 className="font-bold">Create role</h2>
          </div>
          <div className="space-y-4">
            <Field
              label="Role name"
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <Field
              label="Role code"
              required
              value={form.code}
              placeholder="STORE_MANAGER"
              onChange={(event) =>
                setForm({
                  ...form,
                  code: event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9_]/g, "_"),
                })
              }
            />
            <Field
              label="Description"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">
                Permissions
              </div>
              <PermissionPicker
                permissions={permissions.data ?? []}
                selected={form.permissionCodes}
                onChange={(permissionCodes) =>
                  setForm({ ...form, permissionCodes })
                }
              />
            </div>
            <button
              className="btn-primary w-full"
              disabled={createRole.isPending}
            >
              <Plus size={16} className="mr-2 inline" />
              Create role
            </button>
          </div>
        </form>

        <div className="grid content-start gap-4 md:grid-cols-2">
          {roles.isLoading ? (
            <div className="card p-5 text-sm text-slate-500">
              Loading roles…
            </div>
          ) : (
            roles.data?.map((role) => {
              const codes = permissionCodes(role);
              const protectedRole = role.code === "SYSTEM_ADMIN";
              return (
                <article className="card p-5" key={role.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">{role.name}</h2>
                        <span className="badge bg-slate-100 text-slate-600">
                          {role.code}
                        </span>
                        {protectedRole && (
                          <span className="badge bg-amber-100 text-amber-700">
                            Protected
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {role.description || "No description"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={protectedRole}
                      title={
                        protectedRole
                          ? "SYSTEM_ADMIN is immutable"
                          : "Edit role"
                      }
                      onClick={() => {
                        setError("");
                        setEditing({
                          ...role,
                          description: role.description || "",
                          permissionCodes: codes,
                        });
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {codes.length ? (
                      codes.map((code) => (
                        <span
                          key={code}
                          className="badge bg-blue-50 text-blue-700"
                        >
                          {code}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">
                        No permissions assigned
                      </span>
                    )}
                  </div>
                  {protectedRole && (
                    <p className="mt-4 text-xs text-slate-400">
                      System Administrator always has every application
                      permission and cannot be downgraded.
                    </p>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>

      {editing && (
        <Modal title={`Edit role: ${editing.name}`} onClose={() => setEditing(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              updateRole.mutate();
            }}
          >
            <Field label="Role code" value={editing.code} disabled />
            <Field
              label="Role name"
              required
              value={editing.name}
              onChange={(event) =>
                setEditing({ ...editing, name: event.target.value })
              }
            />
            <Field
              label="Description"
              value={editing.description}
              onChange={(event) =>
                setEditing({ ...editing, description: event.target.value })
              }
            />
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-slate-700">
                Permissions
              </div>
              <PermissionPicker
                permissions={permissions.data ?? []}
                selected={editing.permissionCodes}
                onChange={(permissionCodes) =>
                  setEditing({ ...editing, permissionCodes })
                }
              />
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Users with this role will be signed out after a permission
              change so the new access takes effect everywhere.
            </p>
            <ErrorBox error={error} />
            <div className="form-actions">
              <button className="btn-primary" disabled={updateRole.isPending}>
                Save role
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
