import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { ErrorBox, Empty, Loading } from "../components/UI.jsx";
export default function AuditPage() {
  const { hasPermission } = useAuth();
  const allowed = hasPermission("system.audit.read");
  const query = useQuery({
    queryKey: ["audit"],
    enabled: allowed,
    queryFn: () => api("/audit").then((r) => r.data),
  });
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return (
    <>
      <PageHeader
        title="Audit log"
        description="The 100 most recent recorded actions."
      />
      <div className="max-h-[calc(100vh-16rem)] md:max-h-[calc(100vh-7.8rem)] overflow-y-auto">
        <ErrorBox error={query.error} />
        <div className="card">
          {query.isLoading ? (
            <Loading />
          ) : query.data?.length ? (
            query.data.map((item) => (
              <details key={item.id} className="border-b border-slate-100 p-5">
                <summary className="cursor-pointer text-sm">
                  <strong>{item.actionType.replaceAll("_", " ")}</strong>
                  <span className="text-slate-400 ml-3">
                    {item.actor?.displayName || "System"} ·{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </summary>
                <p className="mt-3 text-xs text-slate-500">
                  {item.entityType} · {item.entityId}
                </p>
                <pre className="text-xs overflow-auto bg-slate-50 rounded-lg p-3 mt-3">
                  {JSON.stringify(
                    {
                      before: item.beforeData,
                      after: item.afterData,
                      metadata: item.metadata,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))
          ) : (
            <Empty title="No recorded actions yet" />
          )}
        </div>
      </div>
    </>
  );
}
