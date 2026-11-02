import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import {
  Activity, AlertCircle, AlertTriangle, CalendarDays, CheckCircle2,
  ChevronLeft, ChevronRight, ClipboardCopy, Download, Eye, FileText,
  Filter, RefreshCw, Search, ShieldCheck, Users, X,
} from "lucide-react";
import { api, getAccessToken } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Avatar, Empty, ErrorBox, Loading, Modal, SearchBar } from "../components/UI.jsx";
import "./audit-page.css";

const MODULES = ["AUTHENTICATION", "MESSAGES", "TASKS", "APPROVALS", "DRIVE", "ADMINISTRATION", "NOTIFICATIONS", "SYSTEM"];
const SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"];
const OUTCOMES = ["SUCCESS", "FAILED", "DENIED"];
const PAGE_SIZE = 25;

function displayAction(code) {
  const explicit = {
    AUTH_LOGIN: "Signed in",
    AUTH_LOGIN_FAILED: "Sign-in attempt denied",
    ACCESS_DENIED: "Access denied",
    AUTH_MOBILE_WEBVIEW_SESSION: "Mobile session created",
    USER_PASSWORD_RESET: "User password reset",
    USER_CREATED: "User created",
    USER_UPDATED: "User profile updated",
    ROLE_UPDATED: "Role permissions updated",
    TASK_CREATED: "Task created",
    TASK_UPDATED: "Task updated",
    SUBTASK_DELETED: "Subtask deleted",
    DRIVE_CREATED: "Drive item created",
    DRIVE_UPDATED: "Drive item updated",
    DRIVE_TRASHED: "Drive item moved to trash",
    DRIVE_RESTORED: "Drive item restored",
    GROUP_MEMBER_ADDED: "Group member added",
    GROUP_MEMBER_REMOVED: "Group member removed",
    GROUP_RENAMED: "Group renamed",
    MESSAGE_EDITED: "Message edited",
    MESSAGE_DELETED: "Message deleted",
    NOTIFICATION_PRIORITY_SET: "Notification priority changed",
  };
  return explicit[code] || String(code || "System event")
    .replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function labelFor(entityType, entityId, beforeData, afterData) {
  const detail = afterData?.title || afterData?.name || afterData?.displayName
    || beforeData?.title || beforeData?.name || beforeData?.displayName;
  if (typeof detail === "string" && detail.trim()) return detail;
  return [String(entityType || "Object").replaceAll("_", " "), entityId ? String(entityId).slice(0, 8) : ""].join(" ");
}

function humanValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)))
    return formatTime(value);
  return String(value);
}

function changesFor(event) {
  const before = event?.beforeData || {};
  const after = event?.afterData || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ key, before: before[key], after: after[key] }));
}

function StatusBadge({ value }) {
  const normalized = String(value || "INFO").toUpperCase();
  return <span className={"audit-badge audit-badge-" + normalized.toLowerCase()}>
    {normalized.replaceAll("_", " ")}
  </span>;
}

function CopyValue({ value, label = "Copy" }) {
  if (!value) return null;
  return <button type="button" className="audit-copy" aria-label={label}
    onClick={() => navigator.clipboard?.writeText(String(value))} title={label}>
    <ClipboardCopy size={13} />
  </button>;
}

function Info({ label, value, copy = false }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="audit-info">
    <span className="audit-info-label">{label}</span>
    <span className="audit-info-value">{humanValue(value)} {copy && <CopyValue value={value}/>}</span>
  </div>;
}

function EventDetails({ event, diagnostics, onClose }) {
  if (!event) return null;
  const isDiag = diagnostics;
  const title = isDiag ? displayAction(event.eventType) : displayAction(event.actionType);
  const target = !isDiag ? labelFor(event.entityType, event.entityId, event.beforeData, event.afterData) : null;
  const changes = !isDiag ? changesFor(event) : [];
  const technical = isDiag ? event.metadata : event.metadata;
  return <Modal title={title} subtitle={formatTime(event.createdAt)} onClose={onClose}
    wide className="audit-details-modal" headerIcon={isDiag ? <AlertCircle size={19}/> : <Activity size={19}/>}>
    <div className="audit-details-body">
      <div className="audit-detail-summary">
        <StatusBadge value={isDiag ? event.severity : event.outcome}/>
        <p>{isDiag ? event.message : ((event.actor?.displayName || "System") + " · " + title + (target ? " · " + target : ""))}</p>
      </div>
      <div className="audit-detail-section">
        <h3>Event information</h3>
        <div className="audit-info-grid">
          <Info label="Event ID" value={event.id} copy/>
          <Info label="Module" value={event.module}/>
          <Info label="Action / error type" value={event.actionType || event.eventType}/>
          <Info label="Severity" value={event.severity}/>
          {!isDiag && <Info label="Result" value={event.outcome}/>}
          {isDiag && <Info label="HTTP status" value={event.httpStatus}/>}
          <Info label="Source" value={event.source || "WEB"}/>
        </div>
      </div>
      <div className="audit-detail-columns">
        <div className="audit-detail-section">
          <h3>Performed by</h3>
          <div className="audit-actor">
            {event.actor ? <Avatar userId={event.actor.id} name={event.actor.displayName}/> : <div className="audit-system-avatar"><Users size={18}/></div>}
            <div><strong>{event.actor?.displayName || "System / Unidentified"}</strong>
              {event.actor?.email && <small>{event.actor.email}</small>}
              {event.actor?.department?.name && <small>{event.actor.department.name}</small>}
            </div>
          </div>
          <div className="audit-info-grid audit-person-meta">
            <Info label="IP address" value={event.ipAddress}/>
            <Info label="Client" value={event.userAgent}/>
          </div>
        </div>
        <div className="audit-detail-section">
          <h3>{isDiag ? "Request" : "Target entity"}</h3>
          <div className="audit-target">
            <FileText size={19}/><div>
              <strong>{isDiag ? (event.method || "Request") + " " + (event.path || "") : target}</strong>
              <small>{isDiag ? "Technical request" : event.entityType}</small>
            </div>
          </div>
          {!isDiag && <Info label="Entity ID" value={event.entityId} copy/>}
          {isDiag && <Info label="Error code" value={event.eventType}/>}
        </div>
      </div>
      {!isDiag && changes.length > 0 && <div className="audit-detail-section">
        <h3>Changes made <span className="audit-change-count">{changes.length} changed</span></h3>
        <div className="audit-changes">
          {changes.map((change) => <div className="audit-change-row" key={change.key}>
            <strong>{change.key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</strong>
            <div className="audit-old-value">{humanValue(change.before)}</div>
            <span className="audit-change-arrow">→</span>
            <div className="audit-new-value">{humanValue(change.after)}</div>
          </div>)}
        </div>
      </div>}
      <details className="audit-detail-section audit-technical">
        <summary>Technical information & request metadata</summary>
        <div className="audit-info-grid">
          <Info label="Request ID" value={event.requestId} copy/>
          {isDiag && <Info label="Endpoint" value={event.path}/>}
          {isDiag && <Info label="Method" value={event.method}/>}
          <Info label="Timestamp" value={formatTime(event.createdAt)}/>
        </div>
        {technical && Object.keys(technical).length > 0 && <pre className="audit-raw">{JSON.stringify(technical, null, 2)}</pre>}
      </details>
    </div>
  </Modal>;
}

function StatCard({ icon: Icon, title, value, description, tone }) {
  return <div className="audit-stat">
    <span className={"audit-stat-icon " + (tone || "")}><Icon size={18}/></span>
    <span className="audit-stat-label">{title}</span>
    <strong>{Number(value || 0).toLocaleString()}</strong>
    <span className="audit-stat-description">{description}</span>
  </div>;
}

export default function AuditPage() {
  const { hasPermission } = useAuth();
  const allowed = hasPermission("system.audit.read");
  const canDiagnostics = hasPermission("system.diagnostics.read");
  const [tab, setTab] = useState("activity");
  const [range, setRange] = useState("7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [module, setModule] = useState("");
  const [outcome, setOutcome] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [actorId, setActorId] = useState("");
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [exportError, setExportError] = useState("");

  const dateRange = useMemo(() => {
    if (range === "custom" && customFrom && customTo) return {
      start: new Date(customFrom + "T00:00:00").toISOString(),
      end: new Date(customTo + "T23:59:59").toISOString(),
    };
    return { start: new Date(Date.now() - Number(range === "custom" ? 7 : range) * 86400000).toISOString(),
      end: new Date().toISOString() };
  }, [range, customFrom, customTo]);

  const filters = useMemo(() => {
    const params = new URLSearchParams();
    params.set("start", dateRange.start);
    params.set("end", dateRange.end);
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (deferredSearch.trim()) params.set("q", deferredSearch.trim());
    if (module) params.set("module", module);
    if (outcome && tab !== "diagnostics") params.set("outcome", outcome);
    if (severity) params.set("severity", severity);
    if (source) params.set("source", source);
    if (/^[a-f0-9-]{36}$/i.test(actorId)) params.set("actorId", actorId);
    if (tab === "security") params.set("category", "security");
    return params.toString();
  }, [dateRange, page, deferredSearch, module, outcome, severity, source, actorId, tab]);

  const endpoint = tab === "diagnostics" ? "/audit/diagnostics" : "/audit/events";
  const logs = useQuery({
    queryKey: ["audit-v2", endpoint, filters],
    enabled: allowed && (tab !== "diagnostics" || canDiagnostics),
    queryFn: () => api(endpoint + "?" + filters),
    placeholderData: (previous) => previous,
  });
  const stats = useQuery({
    queryKey: ["audit-summary", dateRange],
    enabled: allowed,
    queryFn: () => api("/audit/summary?start=" + encodeURIComponent(dateRange.start) + "&end=" + encodeURIComponent(dateRange.end)).then((r) => r.data),
  });

  const actorOptions = useQuery({
    queryKey: ["audit-actors"],
    enabled: allowed && filterOpen,
    queryFn: () => api("/audit/actors").then((response) => response.data),
  });

  const update = (setter, value) => { setter(value); setPage(1); };
  const clearFilters = () => {
    setModule(""); setOutcome(""); setSeverity(""); setSource(""); setActorId(""); setSearch(""); setPage(1);
  };
  const exportCsv = async () => {
    setExportError("");
    const params = new URLSearchParams(filters);
    params.delete("page");
    params.delete("limit");
    try {
      const response = await fetch("/api/v1/audit/export?" + params.toString(), {
        credentials: "include",
        headers: getAccessToken() ? { authorization: "Bearer " + getAccessToken() } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error?.message || "Unable to export audit events");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "audit-events.csv"; link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error.message);
    }
  };

  if (!allowed) return <Navigate to="/dashboard" replace />;
  const data = logs.data?.data || [];
  const meta = logs.data?.meta || { page: 1, pages: 1, total: 0 };
  const summary = stats.data || {};
  const diagnostic = tab === "diagnostics";
  const tabs = [
    { key: "activity", label: "Activity Logs", icon: Activity },
    { key: "security", label: "Security Logs", icon: ShieldCheck },
    ...(canDiagnostics ? [{ key: "diagnostics", label: "Diagnostics", icon: AlertCircle }] : []),
  ];
  return <div className="audit-page">
    <PageHeader title="Audit & Diagnostics"
      description="Monitor activity, investigate security events and troubleshoot system issues."
      action={<div className="audit-header-actions">
        <label className="audit-date-control"><CalendarDays size={15}/>
          <select className="input app-modern-select" value={range} onChange={(e) => update(setRange, e.target.value)}
            aria-label="Date range">
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {tab !== "diagnostics" && <button className="btn-secondary" type="button" onClick={exportCsv}>
          <Download size={15}/> Export CSV
        </button>}
      </div>}/>
    {range === "custom" && <div className="audit-custom-range">
      <label>From <input className="input" type="date" value={customFrom} onChange={(e) => update(setCustomFrom, e.target.value)}/></label>
      <label>To <input className="input" type="date" value={customTo} onChange={(e) => update(setCustomTo, e.target.value)}/></label>
    </div>}

    <div className="audit-stats">
      <StatCard icon={Activity} title="Total Events" value={summary.totalEvents} description="Recorded activity in this period"/>
      <StatCard icon={AlertTriangle} title="Failed Actions" value={summary.failedActions} tone="danger" description="Denied and failed operations"/>
      <StatCard icon={ShieldCheck} title="Security Events" value={summary.securityEvents} description="Authentication and access events"/>
      <StatCard icon={Users} title="Active Users" value={summary.activeUsers} description="Users with recorded activity"/>
    </div>

    <div className="audit-tabs" role="tablist" aria-label="Audit categories">
      {tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button"
        role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""}
        onClick={() => { setTab(key); setPage(1); setSelected(null); }}>
        <Icon size={15}/>{label}
      </button>)}
    </div>

    <div className="audit-toolbar">
      <SearchBar className="audit-search" inputClassName="audit-search-input"
        ariaLabel="Search audit events" placeholder="Search by user, action, entity or Request ID..."
        value={search} onChange={(e) => update(setSearch, e.target.value)}/>
      <button className="btn-secondary" type="button" onClick={() => setFilterOpen(true)}>
        <Filter size={15}/> Advanced Filters
        {[module, outcome, severity, source, actorId].filter(Boolean).length > 0 &&
          <span className="audit-filter-count">{[module, outcome, severity, source, actorId].filter(Boolean).length}</span>}
      </button>
      <div className="audit-toolbar-spacer"/>
      <label className="audit-inline-filter">
        Module
        <select className="input app-modern-select" value={module} onChange={(e) => update(setModule, e.target.value)}>
          <option value="">All modules</option>
          {MODULES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {!diagnostic && <label className="audit-inline-filter">
        Result
        <select className="input app-modern-select" value={outcome} onChange={(e) => update(setOutcome, e.target.value)}>
          <option value="">All results</option>
          {OUTCOMES.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>}
      <button className="icon-btn" type="button" title="Refresh events"
        onClick={() => { void logs.refetch(); void stats.refetch(); }}><RefreshCw size={16}/></button>
    </div>

    <ErrorBox error={exportError || logs.error || stats.error}/>
    <div className="audit-table-card">
      {logs.isLoading ? <Loading/> : data.length === 0 ? <Empty title="No matching events" text="Try another date range or adjust the filters."/> :
        <div className="audit-table-scroll"><table className="audit-table">
          <thead><tr>
            <th>Date & time</th><th>User</th><th>Module</th>
            <th>{diagnostic ? "Error / incident" : "Action"}</th>
            <th>{diagnostic ? "Request" : "Target / entity"}</th>
            <th>{diagnostic ? "Severity" : "Result"}</th><th><span className="sr-only">Details</span></th>
          </tr></thead>
          <tbody>{data.map((event) => <tr key={event.id}>
            <td className="audit-timestamp">{formatTime(event.createdAt)}</td>
            <td><div className="audit-table-user">
              {event.actor ? <Avatar name={event.actor.displayName} userId={event.actor.id} small/> : <span className="audit-system-avatar"><Users size={15}/></span>}
              <span><strong>{event.actor?.displayName || "System / Unknown"}</strong>
                {event.actor?.department?.name && <small>{event.actor.department.name}</small>}</span>
            </div></td>
            <td><span className="audit-module">{event.module || "SYSTEM"}</span></td>
            <td className="audit-action">{displayAction(event.actionType || event.eventType)}</td>
            <td className="audit-target-cell">{diagnostic ? (event.method || "") + " " + (event.path || "") : labelFor(event.entityType, event.entityId, event.beforeData, event.afterData)}</td>
            <td><StatusBadge value={diagnostic ? event.severity : event.outcome}/></td>
            <td><button type="button" className="audit-view" title="View event details" aria-label="View event details"
              onClick={() => setSelected(event)}><Eye size={17}/></button></td>
          </tr>)}</tbody>
        </table></div>}
    </div>
    <div className="audit-pagination">
      <span>{meta.total || 0} event{meta.total === 1 ? "" : "s"} · Page {meta.page || 1} of {meta.pages || 1}</span>
      <div><button type="button" className="btn-secondary" onClick={() => setPage((n) => Math.max(1, n - 1))}
        disabled={page <= 1}><ChevronLeft size={16}/> Previous</button>
      <button type="button" className="btn-secondary" onClick={() => setPage((n) => n + 1)}
        disabled={page >= meta.pages}>Next <ChevronRight size={16}/></button></div>
    </div>
    {filterOpen && <Modal title="Advanced filters" subtitle="Narrow down audit events" onClose={() => setFilterOpen(false)} wide className="audit-filters-modal">
      <div className="audit-filter-grid">
        <label>Module<select className="input app-modern-select" value={module} onChange={(e) => update(setModule, e.target.value)}>
          <option value="">All modules</option>{MODULES.map((m) => <option value={m} key={m}>{m}</option>)}
        </select></label>
        {!diagnostic && <label>Result<select className="input app-modern-select" value={outcome} onChange={(e) => update(setOutcome, e.target.value)}>
          <option value="">All results</option>{OUTCOMES.map((m) => <option key={m}>{m}</option>)}
        </select></label>}
        <label>Severity<select className="input app-modern-select" value={severity} onChange={(e) => update(setSeverity, e.target.value)}>
          <option value="">All severities</option>{SEVERITIES.map((m) => <option value={m} key={m}>{m}</option>)}
        </select></label>
        <label>Source<select className="input app-modern-select" value={source} onChange={(e) => update(setSource, e.target.value)}>
          <option value="">All sources</option>{["WEB", "MOBILE", "SYSTEM"].map((m) => <option value={m} key={m}>{m}</option>)}
        </select></label>
        <label>User
          <span className="audit-user-selector">
            {actorId && <Avatar small userId={actorId}
              name={actorOptions.data?.find((item) => item.id === actorId)?.displayName || ""}/>}
            <select className="input app-modern-select" value={actorId}
              onChange={(e) => update(setActorId, e.target.value)}>
              <option value="">All users</option>
              {(actorOptions.data || []).map((item) =>
                <option value={item.id} key={item.id}>{item.displayName}</option>)}
            </select>
          </span>
        </label>
      </div>
      <div className="audit-filter-footer">
        <button className="btn-secondary" type="button" onClick={clearFilters}><X size={15}/> Clear all</button>
        <button className="btn-primary" type="button" onClick={() => setFilterOpen(false)}><CheckCircle2 size={15}/> Apply filters</button>
      </div>
    </Modal>}
    {selected && <EventDetails event={selected} diagnostics={diagnostic} onClose={() => setSelected(null)}/>}
  </div>;
}
