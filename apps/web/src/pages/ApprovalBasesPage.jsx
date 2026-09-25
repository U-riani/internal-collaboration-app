import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpDown,
  FileCheck2,
  ListFilter,
  Search,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import {
  Badge,
  Empty,
  ErrorBox,
  Loading,
  prettyDate,
} from "../components/UI.jsx";
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

const NO_DEPARTMENT = "__no_department__";
const NO_APPROVER = "__no_approver__";
const PAGE_SIZE = 50;

const DEFAULT_BASE_FILTERS = {
  statuses: [],
  requesterIds: [],
  departmentIds: [],
  approverIds: [],
  createdFrom: "",
  createdTo: "",
  submittedFrom: "",
  submittedTo: "",
};

const BASE_SORT_OPTIONS = [
  ["created_desc", "Created · newest"],
  ["created_asc", "Created · oldest"],
  ["submitted_desc", "Submitted · newest"],
  ["submitted_asc", "Submitted · oldest"],
  ["title_asc", "Title · A to Z"],
  ["title_desc", "Title · Z to A"],
  ["requester_asc", "Requester · A to Z"],
  ["requester_desc", "Requester · Z to A"],
  ["department_asc", "Department · A to Z"],
  ["department_desc", "Department · Z to A"],
  ["approver_asc", "Approver · A to Z"],
  ["approver_desc", "Approver · Z to A"],
  ["status", "Status"],
];

function formatBaseValue(value, column) {
  if (value === undefined || value === null || value === "") return "—";
  if (column?.type === "checkbox") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function searchableBaseValue(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ApprovalBasesPage() {
  const navigate = useNavigate();
  const { typeId } = useParams();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(DEFAULT_BASE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("created_desc");
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
    setFilters(DEFAULT_BASE_FILTERS);
    setFiltersOpen(false);
    setSortBy("created_desc");
    setPage(1);
    setSelectedRequestId(null);
  }, [typeId]);

  useEffect(() => {
    setPage(1);
  }, [search, filters, sortBy]);

  const records = useQuery({
    queryKey: ["approval-base-records", typeId],
    enabled: Boolean(typeId),
    queryFn: async () => {
      const fetchPage = (pageNumber) =>
        api(
          `/approval-bases/${typeId}/records?${new URLSearchParams({
            page: String(pageNumber),
            pageSize: "100",
          }).toString()}`,
        ).then((response) => response.data);

      const first = await fetchPage(1);
      const pages = [first];
      for (
        let pageNumber = 2;
        pageNumber <= first.pagination.pageCount;
        pageNumber += 1
      ) {
        pages.push(await fetchPage(pageNumber));
      }

      const columnMap = new Map();
      for (const result of pages)
        for (const column of result.columns || [])
          if (!columnMap.has(column.key)) columnMap.set(column.key, column);

      return {
        ...first,
        columns: [...columnMap.values()],
        records: pages.flatMap((result) => result.records || []),
      };
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
  const allRecords = records.data?.records || [];

  const filterOptions = useMemo(() => {
    const requesters = new Map();
    const departments = new Map();
    const approvers = new Map();

    for (const record of allRecords) {
      if (record.requester?.id)
        requesters.set(record.requester.id, record.requester);
      if (record.department?.id)
        departments.set(record.department.id, record.department);
      const approver = record.steps?.[0]?.approver;
      if (approver?.id) approvers.set(approver.id, approver);
    }

    return {
      requesters: [...requesters.values()].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      ),
      departments: [...departments.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      approvers: [...approvers.values()].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      ),
    };
  }, [allRecords]);

  const filteredRecords = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return allRecords.filter((record) => {
      const approver = record.steps?.[0]?.approver;
      const searchMatch =
        !normalized ||
        [
          record.title,
          record.requester?.displayName,
          record.requester?.email,
          record.department?.name,
          approver?.displayName,
          ...Object.values(record.data || {}).map(searchableBaseValue),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized);

      const statusMatch =
        !filters.statuses.length || filters.statuses.includes(record.status);
      const requesterMatch =
        !filters.requesterIds.length ||
        filters.requesterIds.includes(record.requester?.id);
      const departmentId = record.department?.id || NO_DEPARTMENT;
      const departmentMatch =
        !filters.departmentIds.length ||
        filters.departmentIds.includes(departmentId);
      const approverId = approver?.id || NO_APPROVER;
      const approverMatch =
        !filters.approverIds.length || filters.approverIds.includes(approverId);

      const createdAt = record.createdAt ? new Date(record.createdAt) : null;
      const submittedAt = record.submittedAt
        ? new Date(record.submittedAt)
        : null;
      const createdFromMatch =
        !filters.createdFrom ||
        (createdAt && createdAt >= new Date(`${filters.createdFrom}T00:00:00`));
      const createdToMatch =
        !filters.createdTo ||
        (createdAt &&
          createdAt <= new Date(`${filters.createdTo}T23:59:59.999`));
      const submittedFromMatch =
        !filters.submittedFrom ||
        (submittedAt &&
          submittedAt >= new Date(`${filters.submittedFrom}T00:00:00`));
      const submittedToMatch =
        !filters.submittedTo ||
        (submittedAt &&
          submittedAt <= new Date(`${filters.submittedTo}T23:59:59.999`));

      return (
        searchMatch &&
        statusMatch &&
        requesterMatch &&
        departmentMatch &&
        approverMatch &&
        createdFromMatch &&
        createdToMatch &&
        submittedFromMatch &&
        submittedToMatch
      );
    });
  }, [allRecords, search, filters]);

  const sortedRecords = useMemo(() => {
    const requesterName = (record) => record.requester?.displayName || "";
    const departmentName = (record) => record.department?.name || "";
    const approverName = (record) =>
      record.steps?.[0]?.approver?.displayName || "";

    return filteredRecords.slice().sort((left, right) => {
      let result = 0;

      if (sortBy === "created_desc")
        result = new Date(right.createdAt) - new Date(left.createdAt);
      else if (sortBy === "created_asc")
        result = new Date(left.createdAt) - new Date(right.createdAt);
      else if (sortBy === "submitted_desc")
        result =
          (right.submittedAt ? new Date(right.submittedAt).getTime() : 0) -
          (left.submittedAt ? new Date(left.submittedAt).getTime() : 0);
      else if (sortBy === "submitted_asc") {
        const leftValue = left.submittedAt
          ? new Date(left.submittedAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightValue = right.submittedAt
          ? new Date(right.submittedAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        result = leftValue - rightValue;
      } else if (sortBy === "title_asc")
        result = left.title.localeCompare(right.title);
      else if (sortBy === "title_desc")
        result = right.title.localeCompare(left.title);
      else if (sortBy === "requester_asc")
        result = requesterName(left).localeCompare(requesterName(right));
      else if (sortBy === "requester_desc")
        result = requesterName(right).localeCompare(requesterName(left));
      else if (sortBy === "department_asc")
        result = departmentName(left).localeCompare(departmentName(right));
      else if (sortBy === "department_desc")
        result = departmentName(right).localeCompare(departmentName(left));
      else if (sortBy === "approver_asc")
        result = approverName(left).localeCompare(approverName(right));
      else if (sortBy === "approver_desc")
        result = approverName(right).localeCompare(approverName(left));
      else if (sortBy === "status")
        result =
          approvalStatuses.indexOf(left.status) -
          approvalStatuses.indexOf(right.status);

      return (
        result ||
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });
  }, [filteredRecords, sortBy]);

  const pageCount = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRecords = sortedRecords.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const payload = records.data
    ? {
        ...records.data,
        records: pageRecords,
        pagination: {
          page: safePage,
          pageSize: PAGE_SIZE,
          total: sortedRecords.length,
          pageCount,
        },
      }
    : undefined;

  const advancedFilterCount = [
    filters.statuses.length,
    filters.requesterIds.length,
    filters.departmentIds.length,
    filters.approverIds.length,
    Boolean(filters.createdFrom),
    Boolean(filters.createdTo),
    Boolean(filters.submittedFrom),
    Boolean(filters.submittedTo),
  ].filter(Boolean).length;

  const toggleFilterValue = (key, value) =>
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));

  const setFilterValues = (key, event) => {
    const values = [...event.target.selectedOptions].map(
      (option) => option.value,
    );
    setFilters((current) => ({ ...current, [key]: values }));
  };

  const setFilterValue = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const clearFilters = () => setFilters(DEFAULT_BASE_FILTERS);

  return (
    <>
      <PageHeader
        title="Approval Bases"
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

      <div className=" md:h-[calc(100vh-6.7rem)] approval-bases-layout grid gap-2 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="overflow-x-auto max-h-screen approval-bases-nav self-start rounded-2xl border border-slate-200 bg-white p-3 xl:sticky xl:top-6">
          <div className=" px-1 py-1 mb-0">
            <p className="text-xs mb-0 font-bold uppercase tracking-wide text-slate-400">
              Request types
            </p>
          </div>

          {bases.isLoading ? (
            <Loading />
          ) : bases.error ? (
            <ErrorBox error={bases.error} />
          ) : (bases.data || []).length ? (
            <div className="approval-bases-nav-list max-h-[calc(100vh-8.5rem)] space-y-1 overflow-y-auto pr-1">
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

        <main className="min-w-0 ">
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
              <section className="flex flex-col md:flex-row md:items-center justify-between mb-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-bold text-slate-800">
                        {records.data?.type?.name ||
                          selectedBase?.name ||
                          "Approval base"}
                      </h2>
                      {(records.data?.type?.status || selectedBase?.status) && (
                        <Badge
                          value={
                            records.data?.type?.status || selectedBase?.status
                          }
                        />
                      )}{" "}
                      <label className="inline-flex md:hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
                        <ArrowUpDown size={15} className="text-slate-400" />
                        <select
                          aria-label="Sort approval base"
                          className="max-w-48 bg-transparent outline-none"
                          value={sortBy}
                          onChange={(event) => setSortBy(event.target.value)}
                        >
                          {BASE_SORT_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {records.data?.type?.code || selectedBase?.code}
                      {records.data
                        ? ` · ${allRecords.length} record${
                            allRecords.length === 1 ? "" : "s"
                          }`
                        : ""}
                    </p>
                    {records.data?.type?.description && (
                      <p className="mt-2 max-w-3xl text-sm text-slate-500">
                        {records.data.type.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 ">
                  <div className="relative min-w-[220px] flex-1 sm:max-w-72">
                    <Search
                      className="absolute right-3 top-3 text-slate-400"
                      size={15}
                    />
                    <input
                      className="input w-full pe-8!"
                      aria-label="Search approval base"
                      placeholder="Search records"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      className={`btn-secondary relative ${
                        advancedFilterCount
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : ""
                      }`}
                      onClick={() => setFiltersOpen((current) => !current)}
                      aria-expanded={filtersOpen}
                    >
                      <ListFilter size={16} />
                      <span className="hidden xl:inline">Filter</span>
                      {advancedFilterCount > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                          {advancedFilterCount}
                        </span>
                      )}
                    </button>

                    {filtersOpen && (
                      <div className="approval-filter-panel fixed left-1/2 top-2 z-50 w-[680px] max-w-[calc(100vw-48px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white px-5 shadow-xl max-h-[calc(100vh-1rem)]">
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white pb-3 pt-5">
                          <div>
                            <h3 className="text-sm font-bold text-slate-800">
                              Filter approval base
                            </h3>
                            <p className="mt-1 text-xs text-slate-400">
                              Refine records in this request type.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => setFiltersOpen(false)}
                          >
                            x
                          </button>
                        </div>

                        <div className="relative mb-4 flex min-h-8 items-center pt-3">
                          {advancedFilterCount > 0 && (
                            <button
                              type="button"
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                              onClick={clearFilters}
                            >
                              Clear all
                            </button>
                          )}
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                              Status
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {approvalStatuses.map((status) => (
                                <label
                                  key={status}
                                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={filters.statuses.includes(status)}
                                    onChange={() =>
                                      toggleFilterValue("statuses", status)
                                    }
                                  />
                                  <span>{status.replaceAll("_", " ")}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <label className="text-xs font-semibold text-slate-500">
                            Requester
                            <select
                              multiple
                              className="input mt-1.5 h-28"
                              value={filters.requesterIds}
                              onChange={(event) =>
                                setFilterValues("requesterIds", event)
                              }
                            >
                              {filterOptions.requesters.map((requester) => (
                                <option key={requester.id} value={requester.id}>
                                  {requester.displayName}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="text-xs font-semibold text-slate-500">
                            Department
                            <select
                              multiple
                              className="input mt-1.5 h-28"
                              value={filters.departmentIds}
                              onChange={(event) =>
                                setFilterValues("departmentIds", event)
                              }
                            >
                              <option value={NO_DEPARTMENT}>
                                No department
                              </option>
                              {filterOptions.departments.map((department) => (
                                <option
                                  key={department.id}
                                  value={department.id}
                                >
                                  {department.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="text-xs font-semibold text-slate-500 md:col-span-2">
                            Current approver
                            <select
                              multiple
                              className="input mt-1.5 h-28"
                              value={filters.approverIds}
                              onChange={(event) =>
                                setFilterValues("approverIds", event)
                              }
                            >
                              <option value={NO_APPROVER}>
                                No current approver
                              </option>
                              {filterOptions.approvers.map((approver) => (
                                <option key={approver.id} value={approver.id}>
                                  {approver.displayName}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2">
                            <label className="text-xs font-semibold text-slate-500">
                              Created from
                              <input
                                type="date"
                                className="input mt-1.5"
                                value={filters.createdFrom}
                                onChange={(event) =>
                                  setFilterValue(
                                    "createdFrom",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="text-xs font-semibold text-slate-500">
                              Created to
                              <input
                                type="date"
                                className="input mt-1.5"
                                value={filters.createdTo}
                                onChange={(event) =>
                                  setFilterValue(
                                    "createdTo",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="text-xs font-semibold text-slate-500">
                              Submitted from
                              <input
                                type="date"
                                className="input mt-1.5"
                                value={filters.submittedFrom}
                                onChange={(event) =>
                                  setFilterValue(
                                    "submittedFrom",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="text-xs font-semibold text-slate-500">
                              Submitted to
                              <input
                                type="date"
                                className="input mt-1.5"
                                value={filters.submittedTo}
                                onChange={(event) =>
                                  setFilterValue(
                                    "submittedTo",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-100 bg-white py-3 pt-4">
                          <span className="hidden text-xs text-slate-400 sm:inline">
                            Hold Ctrl/Cmd to select multiple values.
                          </span>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setFiltersOpen(false)}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <label className="hidden md:inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
                    <ArrowUpDown size={15} className="text-slate-400" />
                    <select
                      aria-label="Sort approval base"
                      className="max-w-48 bg-transparent outline-none"
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value)}
                    >
                      {BASE_SORT_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {(advancedFilterCount > 0 || search.trim()) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {advancedFilterCount > 0 && (
                      <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
                        {advancedFilterCount} filter
                        {advancedFilterCount === 1 ? "" : "s"} active
                      </span>
                    )}
                    <span className="text-slate-400">
                      {sortedRecords.length} matching record
                      {sortedRecords.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      className="font-semibold text-slate-500 hover:text-slate-800"
                      onClick={() => {
                        setSearch("");
                        clearFilters();
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </section>

              <ErrorBox error={records.error} />

              {records.isLoading ? (
                <div className="card">
                  <Loading />
                </div>
              ) : payload?.records?.length ? (
                <>
                  <section className="approval-base-table-section rounded-2xl border border-slate-200 bg-white">
                    <div className="approval-base-table-wrap max-h-[calc(100vh-36.8rem)] md:max-h-[calc(100vh-14.6rem)] overflow-auto">
                      <table className="approval-base-table min-w-max w-full border-separate border-spacing-0 text-left text-sm">
                        <thead className="sticky top-0 z-20 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                          <tr>
                            <th className="approval-base-request-cell sticky left-0 z-30 min-w-[260px] max-w-[260px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
                              Request
                            </th>
                            <th className="approval-base-requester-cell sticky left-[260px] z-30 min-w-[180px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
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
                              <td className="approval-base-request-cell sticky left-0 z-10 min-w-[260px] max-w-[260px] border-b border-r border-slate-100 bg-white px-4 py-3 transition group-hover:bg-slate-50">
                                <p className="truncate font-semibold text-slate-700">
                                  {record.title}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  v{record.approvalTypeVersion}
                                </p>
                              </td>
                              <td className="approval-base-requester-cell sticky left-[260px] z-10 min-w-[180px] border-b border-r border-slate-100 bg-white px-4 py-3 text-slate-600 transition group-hover:bg-slate-50">
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
                                {record.steps?.[0]?.approver?.displayName ||
                                  "—"}
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
                      * Field comes from an earlier saved version of this
                      request type.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                          payload.pagination.page >=
                          payload.pagination.pageCount
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
