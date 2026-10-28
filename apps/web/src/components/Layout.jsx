import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  CheckSquare,
  FileCheck2,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
  FolderClosed,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { ACCENT_EVENT, getAccentPreference, THEME_EVENT, getThemePreference } from "../lib/appearance.js";
import { useSocket } from "../hooks/useSocket.js";
import { api } from "../lib/api.js";
import { handleNotificationCreated, installNotificationAudioUnlock } from "../lib/notificationSounds.js";
import { syncExistingBrowserPush } from "../lib/pushNotifications.js";
import { Avatar } from "./UI.jsx";
import "../theme.css";
import "../appearance-palettes.css";
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
  const { user, hasPermission } = useAuth();
  const [accent, setAccent] = useState(() => getAccentPreference(user.id));
  const [appearance, setAppearance] = useState(() => getThemePreference(user.id));
  const isOverview = useLocation().pathname === "/dashboard";
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  // Appearance preferences are local to this account and do not remount the app.
  useEffect(() => {
    setAccent(getAccentPreference(user.id));
    const onAccentChange = (event) => {
      if (event.detail?.userId === user.id) setAccent(event.detail.accent);
    };
    window.addEventListener(ACCENT_EVENT, onAccentChange);
    return () => window.removeEventListener(ACCENT_EVENT, onAccentChange);
  }, [user.id]);

  // Theme switching only changes CSS attributes: no remounts or API calls.
  useEffect(() => {
    setAppearance(getThemePreference(user.id));
    const onThemeChange = (event) => {
      if (event.detail?.userId === user.id) setAppearance(event.detail.theme);
    };
    window.addEventListener(THEME_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_EVENT, onThemeChange);
  }, [user.id]);

  // The existing global listener plays each realtime notification once.
  useEffect(() => installNotificationAudioUnlock(), []);

  useEffect(() => {
    void syncExistingBrowserPush(user.id);
    if (!("serviceWorker" in navigator)) return undefined;
    const onSubscriptionChanged = (event) => {
      if (event.data?.type === "collab:push-subscription-changed")
        void syncExistingBrowserPush(user.id);
    };
    navigator.serviceWorker.addEventListener("message", onSubscriptionChanged);
    return () => navigator.serviceWorker.removeEventListener("message", onSubscriptionChanged);
  }, [user.id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const invalidate = (key) => qc.invalidateQueries({ queryKey: [key] });

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
    refetchInterval: 60000,
  });
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api("/conversations").then((response) => response.data),
    refetchInterval: 60000,
  });

  const acknowledgeDelivery = (payload) =>
    api("/messages/receipts/delivered", {
      method: "POST",
      body: JSON.stringify(payload),
    })
      .then(() => invalidate("conversations"))
      .catch(() => {});

  useSocket({
    connect: () => {
      qc.invalidateQueries();
      acknowledgeDelivery({ allPending: true });
    },
    "notification:created": (notification) => {
      handleNotificationCreated(notification, user.id);
      invalidate("notifications");
      if (notification?.type === "MESSAGE_REACTION")
        invalidate("conversations");
    },
    "notification:updated": (notification) => {
      invalidate("notifications");
      if (notification?.type === "MESSAGE_REACTION")
        invalidate("conversations");
    },
    "task:updated": () => {
      invalidate("tasks");
      invalidate("task");
    },
    "task:created": () => invalidate("tasks"),
    "task:comment-created": () => {
      invalidate("tasks");
      invalidate("task");
    },
    "approval:updated": () => {
      invalidate("approvals");
      invalidate("approval-bases");
      invalidate("approval-base-records");
    },
    "conversation:updated": () => invalidate("conversations"),
    "conversation:read-updated": () => invalidate("conversations"),
    "message:created": (message) => {
      invalidate("conversations");
      if (message?.senderId && message.senderId !== user.id)
        acknowledgeDelivery({ messageIds: [message.id] });
    },
    "message:receipt-updated": () => invalidate("conversations"),
    "message:reaction-updated": () => {
      invalidate("conversations");
      invalidate("notifications");
    },
    "message:deleted": () => invalidate("conversations"),
    "conversation:removed": () => {
      invalidate("conversations");
      qc.removeQueries({ queryKey: ["messages"] });
    },
  });

  const unreadMessageActivityCount =
    conversationsQuery.data?.reduce(
      (total, conversation) =>
        total +
        (conversation.unreadMessageCount || 0) +
        (conversation.unreadReactionCount || 0),
      0,
    ) || 0;
  const badgeByPath = {
    "/chat": unreadMessageActivityCount,
    "/tasks": notificationsQuery.data?.meta?.unreadTaskCount || 0,
    "/approvals": notificationsQuery.data?.meta?.unreadApprovalCount || 0,
    "/notifications": notificationsQuery.data?.meta?.unreadCount || 0,
  };

  return (
    <div className={isOverview ? "app-theme-dark overview-layout" : "app-theme-dark max-h-screen"}
      data-theme="dark"
      data-appearance={appearance}
      data-accent={accent}>
      <div className="workspace-mobile-header sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 min-[901px]:hidden">
        <strong>Workspace</strong>
        <button
          className="icon-btn"
          aria-label="Toggle navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-x-0 bottom-0 top-16 z-30 bg-slate-950/35 min-[901px]:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`workspace-sidebar ${open ? "flex" : "hidden"} fixed bottom-0 left-0 top-16 z-40 w-[82vw] max-w-[320px] flex-col overflow-y-auto border-r border-slate-200 bg-white px-5 shadow-xl min-[901px]:inset-y-0 min-[901px]:top-0 min-[901px]:flex min-[901px]:h-screen min-[901px]:w-[236px] min-[901px]:max-w-none min-[901px]:shadow-none`}
      >
        <div className="workspace-sidebar-top sticky top-0 z-10 bg-white">
          <div className="mb-9 mt-2 flex items-center gap-3 px-2">
            <span className="workspace-logo grid h-9 w-9 place-items-center rounded-xl bg-blue-600 font-bold text-white">
              W
            </span>
            <div>
              <strong className="workspace-brand-name text-[17px]">Workspace</strong>
              <p className="workspace-brand-caption text-[11px] text-slate-400">Your team, together</p>
            </div>
          </div>
          <p className="workspace-section-label mb-3 px-3 text-[10px] font-bold tracking-[.16em] text-slate-400">
            WORKSPACE
          </p>
        </div>
        <nav className="space-y-1 ">
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
                  `workspace-nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`
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
        <div className="sidebar-profile sticky bottom-0 mt-auto pb-3 pt-4">
          <div className="sidebar-profile-card">
            <NavLink
              to="/account"
              onClick={() => setOpen(false)}
              className="sidebar-profile-identity"
              title="My account"
              aria-label={`Open account for ${user.displayName || user.firstName || "user"}`}
            >
              <Avatar name={user.displayName || user.firstName || "User"} />
              <span className="sidebar-profile-details">
                <strong className="sidebar-profile-name">
                  {user.displayName || user.firstName || "User"}
                </strong>
                <span className="sidebar-profile-department">
                  {user.department?.name || "Team member"}
                </span>
              </span>
            </NavLink>
          </div>
        </div>
      </aside>
      {/* <main className="workspace-main max-[900px]:h-[calc(100dvh-4rem)] max-[900px]:overflow-y-auto min-[901px]:h-screen min-[901px]:overflow-y-auto"> */}
      <main className="relative workspace-main sm:h-screen min-[901px]:overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
