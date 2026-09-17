import { useQuery } from "@tanstack/react-query";
import { Mail, UserRound } from "lucide-react";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";

export default function DirectoryPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  return (
    <>
      <PageHeader
        title="Employee directory"
        description="People, departments, positions, and contact information."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <p>Loading…</p>
        ) : (
          data.map((user) => (
            <article key={user.id} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-blue-100 text-blue-700">
                  <UserRound />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold">{user.displayName}</h2>
                  <p className="text-sm text-slate-500">
                    {user.jobTitle || "Employee"}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {user.department?.name || "No department"}
                  </p>
                  <a
                    className="mt-3 flex items-center gap-2 text-sm text-blue-600"
                    href={`mailto:${user.email}`}
                  >
                    <Mail size={15} />
                    {user.email}
                  </a>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}
