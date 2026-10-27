import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  Eye,
  Mail,
  MailOpen,
  MessageSquare,
  FileCheck2,
  ListTodo,
  Heart,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import { ErrorBox, Loading } from "../components/UI.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { leftBorderColors } from "../config/colors.js";
import "./tasks-page.css";
import "./notifications-page.css";

const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
const PAGE_SIZE = 7;

// Only notifications explicitly categorized or titled as mentions appear here.
// The current notification API does not provide a dedicated mentions endpoint.
function isMention(item) {
  const type = String(item.type || "").toUpperCase();
  return type.includes("MENTION") || /\bmentioned you\b/i.test(item.title || "");
}

function NotificationTypeIcon({ item }) {
  const type = String(item.type || "").toUpperCase();
  const entity = String(item.relatedEntityType || "").toUpperCase();
  if (type.includes("REACTION")) return <Heart size={17} />;
  if (type.includes("MESSAGE") || entity === "CONVERSATION" || entity === "MESSAGE")
    return <MessageSquare size={17} />;
  if (entity === "APPROVAL_REQUEST" || type.includes("APPROVAL"))
    return <FileCheck2 size={17} />;
  if (entity === "TASK" || type.includes("TASK"))
    return <ListTodo size={17} />;
  return <Bell size={17} />;
}

function ApprovalStepProgress({ steps }) {
  if (!steps?.length) return null;

  const orderedSteps = [...steps].sort(
    (left, right) => (left.stepNumber || 0) - (right.stepNumber || 0),
  );
  const approvedCount = orderedSteps.filter(
    (step) => step.status === "APPROVED",
  ).length;
  const progressLabel = `${approvedCount}/${orderedSteps.length} approval steps completed`;

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1"
      aria-label={progressLabel}
      title={progressLabel}
    >
      {orderedSteps.map((step) => (
        <span
          key={step.id || step.stepNumber}
          className={`h-2.5 w-2.5 rounded-full ${
            step.status === "APPROVED" ? "bg-emerald-500" : "bg-slate-200"
          }`}
        />
      ))}
      <span className="ml-1 text-[10px] font-medium text-slate-400">
        {approvedCount}/{orderedSteps.length}
      </span>
    </div>
  );
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
    refetchInterval: 60000,
  });
  const hasApprovalNotifications = Boolean(
    query.data?.data?.some(
      (item) => item.relatedEntityType === "APPROVAL_REQUEST",
    ),
  );
  const approvalsQuery = useQuery({
    queryKey: ["approvals"],
    enabled: hasApprovalNotifications,
    queryFn: () => api("/approval-requests").then((response) => response.data),
  });
  const approvalById = new Map(
    (approvalsQuery.data || []).map((request) => [request.id, request]),
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  useSocket({
    "notification:created": refresh,
    "notification:updated": refresh,
    "approval:updated": () =>
      queryClient.invalidateQueries({ queryKey: ["approvals"] }),
  });

  const read = useMutation({
    mutationFn: (id) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: refresh,
  });
  const unread = useMutation({
    mutationFn: (id) => api(`/notifications/${id}/unread`, { method: "POST" }),
    onSuccess: refresh,
  });
  const priority = useMutation({
    mutationFn: ({ id, value }) =>
      api(`/notifications/${id}/priority`, {
        method: "PATCH",
        body: JSON.stringify({ priority: value }),
      }),
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: refresh,
  });

  const view = async (item) => {
    if (!item.targetUrl) return;
    if (!item.isRead) await read.mutateAsync(item.id);
    navigate(item.targetUrl);
  };

  const items = query.data?.data || [];
  const unreadCount = query.data?.meta?.unreadCount || 0;
  const mentionCount = items.filter(isMention).length;
  const filteredItems =
    activeTab === "unread"
      ? items.filter((item) => !item.isRead)
      : activeTab === "mentions"
        ? items.filter(isMention)
        : items;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const firstItem = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(firstItem, firstItem + PAGE_SIZE);
  const rangeStart = filteredItems.length ? firstItem + 1 : 0;
  const rangeEnd = Math.min(firstItem + PAGE_SIZE, filteredItems.length);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  return (
    <div className="tasks-page notifications-page">
      <PageHeader
        title="Notifications"
        description={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`}
        action={
          <div className="task-header-actions">
            <button
              type="button"
              className="btn-secondary notifications-read-all"
              onClick={() => readAll.mutate()}
              disabled={readAll.isPending || unreadCount === 0}
            >
              <CheckCheck size={16} />
              Mark all read
            </button>
          </div>
        }
      />

      <div className="notifications-shell">
        <div className="task-toolbar task-toolbar--refresh notifications-toolbar">
          <div className="tabs task-quick-tabs notifications-tabs" aria-label="Notification filters">
            {[
              { value: "all", label: "All Activity", count: items.length },
              { value: "unread", label: "Unread", count: unreadCount },
              { value: "mentions", label: "Mentions", count: mentionCount },
            ].map((tab) => (
              <button
                type="button"
                key={tab.value}
                className={activeTab === tab.value ? "active" : ""}
                aria-pressed={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
                <span className="notifications-tab-count">{tab.count}</span>
              </button>
            ))}
          </div>
          <span className="notifications-sync-hint">
            <span className="notifications-sync-dot" aria-hidden="true" />
            Auto-synchronized
          </span>
        </div>

        <div className="notifications-content">
          <ErrorBox
            error={query.error || read.error || unread.error || priority.error || readAll.error}
          />
          {query.isLoading ? (
            <Loading />
          ) : pageItems.length ? (
            <div className="notifications-list">
              {pageItems.map((item) => {
                const approval =
                  item.relatedEntityType === "APPROVAL_REQUEST"
                    ? approvalById.get(item.relatedEntityId)
                    : null;
                const priorityValue = priorities.includes(item.priority)
                  ? item.priority
                  : "NORMAL";
                const borderClass =
                  leftBorderColors[priorityValue.toLowerCase()] || leftBorderColors.normal;

                return (
                  <article
                    key={item.id}
                    className={`notification-card notification-card--${priorityValue.toLowerCase()} ${borderClass} ${item.isRead ? "notification-card--read" : "notification-card--unread"}`}
                  >
                    <div className="notification-card-main">
                      <span className="notification-card-icon" aria-hidden="true">
                        <NotificationTypeIcon item={item} />
                      </span>
                      <div className="notification-card-content">
                        <div className="notification-card-title-line">
                          <h3>{item.title}</h3>
                          {!item.isRead && (
                            <span className="notification-unread-dot" aria-label="Unread notification" />
                          )}
                        </div>
                        {item.body && <p className="notification-card-body">{item.body}</p>}
                        {approval && <ApprovalStepProgress steps={approval.steps} />}
                        <time className="notification-card-time" dateTime={item.createdAt}>
                          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                        </time>
                      </div>
                    </div>
                    <div className="notification-card-actions">
                      <button
                        type="button"
                        className="btn-secondary notification-action"
                        disabled={!item.targetUrl || read.isPending}
                        title={item.targetUrl ? "Open related item" : "No linked item"}
                        onClick={() => view(item)}
                      >
                        <Eye size={15} />
                        View
                      </button>
                      <label className="task-sort-control notification-priority-control">
                        <span className="notification-priority-caption">Priority</span>
                        <select
                          className="input app-modern-select task-sort-select notification-priority-select"
                          aria-label={`Priority for ${item.title}`}
                          value={priorityValue}
                          disabled={priority.isPending}
                          onChange={(event) =>
                            priority.mutate({ id: item.id, value: event.target.value })
                          }
                        >
                          {priorities.map((value) => (
                            <option key={value} value={value}>
                              {value.charAt(0) + value.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn-secondary notification-action"
                        disabled={read.isPending || unread.isPending}
                        onClick={() =>
                          item.isRead ? unread.mutate(item.id) : read.mutate(item.id)
                        }
                      >
                        {item.isRead ? <Mail size={15} /> : <MailOpen size={15} />}
                        {item.isRead ? "Mark unread" : "Mark read"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="notifications-empty">
              <Bell size={24} aria-hidden="true" />
              <h3>
                {activeTab === "unread"
                  ? "No unread notifications"
                  : activeTab === "mentions"
                    ? "No mentions found"
                    : "No notifications yet"}
              </h3>
              <p>
                {activeTab === "unread"
                  ? "You are all caught up."
                  : activeTab === "mentions"
                    ? "Notifications explicitly marked as mentions will appear here."
                    : "Updates from conversations, tasks and approvals appear here."}
              </p>
            </div>
          )}
        </div>

        <div className="notifications-footer">
          <span>
            {rangeStart}–{rangeEnd} of {filteredItems.length} notifications
          </span>
          <div className="notifications-pagination">
            <button
              type="button"
              className="btn-secondary"
              aria-label="Previous notifications page"
              disabled={currentPage <= 1 || query.isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft size={16} />
              <span>Previous</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              aria-label="Next notifications page"
              disabled={currentPage >= totalPages || query.isLoading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              <span>Next</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
