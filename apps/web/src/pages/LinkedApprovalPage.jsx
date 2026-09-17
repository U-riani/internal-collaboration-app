import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import { Badge, ErrorBox, Loading, prettyDate } from "../components/UI.jsx";

export default function LinkedApprovalPage() {
  const { requestId } = useParams();
  const query = useQuery({
    queryKey: ["approval", requestId],
    queryFn: () =>
      api(`/approval-requests/${requestId}`).then((response) => response.data),
  });
  const item = query.data;

  return (
    <>
      <PageHeader
        title="Approval request"
        description="Opened from your notification inbox."
        action={
          <Link className="btn-secondary flex items-center gap-2" to="/approvals">
            <ArrowLeft size={16} />
            All approvals
          </Link>
        }
      />
      <ErrorBox error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : item ? (
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {item.approvalType.name} · {item.requester.displayName}
              </p>
            </div>
            <Badge value={item.status} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Object.entries(item.data || {}).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-400">{key}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value ?? "")}
                </p>
              </div>
            ))}
          </div>

          <h3 className="mb-3 mt-8 text-sm font-semibold">Workflow</h3>
          <div className="space-y-3">
            {item.steps.map((step) => (
              <div
                key={step.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"
              >
                <span className="text-xs text-slate-400">{step.stepNumber}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{step.stepName}</p>
                  <p className="text-xs text-slate-400">
                    {step.approver.displayName}
                  </p>
                </div>
                <Badge value={step.status} />
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-400">
            Created {prettyDate(item.createdAt)}
          </p>
        </div>
      ) : null}
    </>
  );
}
