import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckSquare,
  Clock3,
  FileCheck2,
  MessageSquare,
  FolderClosed,
  ArrowRight,
} from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Badge, ErrorBox, Empty, prettyDate } from "../components/UI.jsx";
export default function DashboardPage() {
  const { user } = useAuth();
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
  const list = (tasks.data || []).filter(
    (t) => !["COMPLETED", "CANCELLED"].includes(t.status),
  );
  const review = (approvals.data || []).filter(
    (a) =>
      a.status === "PENDING" &&
      a.steps.some((s) => s.status === "PENDING" && s.approverId === user.id),
  );
  const stats = [
    [
      "Active tasks",
      list.length,
      CheckSquare,
      "/tasks",
      "bg-blue-50 text-blue-600",
    ],
    [
      "Overdue tasks",
      list.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length,
      Clock3,
      "/tasks",
      "bg-amber-50 text-amber-600",
    ],
    [
      "Needs your approval",
      review.length,
      FileCheck2,
      "/approvals",
      "bg-emerald-50 text-emerald-600",
    ],
    [
      "Unread updates",
      notifications.data?.meta.unreadCount || 0,
      MessageSquare,
      "/notifications",
      "bg-violet-50 text-violet-600",
    ],
  ];
  return (
    <>
      <PageHeader
        title={`Hello, ${user.firstName}`}
        description="Here’s what’s happening across your workspace."
        action={
          <span className="text-xs text-slate-400 py-3">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
        }
      />
      <div className="max-h-[calc(100vh-17rem)] md:max-h-[calc(100vh-7.8rem)] overflow-y-auto px-4 ">
        <ErrorBox
          error={tasks.error || approvals.error || notifications.error}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(([label, count, Icon, to, color]) => (
            <Link
              className="card p-5 hover:border-blue-200 transition"
              to={to}
              key={label}
            >
              <div className="flex items-center justify-between">
                <span className={`p-2.5 rounded-xl ${color}`}>
                  <Icon size={19} />
                </span>
                <ArrowUpRight size={16} className="text-slate-300" />
              </div>
              <p className="text-3xl font-semibold mt-5">
                {tasks.isLoading ? "—" : count}
              </p>
              <p className="text-xs text-slate-400 mt-1">{label}</p>
            </Link>
          ))}
        </div>
        <div className="grid xl:grid-cols-[1.7fr_1fr] gap-6 mt-7">
          <section className="card">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-sm font-bold">Work to focus on</h2>
              <Link
                to="/tasks"
                className="text-xs text-blue-600 flex gap-2 items-center"
              >
                All tasks
                <ArrowRight size={13} />
              </Link>
            </div>
            {list.slice(0, 6).map((t) => (
              <Link to="/tasks" className="list-row" key={t.id}>
                <CheckSquare size={17} className="text-slate-300" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {t.assignee?.displayName || "Unassigned"} ·{" "}
                    {prettyDate(t.dueDate)}
                  </p>
                </div>
                <Badge value={t.status} />
              </Link>
            ))}
            {!list.length && (
              <Empty
                title="A clear start"
                text="Create a task to plan your team’s next steps."
              />
            )}
          </section>
          <section className="card p-5">
            <h2 className="text-sm font-bold mb-5">Make room for good work</h2>
            <p className="text-sm leading-6 text-slate-400 mb-5">
              Keep conversations, files, and decisions connected in one shared
              workspace.
            </p>
            {[
              [
                MessageSquare,
                "Start a conversation",
                "Talk to a colleague or your team",
                "/chat",
              ],
              [
                FolderClosed,
                "Organize your files",
                "Open your personal and shared Drive",
                "/drive",
              ],
              [
                FileCheck2,
                "Submit a request",
                "Get the decision you need",
                "/approvals",
              ],
            ].map(([Icon, title, text, to]) => (
              <Link
                to={to}
                key={to}
                className="flex gap-3 items-center rounded-xl p-3 -mx-1 hover:bg-slate-50 mb-2"
              >
                <Icon size={19} className="text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-[11px] mt-1 text-slate-400">{text}</p>
                </div>
                <ArrowUpRight size={14} className="text-slate-300" />
              </Link>
            ))}
          </section>
        </div>
        <section className="card mt-6">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="text-sm font-bold">Latest updates</h2>
            <Link to="/notifications" className="text-xs text-blue-600">
              Open inbox
            </Link>
          </div>
          {notifications.data?.data.slice(0, 4).map((n) => (
            <div key={n.id} className="list-row">
              <span
                className={`w-2 h-2 rounded-full ${n.isRead ? "bg-slate-200" : "bg-blue-500"}`}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-slate-400 mt-1">{n.body}</p>
              </div>
              <span className="text-xs text-slate-400">
                {prettyDate(n.createdAt)}
              </span>
            </div>
          ))}
          {!notifications.data?.data.length && (
            <p className="text-sm text-slate-400 p-6">You’re all caught up.</p>
          )}
        </section>
      </div>
    </>
  );
}
