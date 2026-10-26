import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckSquare2,
  CircleCheck,
  Clock3,
  FileCheck2,
  FolderClosed,
  Inbox,
  MessageSquare,
  Search,
} from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ErrorBox, prettyDate } from "../components/UI.jsx";
import "./dashboard.css";

const shortcuts = [
  {
    icon: MessageSquare,
    title: "Start a conversation",
    description: "Talk to a colleague or your team",
    to: "/chat",
    tone: "cyan",
  },
  {
    icon: FolderClosed,
    title: "Organize your files",
    description: "Open your personal and shared Drive",
    to: "/drive",
    tone: "indigo",
  },
  {
    icon: FileCheck2,
    title: "Submit a request",
    description: "Get the decision you need",
    to: "/approvals",
    tone: "violet",
  },
];

function StatCard({ label, value, loading, icon: Icon, tone, to, chip }) {
  return (
    <Link to={to} className={"overview-stat overview-stat--" + tone}>
      <div className="overview-stat-top">
        <span className="overview-stat-icon"><Icon size={19} strokeWidth={2.3} /></span>
        <ArrowUpRight className="overview-stat-arrow" size={17} />
      </div>
      <div className="overview-stat-bottom">
        <strong className="overview-stat-number" aria-label={loading ? "Loading" : undefined}>
          {loading ? "—" : value}
        </strong>
        <span className="overview-stat-chip">{chip}</span>
      </div>
      <span className="overview-stat-label">{label}</span>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api("/tasks").then((r) => r.data),
  });
  const approvals = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api("/approval-requests").then((r) => r.data),
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
  });

  const activeTasks = (tasks.data || []).filter(
    (task) => !["COMPLETED", "CANCELLED"].includes(task.status),
  );
  const overdueCount = activeTasks.filter(
    (task) => task.dueDate && new Date(task.dueDate) < new Date(),
  ).length;
  const pendingReviews = (approvals.data || []).filter(
    (approval) =>
      approval.status === "PENDING" &&
      approval.steps?.some(
        (step) => step.status === "PENDING" && step.approverId === user.id,
      ),
  );
  const unreadCount = notifications.data?.meta?.unreadCount || 0;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matchingTasks = normalizedSearch
    ? activeTasks.filter((task) =>
        [task.title, task.assignee?.displayName, task.status]
          .some((value) => String(value || "").toLocaleLowerCase().includes(normalizedSearch)),
      )
    : activeTasks;
  const recentUpdates = notifications.data?.data?.slice(0, 4) || [];
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const stats = [
    { label: "Active tasks", value: activeTasks.length, loading: tasks.isLoading, icon: CheckSquare2, tone: "cyan", to: "/tasks", chip: "In flight" },
    { label: "Overdue tasks", value: overdueCount, loading: tasks.isLoading, icon: Clock3, tone: "coral", to: "/tasks", chip: overdueCount > 0 ? "Urgent" : "On track" },
    { label: "Needs your approval", value: pendingReviews.length, loading: approvals.isLoading, icon: FileCheck2, tone: "indigo", to: "/approvals", chip: pendingReviews.length > 0 ? "Pending" : "Caught up" },
    { label: "Unread updates", value: unreadCount, loading: notifications.isLoading, icon: MessageSquare, tone: "violet", to: "/notifications", chip: unreadCount > 0 ? "New" : "Clear" },
  ];

  return (
    <div className="overview-dashboard">
      <header className="overview-toolbar">
        <div className="overview-toolbar-search">
          <Search aria-hidden="true" size={17} />
          <input
            aria-label="Search focus tasks"
            type="search"
            placeholder="Search focus tasks..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="overview-search-clear" aria-label="Clear search">
              Clear
            </button>
          )}
        </div>
        <div className="overview-toolbar-right">
          <span className="overview-toolbar-date"><CalendarDays size={15} />{dateLabel}</span>
          <span className="overview-live"><span aria-hidden="true" />Workspace</span>
          <Link to="/notifications" className="overview-toolbar-link" aria-label="Notifications">
            <Bell size={18} />
            {unreadCount > 0 && <span className="overview-notification-dot" />}
          </Link>
          <Link to="/account" className="overview-toolbar-profile" title={user.displayName || "My account"} aria-label="My account">
            {(user.displayName || user.firstName || "U").charAt(0).toLocaleUpperCase()}
          </Link>
        </div>
      </header>

      <div className="overview-body">
        <div className="overview-hero">
          <div className="overview-hero-main">
            <div className="overview-hero-title">
              <h1>Hello, {user.firstName}</h1>
              <span className="overview-hero-badge"><span aria-hidden="true" /> ACTIVE WORKSPACE</span>
            </div>
            <p>Here's what's happening across your workspace today.</p>
          </div>
          <div className="overview-hero-date"><CalendarDays size={16} /><span>{dateLabel}</span></div>
        </div>

        <ErrorBox error={tasks.error || approvals.error || notifications.error} />

        <div className="overview-stats" aria-label="Workspace statistics">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        <div className="overview-work-grid">
          <section className="overview-panel overview-focus">
            <div className="overview-panel-heading">
              <h2><span className="overview-heading-mark overview-heading-mark--indigo" />Work to focus on
                <span className="overview-focus-count">{matchingTasks.length}</span>
              </h2>
              <Link to="/tasks" className="overview-panel-action">All tasks <ArrowRight size={15} /></Link>
            </div>
            <div className="overview-focus-list">
              {matchingTasks.slice(0, 6).map((task) => (
                <Link key={task.id} to="/tasks" className="overview-task-row">
                  <span className="overview-task-check" aria-hidden="true" />
                  <div className="overview-task-info">
                    <strong title={task.title}>{task.title}</strong>
                    <span>{task.assignee?.displayName || "Unassigned"} <span className="overview-separator">·</span> <span className="overview-task-date">{prettyDate(task.dueDate)}</span></span>
                  </div>
                  <span className="overview-task-status">{String(task.status || "Open").replaceAll("_", " ").toLocaleLowerCase()}</span>
                  <ArrowUpRight size={15} className="overview-task-arrow" aria-hidden="true" />
                </Link>
              ))}
              {!tasks.isLoading && matchingTasks.length === 0 && (
                <div className="overview-empty">
                  <CircleCheck size={26} />
                  <strong>{search ? "No matching tasks" : "A clear start"}</strong>
                  <span>{search ? "Try another search to find a focus task." : "Create a task to plan your team's next steps."}</span>
                </div>
              )}
              {tasks.isLoading && <p className="overview-loading">Loading tasks…</p>}
            </div>
          </section>

          <section className="overview-panel overview-shortcuts">
            <div className="overview-panel-heading">
              <h2><span className="overview-heading-mark overview-heading-mark--cyan" />Make room for good work</h2>
            </div>
            <p className="overview-shortcuts-intro">Keep conversations, files, and decisions connected in one shared workspace.</p>
            <div className="overview-shortcut-list">
              {shortcuts.map(({ icon: Icon, title, description, to, tone }) => (
                <Link key={to} to={to} className="overview-shortcut-row">
                  <span className={"overview-shortcut-icon overview-shortcut-icon--" + tone}><Icon size={19} /></span>
                  <span className="overview-shortcut-copy"><strong>{title}</strong><small>{description}</small></span>
                  <ArrowUpRight size={17} className="overview-shortcut-arrow" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <section className="overview-panel overview-updates">
          <div className="overview-panel-heading overview-updates-heading">
            <div>
              <h2><span className="overview-heading-mark overview-heading-mark--violet" />Latest updates</h2>
              <p>Real-time team communications and activity log</p>
            </div>
            <Link to="/notifications" className="overview-panel-action"><Inbox size={15} /> Open inbox</Link>
          </div>
          <div className="overview-update-list">
            {recentUpdates.map((notification, index) => (
              <div key={notification.id} className="overview-update-row">
                <span className={"overview-update-dot " + (notification.isRead ? "overview-update-dot--read" : "")} />
                <span className={"overview-update-icon overview-update-icon--" + (index % 3)}><MessageSquare size={17} /></span>
                <div className="overview-update-info">
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                </div>
                <time className="overview-update-date" dateTime={notification.createdAt}>{prettyDate(notification.createdAt)}</time>
                <Link to="/notifications" className="overview-update-link" aria-label="Open notification in inbox"><ArrowRight size={16} /></Link>
              </div>
            ))}
            {!notifications.isLoading && recentUpdates.length === 0 && (
              <div className="overview-empty overview-empty--updates"><CircleCheck size={24} /><span>You're all caught up.</span></div>
            )}
            {notifications.isLoading && <p className="overview-loading">Loading updates…</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
