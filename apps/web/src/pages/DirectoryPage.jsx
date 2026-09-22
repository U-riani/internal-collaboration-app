import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, Search, UserRound } from "lucide-react";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";

export default function DirectoryPage() {
  const [filters, setFilters] = useState({
    q: "",
    departmentId: "",
    role: "",
    status: "ACTIVE",
  });
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [filters]);
  const { data = [], isLoading } = useQuery({
    queryKey: ["users", "directory", queryString],
    queryFn: () =>
      api(`/users${queryString ? `?${queryString}` : ""}`).then(
        (r) => r.data,
      ),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api("/departments").then((r) => r.data),
  });

  const setFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <>
      <PageHeader
        title="Employee directory"
        description="People, departments, positions, and contact information."
      />
      <div className="sticky top-18 card mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative">
            <span className="sr-only">Search people</span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input pl-9"
              placeholder="Search people..."
              value={filters.q}
              onChange={(event) => setFilter("q", event.target.value)}
            />
          </label>
          <select
            className="input"
            aria-label="Filter by department"
            value={filters.departmentId}
            onChange={(event) => setFilter("departmentId", event.target.value)}
          >
            <option value="">All departments</option>
            {departments.data?.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Filter by role"
            value={filters.role}
            onChange={(event) => setFilter("role", event.target.value)}
          >
            <option value="">All roles</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
            <option value="AUDITOR">Auditor</option>
            <option value="SYSTEM_ADMIN">System administrator</option>
          </select>
          <select
            className="input"
            aria-label="Filter by status"
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <p>Loading…</p>
        ) : data.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            No people match the selected filters.
          </div>
        ) : (
          data.map((user) => (
            <article key={user.id} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700">
                  <UserRound />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold">{user.displayName}</h2>
                    {user.status === "INACTIVE" && (
                      <span className="badge bg-slate-100 text-slate-500">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {user.jobTitle || "Employee"}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {user.department?.name || "No department"}
                  </p>
                  <a
                    className="mt-3 flex items-center gap-2 break-all text-sm text-blue-600"
                    href={`mailto:${user.email}`}
                  >
                    <Mail size={15} className="shrink-0" />
                    {user.email}
                  </a>
                  {user.phone && (
                    <a
                      className="mt-2 flex items-center gap-2 text-sm text-blue-600"
                      href={`tel:${user.phone}`}
                    >
                      <Phone size={15} className="shrink-0" />
                      {user.phone}
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}
