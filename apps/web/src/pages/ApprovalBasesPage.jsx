import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileCheck2, Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { Badge, Empty, ErrorBox, Loading, prettyDate } from "../components/UI.jsx";
import { api } from "../lib/api.js";
import { RequestDetail } from "./ApprovalsPage.jsx";

const approvalStatuses = [
  "DRAFT",
  "SUBMITTED",
  "PENDING",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

function formatBaseValue(value, column) {
  if (value === undefined || value === null || value === "") return "—";
  if (column?.type === "checkbox") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ApprovalBasesPage() {
  const navigate = useNavigate();
  const { typeId } = useParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  const bases = useQuery({
    queryKey: ["approval-bases"],
    queryFn: () => api("/approval-bases").then((response) => response.data),
  });

  useEffect(() => {
    if (!typeId && bases.data?.length)
      navigate(`/approvals/bases/${bases.data[0].id}`, { replace: true });
  }, [bases.data, navigate, typeId]);

  useEffect(() => {
    setSearch("");
    setStatus("all");
    setPage(1);
    setSelectedRequestId(null);
  }, [typeId]);

  const records = useQuery({
    queryKey: ["approval-base-records", typeId, search, status, page],
    enabled: Boolean(typeId),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "50",
      });
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      return api(
        `/approval-bases/${typeId}/records?${params.toString()}`,
      ).then((response) => response.data);
    },
  });

  const selectedRequest = useQuery({
    queryKey: ["approval", selectedRequestId],
    enabled: Boolean(selectedRequestId),
    queryFn: () =>
      api(`/approval-requests/${selectedRequestId}`).then(
        (response) => response.data,
      ),
  });

  const selectedBase = (bases.data || []).find((item) => item.id === typeId);
  const payload = records.data;

  return (
    <>
      <PageHeader
        title="Approval Bases"
        description="Browse approval data by request type in a full-page table workspace."
        action={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/approvals")}
          >
            <ArrowLeft size={16} />
            Back to approvals
          </button>
        }
      />

      <div className="grid min-h-[calc(100vh-150px)] gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="self-start rounded-2xl border border-slate-200 bg-white p-3 xl:sticky xl:top-6">
          <div className="mb-3 px-2 py-1">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Request types
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Each request type has its own organized approval data view.
            </p>
          </div>

          {bases.isLoading ? (
            <Loading />
          ) : bases.error ? (
            <ErrorBox error={bases.error} />
          ) : (bases.data || []).length ? (
            <div className="max-h-[calc(100vh-230px)] space-y-1 overflow-y-auto pr-1">
              {(bases.data || []).map((base) => (
                <button
                  type="button"
                  key={base.id}
                  className={`w-full rounded-xl px-3 py-3 text-left transition ${
                    typeId === base.id
                      ? "bg-blue-50 ring-1 ring-blue-100"
                      : "hover:bg-slate-50"
                  }`}
                  onClick={() => navigate(`/approvals/bases/${base.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-lg p-1.5 ${
                        typeId === base.id
                          ? "bg-blue-100 text-blue-600"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <FileCheck2 size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
                      {base.name}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                      {base.recordCount}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 pl-8 text-[11px] text-slate-400">
                    <span className="truncate">{base.code}</span>
                    <span>{base.status.toLowerCase()}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="No approval bases"
              text="Create a request type to create its data base."
            />
          )}
        </aside>

        <main className="min-w-0">
          {!typeId ? (
            <div className="card">
              {bases.isLoading ? (
                <Loading />
              ) : (
                <Empty
                  title="No base selected"
                  text="Choose a request type to browse its records."
                />
              )}
            </div>
          ) : (
            <>
              <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-bold text-slate-800">
                        {payload?.type?.name ||
                          selectedBase?.name ||
                          "Approval base"}
                      </h2>
                      {(payload?.type?.status || selectedBase?.status) && (
                        <Badge
                          value={payload?.type?.status || selectedBase?.status}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {payload?.type?.code || selectedBase?.code}
                      {payload?.pagination
                        ? ` · ${payload.pagination.total} accessible record${
                            payload.pagination.total === 1 ? "" : "s"
                          }`
                        : ""}
                    </p>
                    {payload?.type?.description && (
                      <p className="mt-2 max-w-3xl text-sm text-slate-500">
                        {payload.type.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search
                        className="absolute left-3 top-3 text-slate-400"
                        size={15}
                      />
                      <input
                        className="input w-64 pl-9"
                        aria-label="Search approval base"
                        placeholder="Search title or requester"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <select
                      className="input w-44"
                      aria-label="Approval base status"
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All statuses</option>
                      {approvalStatuses.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <ErrorBox error={records.error} />

              {records.isLoading ? (
                <div className="card">
                  <Loading />
                </div>
              ) : payload?.records?.length ? (
                <>
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="overflow-auto">
                      <table className="min-w-max w-full border-separate border-spacing-0 text-left text-sm">
                        <thead className="sticky top-0 z-20 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                          <tr>
                            <th className="sticky left-0 z-30 min-w-[260px] max-w-[260px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
                              Request
                            </th>
                            <th className="sticky left-[260px] z-30 min-w-[180px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
                              Requester
                            </th>
                            <th className="min-w-[160px] border-b border-slate-200 px-4 py-3 font-semibold">
                              Department
                            </th>
                            {(payload.columns || []).map((column) => (
                              <th
                                key={column.key}
                                className="min-w-[160px] border-b border-slate-200 px-4 py-3 font-semibold"
                                title={
                                  column.legacy
                                    ? "Field from an earlier request type version"
                                    : undefined
                                }
                              >
                                {column.label}
                                {column.legacy ? " *" : ""}
                              </th>
                            ))}
                            <th className="min-w-[130px] border-b border-slate-200 px-4 py-3 font-semibold">
                              Status
                            </th>
                            <th className="min-w-[180px] border-b border-slate-200 px-4 py-3 font-semibold">
                              Current approver
                            </th>
                            <th className="min-w-[150px] border-b border-slate-200 px-4 py-3 font-semibold">
                              Submitted
                            </th>
                            <th className="min-w-[150px] border-b border-slate-200 px-4 py-3 font-semibold">
                              Created
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {payload.records.map((record) => (
                            <tr
                              key={record.id}
                              className="group cursor-pointer"
                              onClick={() => setSelectedRequestId(record.id)}
                            >
                              <td className="sticky left-0 z-10 min-w-[260px] max-w-[260px] border-b border-r border-slate-100 bg-white px-4 py-3 transition group-hover:bg-slate-50">
                                <p className="truncate font-semibold text-slate-700">
                                  {record.title}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  v{record.approvalTypeVersion}
                                </p>
                              </td>
                              <td className="sticky left-[260px] z-10 min-w-[180px] border-b border-r border-slate-100 bg-white px-4 py-3 text-slate-600 transition group-hover:bg-slate-50">
                                {record.requester.displayName}
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3 text-slate-500 transition group-hover:bg-slate-50">
                                {record.department?.name || "—"}
                              </td>
                              {(payload.columns || []).map((column) => (
                                <td
                                  key={column.key}
                                  className="max-w-[320px] border-b border-slate-100 px-4 py-3 text-slate-600 transition group-hover:bg-slate-50"
                                >
                                  <span className="block truncate">
                                    {formatBaseValue(
                                      record.data?.[column.key],
                                      column,
                                    )}
                                  </span>
                                </td>
                              ))}
                              <td className="border-b border-slate-100 px-4 py-3 transition group-hover:bg-slate-50">
                                <Badge value={record.status} />
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3 text-slate-500 transition group-hover:bg-slate-50">
                                {record.steps?.[0]?.approver?.displayName || "—"}
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3 text-slate-500 transition group-hover:bg-slate-50">
                                {record.submittedAt
                                  ? prettyDate(record.submittedAt)
                                  : "—"}
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3 text-slate-500 transition group-hover:bg-slate-50">
                                {prettyDate(record.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {(payload.columns || []).some((column) => column.legacy) && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      * Field comes from an earlier saved version of this request
                      type.
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">
                      Page {payload.pagination.page} of{" "}
                      {payload.pagination.pageCount} ·{" "}
                      {payload.pagination.total} total
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={payload.pagination.page <= 1}
                        onClick={() =>
                          setPage((current) => Math.max(1, current - 1))
                        }
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          payload.pagination.page >= payload.pagination.pageCount
                        }
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="card">
                  <Empty
                    title="No records found"
                    text="This request type has no approvals matching the current filters."
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {selectedRequestId && selectedRequest.isLoading && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/20">
          <div className="rounded-2xl bg-white p-6 shadow-xl">
            <Loading />
          </div>
        </div>
      )}
      {selectedRequestId && selectedRequest.error && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/20 p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <ErrorBox error={selectedRequest.error} />
            <button
              type="button"
              className="btn-secondary mt-4"
              onClick={() => setSelectedRequestId(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
      {selectedRequest.data && (
        <RequestDetail
          item={selectedRequest.data}
          onClose={() => setSelectedRequestId(null)}
        />
      )}
    </>
  );
}
