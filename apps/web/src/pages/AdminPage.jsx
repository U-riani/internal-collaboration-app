import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
  BriefcaseBusiness,
  LockKeyhole,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Modal, Field, ErrorBox, Avatar } from "../components/UI.jsx";
import FilterMultiSelect from "../components/FilterMultiSelect.jsx";
import AppSelect from "../components/AppSelect.jsx";
import "./administration-users.css";
import PageHeader from "../components/PageHeader.jsx";
import RoleManagement from "../components/RoleManagement.jsx";

const USER_PAGE_SIZE = 8;

const fallbackRoles = [
  { code: "EMPLOYEE", name: "Employee" },
  { code: "MANAGER", name: "Manager" },
  { code: "STORE", name: "Store" },
  { code: "AUDITOR", name: "Auditor" },
  { code: "SYSTEM_ADMIN", name: "System administrator" },
];

export default function AdminPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [userFilters, setUserFilters] = useState({
    q: "",
    departmentId: "",
    role: "",
    status: "",
  });
  const [tab, setTab] = useState("users");
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    jobTitle: "",
    departmentId: "",
    roleCodes: ["EMPLOYEE"],
  });
  const [deptForm, setDeptForm] = useState({ name: "", code: "" });
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const userQueryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(userFilters)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [userFilters]);
  const users = useQuery({
    queryKey: ["users", "admin-reference"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const filteredUsers = useQuery({
    queryKey: ["users", "admin-list", userQueryString],
    queryFn: () =>
      api(`/users${userQueryString ? `?${userQueryString}` : ""}`).then(
        (r) => r.data,
      ),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api("/departments").then((r) => r.data),
  });
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api("/roles").then((r) => r.data),
    enabled: hasPermission("roles.manage"),
  });
  const roleOptions = roles.data?.length ? roles.data : fallbackRoles;
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
        phone: "",
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
          phone: editing.phone || null,
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
  const resetPassword = useMutation({
    mutationFn: () =>
      api(`/users/${editing.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: passwordForm.password }),
      }),
    onSuccess: () => {
      setPasswordForm({ password: "", confirmPassword: "" });
      setPasswordSuccess(
        "Password updated. Existing sessions for this user were revoked.",
      );
      setError("");
    },
    onError: (e) => {
      setPasswordSuccess("");
      setError(e.message);
    },
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
  const directoryUsers = filteredUsers.data || [];
  const pageCount = Math.max(1, Math.ceil(directoryUsers.length / USER_PAGE_SIZE));
  const currentPage = Math.min(userPage, pageCount);
  const pageStart = (currentPage - 1) * USER_PAGE_SIZE;
  const visibleUsers = directoryUsers.slice(pageStart, pageStart + USER_PAGE_SIZE);
  const changeUserFilter = (name, value) => {
    setUserFilters((filters) => ({ ...filters, [name]: value }));
    setUserPage(1);
  };
  const openEditor = (user) => {
    setError("");
    setPasswordSuccess("");
    setPasswordForm({ password: "", confirmPassword: "" });
    setEditing(user);
  };
  const closeEditor = () => {
    setEditing(null);
    setError("");
    setPasswordSuccess("");
  };

  if (!hasPermission("users.manage"))
    return <Navigate to="/dashboard" replace />;

  return (
    <div className="administration-page">
      <PageHeader
        title="Administration"
        action={
          <div className="admin-page-actions">
            {tab === "users" && (
              <button
                type="button"
                className="admin-mobile-create-toggle btn-secondary"
                onClick={() => setShowCreateForm((open) => !open)}
                aria-expanded={showCreateForm}
              >
                {showCreateForm ? <X size={15} /> : <Plus size={15} />}
                <span>{showCreateForm ? "Close" : "Create"}</span>
              </button>
            )}
            <nav className="admin-section-tabs" aria-label="Administration sections">
              <button
                type="button"
                className={"admin-section-tab " + (tab === "users" ? "is-active" : "")}
                aria-current={tab === "users" ? "page" : undefined}
                onClick={() => setTab("users")}
              >
                <UsersRound size={15} /> Users
              </button>
              <button
                type="button"
                className={"admin-section-tab " + (tab === "departments" ? "is-active" : "")}
                aria-current={tab === "departments" ? "page" : undefined}
                onClick={() => setTab("departments")}
              >
                <Building2 size={15} /> Departments
              </button>
              {hasPermission("roles.manage") && (
                <button
                  type="button"
                  className={"admin-section-tab " + (tab === "roles" ? "is-active" : "")}
                  aria-current={tab === "roles" ? "page" : undefined}
                  onClick={() => setTab("roles")}
                >
                  <ShieldCheck size={15} /> Roles
                </button>
              )}
            </nav>
          </div>
        }
      />
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {tab === "users" ? (
        <div className="admin-users-layout">
          <aside className={"admin-create-panel card " + (showCreateForm ? "is-mobile-open" : "")}>
            <form
              className="admin-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                setError("");
                createUser.mutate();
              }}
            >
              <div className="admin-panel-heading">
                <span className="admin-panel-icon"><UserPlus size={20} /></span>
                <div>
                  <h2>Create user</h2>
                  <p>Enroll member to directory</p>
                </div>
                <button
                  type="button"
                  className="admin-create-mobile-close icon-btn"
                  onClick={() => setShowCreateForm(false)}
                  aria-label="Close create user form"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="admin-create-fields">
                <div className="admin-create-name-row">
                  <label className="admin-form-field">
                    <span>First name</span>
                    <input className="input" placeholder="First name" value={userForm.firstName}
                      onChange={(event) => setUserForm({ ...userForm, firstName: event.target.value })}
                      autoComplete="given-name" required />
                  </label>
                  <label className="admin-form-field">
                    <span>Last name</span>
                    <input className="input" placeholder="Last name" value={userForm.lastName}
                      onChange={(event) => setUserForm({ ...userForm, lastName: event.target.value })}
                      autoComplete="family-name" required />
                  </label>
                </div>

                <label className="admin-form-field">
                  <span>Email</span>
                  <span className="admin-input-wrap">
                    <Mail size={15} aria-hidden="true" />
                    <input className="input" type="email" placeholder="Email" value={userForm.email}
                      onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
                      autoComplete="email" required />
                  </span>
                </label>
                <label className="admin-form-field">
                  <span>Phone number</span>
                  <span className="admin-input-wrap">
                    <Phone size={15} aria-hidden="true" />
                    <input className="input" type="tel" placeholder="Phone number" value={userForm.phone}
                      onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })}
                      autoComplete="tel" />
                  </span>
                </label>
                <div className="admin-form-field">
                  <label htmlFor="admin-initial-password">Initial password</label>
                  <span className="admin-input-wrap">
                    <LockKeyhole size={15} aria-hidden="true" />
                    <input id="admin-initial-password" className="input"
                      type={showInitialPassword ? "text" : "password"}
                      placeholder="Initial password" minLength={8} value={userForm.password}
                      onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                      autoComplete="new-password" required />
                    <button type="button" className="admin-password-toggle icon-btn"
                      aria-label={showInitialPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowInitialPassword((visible) => !visible)}>
                      {showInitialPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </span>
                </div>
                <label className="admin-form-field">
                  <span>Job title</span>
                  <span className="admin-input-wrap">
                    <BriefcaseBusiness size={15} aria-hidden="true" />
                    <input className="input" placeholder="Job title" value={userForm.jobTitle}
                      onChange={(event) => setUserForm({ ...userForm, jobTitle: event.target.value })} />
                  </span>
                </label>
                <div className="admin-form-field">
                  <span>Department</span>
                  <AppSelect
                    ariaLabel="Department"
                    icon={Building2}
                    value={userForm.departmentId}
                    onChange={(value) => setUserForm({ ...userForm, departmentId: value })}
                    options={[
                      { value: "", label: "No department" },
                      ...(departments.data || []).map((department) => ({
                        value: department.id,
                        label: department.name,
                      })),
                    ]}
                  />
                </div>
                <div className="admin-form-field">
                  <span>Role</span>
                  <AppSelect
                    ariaLabel="Role"
                    icon={ShieldCheck}
                    value={userForm.roleCodes[0]}
                    onChange={(value) => setUserForm({ ...userForm, roleCodes: [value] })}
                    options={roleOptions.map((role) => ({
                      value: role.code,
                      label: role.name,
                    }))}
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary admin-create-submit"
                disabled={createUser.isPending}>
                <UserPlus size={17} />
                {createUser.isPending ? "Creating…" : "Create user"}
              </button>
            </form>
          </aside>

          <section className="admin-directory-panel" aria-label="User directory">
            <div className="admin-directory-toolbar">
              <div className="admin-directory-search-row">
                <label className="admin-directory-search">
                  <Search size={16} aria-hidden="true" />
                  <input type="search" aria-label="Search users" placeholder="Search users..."
                    value={userFilters.q}
                    onChange={(event) => changeUserFilter("q", event.target.value)} />
                </label>
                <span className="admin-users-count">
                  <span className="admin-count-dot" aria-hidden="true" />
                  {directoryUsers.length} {directoryUsers.length === 1 ? "user" : "users"}
                </span>
              </div>
              <div className="admin-directory-filters" id="admin-user-filters">
                <AppSelect
                  className="admin-directory-select"
                  ariaLabel="Filter users by department"
                  icon={Building2}
                  value={userFilters.departmentId}
                  onChange={(value) => changeUserFilter("departmentId", value)}
                  options={[
                    { value: "", label: "All departments" },
                    ...(departments.data || []).map((department) => ({
                      value: department.id,
                      label: department.name,
                    })),
                  ]}
                />
                <AppSelect
                  className="admin-directory-select"
                  ariaLabel="Filter users by role"
                  icon={ShieldCheck}
                  value={userFilters.role}
                  onChange={(value) => changeUserFilter("role", value)}
                  options={[
                    { value: "", label: "All roles" },
                    ...roleOptions.map((role) => ({
                      value: role.code,
                      label: role.name,
                    })),
                  ]}
                />
                <AppSelect
                  className="admin-directory-select"
                  ariaLabel="Filter users by status"
                  value={userFilters.status}
                  onChange={(value) => changeUserFilter("status", value)}
                  options={[
                    { value: "", label: "All statuses" },
                    { value: "ACTIVE", label: "Active" },
                    { value: "INACTIVE", label: "Inactive" },
                  ]}
                />
              </div>
            </div>

            <div className="admin-directory-list" aria-live="polite">
              {filteredUsers.isLoading ? (
                <p className="admin-directory-empty">Loading directory…</p>
              ) : filteredUsers.isError ? (
                <p className="admin-directory-empty" role="alert">
                  Unable to load users. Please try again.
                </p>
              ) : visibleUsers.length === 0 ? (
                <p className="admin-directory-empty">No users match the selected filters.</p>
              ) : (
                visibleUsers.map((item) => (
                  <article key={item.id} className="admin-user-card">
                    <div className="admin-user-avatar-wrap">
                      <Avatar name={item.displayName} userId={item.id} photoUrl={item.avatarUrl}
                        className="admin-user-avatar" />
                    </div>
                    <div className="admin-user-details">
                      <h3 title={item.displayName}>{item.displayName}</h3>
                      <span className="admin-department-tag">
                        {item.department?.name || "No department"}
                      </span>
                      <p className="admin-user-contact" title={item.email}>
                        {item.email}
                        <span className="admin-contact-divider">·</span>
                        {item.phone || "No phone"}
                      </p>
                      {item.jobTitle && <p className="admin-user-job">{item.jobTitle}</p>}
                    </div>
                    <div className="admin-user-badges">
                      {item.roles.map((role) => (
                        <span key={role} className="admin-role-badge" data-role={role}>
                          <ShieldCheck size={13} aria-hidden="true" />
                          {role}
                        </span>
                      ))}
                      <span className={"admin-account-badge " + (item.status === "ACTIVE" ? "is-active" : "is-inactive")}>
                        <span aria-hidden="true" />
                        {item.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                      <button type="button" className="btn-secondary admin-edit-button"
                        onClick={() => openEditor(item)} aria-label={"Edit " + item.displayName}>
                        <Pencil size={14} aria-hidden="true" /> Edit
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
            <footer className="admin-directory-footer">
              <span>
                Showing {directoryUsers.length ? pageStart + 1 : 0}–{Math.min(pageStart + USER_PAGE_SIZE, directoryUsers.length)}
                {" "}of {directoryUsers.length} directory accounts
              </span>
              <nav className="admin-directory-pagination" aria-label="User directory pages">
                <button type="button" className="admin-page-arrow" disabled={currentPage === 1}
                  onClick={() => setUserPage(currentPage - 1)} aria-label="Previous page">
                  <ChevronLeft size={15} /> <span>Previous</span>
                </button>
                <span className="admin-page-number" aria-label={"Page " + currentPage}>{currentPage}</span>
                <button type="button" className="admin-page-arrow" disabled={currentPage === pageCount}
                  onClick={() => setUserPage(currentPage + 1)} aria-label="Next page">
                  <span>Next</span> <ChevronRight size={15} />
                </button>
              </nav>
            </footer>
          </section>
        </div>
      ) : tab === "departments" ? (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createDept.mutate();
            }}
            className={`card h-fit p-6 ${showCreateForm ? "" : "hidden"}  md:block`}
          >
            <div className="mb-5 flex items-center gap-2">
              <Building2 className="text-blue-600" />
              <h2 className="font-bold">Create department</h2>
              <div className="ml-auto text-sm text-slate-500">
                <button
                  className={"btn-secondary md:hidden!"}
                  onClick={() => setShowCreateForm(!showCreateForm)}
                >
                  {showCreateForm ? "x" : "+"}
                </button>
              </div>
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
                <AppSelect
                  className="admin-department-manager-select"
                  ariaLabel={"Manager for " + item.name}
                  value={item.managerId || ""}
                  onChange={(value) => updateDept.mutate({ id: item.id, managerId: value })}
                  options={[
                    { value: "", label: "No manager" },
                    ...(users.data || [])
                      .filter((user) => user.status === "ACTIVE")
                      .map((user) => ({
                        value: user.id,
                        label: user.displayName,
                      })),
                  ]}
                />
              </article>
            ))}
          </div>
        </div>
      ) : (
        <RoleManagement />
      )}
      {editing && (
        <Modal
          title="Edit user"
          headerIcon={<UserPlus size={19} />}
          onClose={closeEditor}
          className="admin-edit-modal"
          wide
        >
          <form
            className="admin-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              updateUser.mutate();
            }}
          >
            <div className="admin-edit-person">
              <Avatar name={editing.displayName} userId={editing.id}
                photoUrl={editing.avatarUrl} className="admin-edit-avatar" />
              <div className="admin-edit-person-copy">
                <h3>{editing.displayName}</h3>
                <p>{editing.email}</p>
              </div>
              <span className={"admin-account-badge " + (editing.status === "ACTIVE" ? "is-active" : "is-inactive")}>
                <span aria-hidden="true" />
                {editing.status === "ACTIVE" ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="admin-edit-fields">
              <Field label="First name" required value={editing.firstName || ""}
                onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} />
              <Field label="Last name" required value={editing.lastName || ""}
                onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} />
              <div className="admin-edit-span-2">
                <Field label="Display name" required value={editing.displayName}
                  onChange={(event) => setEditing({ ...editing, displayName: event.target.value })} />
              </div>
              <Field label="Phone number" value={editing.phone || ""}
                onChange={(event) => setEditing({ ...editing, phone: event.target.value })} />
              <Field label="Job title" value={editing.jobTitle || ""}
                onChange={(event) => setEditing({ ...editing, jobTitle: event.target.value })} />
              <div className="field admin-select-field">
                <span>Department</span>
                <AppSelect
                  ariaLabel="Edit department"
                  value={editing.departmentId || ""}
                  onChange={(value) => setEditing({ ...editing, departmentId: value })}
                  options={[
                    { value: "", label: "No department" },
                    ...(departments.data || []).map((department) => ({
                      value: department.id,
                      label: department.name,
                    })),
                  ]}
                />
              </div>
              <div className="field admin-select-field">
                <span>Role</span>
                <AppSelect
                  ariaLabel="Edit role"
                  value={editing.roles[0] || "EMPLOYEE"}
                  onChange={(value) => setEditing({ ...editing, roles: [value] })}
                  options={roleOptions.map((role) => ({
                    value: role.code,
                    label: role.name,
                  }))}
                />
              </div>
              <div className="field admin-select-field">
                <span>Account status</span>
                <AppSelect
                  ariaLabel="Edit account status"
                  value={editing.status}
                  onChange={(value) => setEditing({ ...editing, status: value })}
                  options={[
                    { value: "ACTIVE", label: "Active" },
                    { value: "INACTIVE", label: "Inactive" },
                  ]}
                />
              </div>
              <div className="admin-edit-span-2 admin-reports-to">
                <FilterMultiSelect
                  label="Reports to"
                  options={(users.data || [])
                    .filter((user) => user.id !== editing.id &&
                      (user.status === "ACTIVE" || user.id === editing.managerId))
                    .map((user) => ({
                      value: user.id,
                      label: user.displayName || user.email || "Unknown",
                      userId: user.id,
                      photoUrl: user.avatarUrl,
                    }))}
                  values={editing.managerId ? [editing.managerId] : []}
                  onToggle={(value) =>
                    setEditing((current) => ({
                      ...current,
                      managerId: current.managerId === value ? null : value,
                    }))
                  }
                />
                <p className="admin-reports-hint">
                  Select one reporting manager, or uncheck the selected person for no manager.
                </p>
              </div>
            </div>

            <p className="admin-access-notice">
              Changing a user's roles or department signs them out so their new access takes effect.
            </p>

            {hasPermission("users.password.reset") && (
              <section className="admin-password-section" aria-label="Reset user password">
                <div className="admin-password-heading">
                  <span className="admin-password-icon"><KeyRound size={17} /></span>
                  <div>
                    <h3>Set new password</h3>
                    <p>Existing sessions will be revoked after a password reset.</p>
                  </div>
                </div>
                <div className="admin-password-fields">
                  <Field label="New password" type="password" minLength={8} maxLength={128}
                    autoComplete="new-password" value={passwordForm.password}
                    onChange={(event) =>
                      setPasswordForm({ ...passwordForm, password: event.target.value })
                    } />
                  <Field label="Confirm new password" type="password" minLength={8} maxLength={128}
                    autoComplete="new-password" value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })
                    } />
                </div>
                <div className="admin-password-action">
                  <button type="button" className="btn-secondary" disabled={
                    resetPassword.isPending ||
                    passwordForm.password.length < 8 ||
                    passwordForm.confirmPassword.length < 8
                  } onClick={() => {
                    setError("");
                    setPasswordSuccess("");
                    if (passwordForm.password !== passwordForm.confirmPassword) {
                      setError("Passwords do not match");
                      return;
                    }
                    resetPassword.mutate();
                  }}>
                    <KeyRound size={15} />
                    {resetPassword.isPending ? "Updating…" : "Set password"}
                  </button>
                  {passwordSuccess && <p className="admin-password-success">{passwordSuccess}</p>}
                </div>
              </section>
            )}
            <ErrorBox error={error} />
            <div className="admin-edit-footer">
              <button type="button" className="btn-secondary" onClick={closeEditor}>
                Close
              </button>
              <button type="submit" className="btn-primary" disabled={updateUser.isPending}>
                {updateUser.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
