import { NavLink, Outlet } from "react-router-dom";
import {
  Bell,
  CheckSquare,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Users,
  FolderClosed,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { api } from "../lib/api.js";
import { Avatar } from "./UI.jsx";

const links = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/chat", "Messages", MessageSquare],
  ["/drive", "Drive", FolderClosed],
  ["/tasks", "Tasks", CheckSquare],
  ["/approvals", "Approvals", FileCheck2],
  ["/notifications", "Inbox", Bell],
  ["/directory", "People", Users],
];

function badgeLabel(count) {
  if (!count) return null;
  return count > 9 ? "9+" : String(count);
}

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const invalidate = (key) => qc.invalidateQueries({ queryKey: [key] });

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
    refetchInterval: 60000,
  });

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api("/conversations"),
    refetchInterval: 60000,
  });

  useSocket({
    connect: () => qc.invalidateQueries(),
    "notification:created": () => invalidate("notifications"),
    "notification:updated": () => invalidate("notifications"),
    "task:updated": () => {
      invalidate("tasks");
      invalidate("task");
    },
    "task:created": () => invalidate("tasks"),
    "task:comment-created": () => {
      invalidate("tasks");
      invalidate("task");
    },
    "approval:updated": () => invalidate("approvals"),
    "conversation:updated": () => invalidate("conversations"),
    "conversation:read-updated": () => invalidate("conversations"),
    "message:created": () => invalidate("conversations"),
    "message:deleted": () => invalidate("conversations"),
    "conversation:removed": () => {
      invalidate("conversations");
      qc.removeQueries({ queryKey: ["messages"] });
    },
  });

  const messageCount =
    conversationsQuery.data?.data?.reduce(
      (total, conversation) => total + (conversation.unreadCount || 0),
      0,
    ) || 0;
  const badgeByPath = {
    "/chat": messageCount,
    "/tasks": notificationsQuery.data?.meta?.unreadTaskCount || 0,
    "/approvals": notificationsQuery.data?.meta?.unreadApprovalCount || 0,
    "/notifications": notificationsQuery.data?.meta?.unreadCount || 0,
  };

  return (
    <div className="min-h-screen">
      <div className="min-[901px]:hidden flex items-center justify-between bg-white border-b border-slate-200 p-4">
        <strong>Workspace</strong>
        <button
          className="icon-btn"
          aria-label="Toggle navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <aside
        className={`${open ? "flex" : "hidden"} min-[901px]:flex fixed inset-y-0 left-0 z-20 w-[236px] flex-col border-r border-slate-200 bg-white p-5 max-[900px]:top-[69px] max-[900px]:shadow-xl`}
      >
        <div className="mb-9 mt-2 flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 font-bold text-white">
            W
          </span>
          <div>
            <strong className="text-[17px]">Workspace</strong>
            <p className="text-[11px] text-slate-400">Your team, together</p>
          </div>
        </div>
        <p className="mb-3 px-3 text-[10px] font-bold tracking-[.16em] text-slate-400">
          WORKSPACE
        </p>
        <nav className="space-y-1">
          {[
            ...links.filter(
              ([path]) => path !== "/drive" || hasPermission("drive.use"),
            ),
            ...(hasPermission("system.audit.read")
              ? [["/audit", "Audit log", ShieldCheck]]
              : []),
            ...(hasPermission("users.manage")
              ? [["/admin", "Administration", Settings]]
              : []),
          ].map(([to, label, Icon]) => {
            const badge = badgeLabel(badgeByPath[to]);
            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
                {badge && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-5">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user.displayName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {user.displayName}
              </p>
              <p className="truncate text-xs text-slate-400">
                {user.department?.name || "Team member"}
              </p>
            </div>
          </div>
          <NavLink
            to="/account"
            onClick={() => setOpen(false)}
            className="block text-xs text-blue-600 mb-4"
          >
            My account
          </NavLink>
          <button
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900"
            onClick={logout}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace-main">
        <Outlet />
      </main>
    </div>
  );
}
