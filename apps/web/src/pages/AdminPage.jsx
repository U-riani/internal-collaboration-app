import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, ShieldCheck, UserPlus } from "lucide-react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Modal, Field, ErrorBox } from "../components/UI.jsx";
import PageHeader from "../components/PageHeader.jsx";

export default function AdminPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("users");
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    jobTitle: "",
    departmentId: "",
    roleCodes: ["EMPLOYEE"],
  });
  const [deptForm, setDeptForm] = useState({ name: "", code: "" });
  const [error, setError] = useState("");
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api("/departments").then((r) => r.data),
  });
  const createUser = useMutation({
    mutationFn: () =>
      api("/users", {
        method: "POST",
        body: JSON.stringify({
          ...userForm,
          departmentId: userForm.departmentId || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setUserForm({
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        jobTitle: "",
        departmentId: "",
        roleCodes: ["EMPLOYEE"],
      });
      setError("");
    },
    onError: (err) => setError(err.message),
  });
  const createDept = useMutation({
    mutationFn: () =>
      api("/departments", { method: "POST", body: JSON.stringify(deptForm) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setDeptForm({ name: "", code: "" });
      setError("");
    },
    onError: (err) => setError(err.message),
  });
  const updateUser = useMutation({
    mutationFn: () =>
      api(`/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: editing.firstName,
          lastName: editing.lastName,
          displayName: editing.displayName,
          jobTitle: editing.jobTitle,
          departmentId: editing.departmentId || null,
          managerId: editing.managerId || null,
          status: editing.status,
          roleCodes: editing.roles,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditing(null);
    },
    onError: (e) => setError(e.message),
  });
  const updateDept = useMutation({
    mutationFn: ({ id, managerId }) =>
      api(`/departments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ managerId: managerId || null }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["departments"] }),
    onError: (e) => setError(e.message),
  });
  if (!hasPermission("users.manage"))
    return <Navigate to="/dashboard" replace />;

  return (
    <>
      <PageHeader
        title="Administration"
        description="Manage employees, departments, roles, and organization access."
      />
      <div className="mb-5 flex gap-2">
        <button
          className={tab === "users" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("users")}
        >
          Users
        </button>
        <button
          className={tab === "departments" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("departments")}
        >
          Departments
        </button>
      </div>
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {tab === "users" ? (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUser.mutate();
            }}
            className="card h-fit p-6"
          >
            <div className="mb-5 flex items-center gap-2">
              <UserPlus className="text-blue-600" />
              <h2 className="font-bold">Create user</h2>
            </div>
            <div className="space-y-4">
              <input
                className="input"
                placeholder="First name"
                value={userForm.firstName}
                onChange={(e) =>
                  setUserForm({ ...userForm, firstName: e.target.value })
                }
                required
              />
              <input
                className="input"
                placeholder="Last name"
                value={userForm.lastName}
                onChange={(e) =>
                  setUserForm({ ...userForm, lastName: e.target.value })
                }
                required
              />
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={userForm.email}
                onChange={(e) =>
                  setUserForm({ ...userForm, email: e.target.value })
                }
                required
              />
              <input
                className="input"
                type="password"
                placeholder="Initial password"
                minLength={8}
                value={userForm.password}
                onChange={(e) =>
                  setUserForm({ ...userForm, password: e.target.value })
                }
                required
              />
              <input
                className="input"
                placeholder="Job title"
                value={userForm.jobTitle}
                onChange={(e) =>
                  setUserForm({ ...userForm, jobTitle: e.target.value })
                }
              />
              <select
                className="input"
                value={userForm.departmentId}
                onChange={(e) =>
                  setUserForm({ ...userForm, departmentId: e.target.value })
                }
              >
                <option value="">No department</option>
                {departments.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={userForm.roleCodes[0]}
                onChange={(e) =>
                  setUserForm({ ...userForm, roleCodes: [e.target.value] })
                }
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="AUDITOR">Auditor</option>
                <option value="SYSTEM_ADMIN">System administrator</option>
              </select>
              <button
                className="btn-primary w-full"
                disabled={createUser.isPending}
              >
                <Plus size={16} className="mr-2 inline" />
                Create user
              </button>
            </div>
          </form>
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 p-5 font-bold">
              Organization users
            </div>
            <div className="divide-y divide-slate-100">
              {users.data?.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-5"
                >
                  <div>
                    <div className="font-semibold">{item.displayName}</div>
                    <div className="text-sm text-slate-500">
                      {item.email} · {item.jobTitle || "Employee"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-blue-600"
                      onClick={() => {
                        setError("");
                        setEditing(item);
                      }}
                    >
                      Edit
                    </button>
                    {item.roles.map((role) => (
                      <span
                        key={role}
                        className="badge bg-blue-50 text-blue-700"
                      >
                        <ShieldCheck size={12} className="mr-1" />
                        {role}
                      </span>
                    ))}
                    <span
                      className={`badge ${item.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createDept.mutate();
            }}
            className="card h-fit p-6"
          >
            <div className="mb-5 flex items-center gap-2">
              <Building2 className="text-blue-600" />
              <h2 className="font-bold">Create department</h2>
            </div>
            <div className="space-y-4">
              <input
                className="input"
                placeholder="Department name"
                value={deptForm.name}
                onChange={(e) =>
                  setDeptForm({ ...deptForm, name: e.target.value })
                }
                required
              />
              <input
                className="input"
                placeholder="Code, e.g. FIN"
                value={deptForm.code}
                onChange={(e) =>
                  setDeptForm({
                    ...deptForm,
                    code: e.target.value.toUpperCase(),
                  })
                }
                required
              />
              <button className="btn-primary w-full">Create department</button>
            </div>
          </form>
          <div className="grid gap-4 md:grid-cols-2">
            {departments.data?.map((item) => (
              <article className="card p-5" key={item.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-bold">{item.name}</h2>
                    <p className="text-sm text-slate-500">{item.code}</p>
                  </div>
                  <span className="badge bg-slate-100 text-slate-600">
                    {item._count.users} users
                  </span>
                </div>
                <p className="mt-4 text-sm text-slate-500">
                  Manager: {item.manager?.displayName || "Not assigned"}
                </p>
                <select
                  aria-label={`Manager for ${item.name}`}
                  className="input mt-3"
                  value={item.managerId || ""}
                  onChange={(e) =>
                    updateDept.mutate({
                      id: item.id,
                      managerId: e.target.value,
                    })
                  }
                >
                  <option value="">No manager</option>
                  {users.data
                    ?.filter((u) => u.status === "ACTIVE")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName}
                      </option>
                    ))}
                </select>
              </article>
            ))}
          </div>
        </div>
      )}
      {editing && (
        <Modal
          title={`Edit ${editing.displayName}`}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateUser.mutate();
            }}
          >
            <Field
              label="Display name"
              required
              value={editing.displayName}
              onChange={(e) =>
                setEditing({ ...editing, displayName: e.target.value })
              }
            />
            <Field
              label="Job title"
              value={editing.jobTitle || ""}
              onChange={(e) =>
                setEditing({ ...editing, jobTitle: e.target.value })
              }
            />
            <Field label="Role">
              <select
                className="input"
                value={editing.roles[0]}
                onChange={(e) =>
                  setEditing({ ...editing, roles: [e.target.value] })
                }
              >
                {["EMPLOYEE", "MANAGER", "SYSTEM_ADMIN", "AUDITOR"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select
                className="input"
                value={editing.departmentId || ""}
                onChange={(e) =>
                  setEditing({ ...editing, departmentId: e.target.value })
                }
              >
                <option value="">No department</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reports to">
              <select
                className="input"
                value={editing.managerId || ""}
                onChange={(e) =>
                  setEditing({ ...editing, managerId: e.target.value })
                }
              >
                <option value="">No manager</option>
                {users.data
                  ?.filter((u) => u.id !== editing.id && u.status === "ACTIVE")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Account status">
              <select
                className="input"
                value={editing.status}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value })
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
            <p className="mt-4 text-xs text-slate-400">
              Changing roles or departments signs this person out so the new
              access takes effect.
            </p>
            <ErrorBox error={error} />
            <div className="form-actions">
              <button className="btn-primary" disabled={updateUser.isPending}>
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
