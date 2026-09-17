import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import { ErrorBox, Loading } from "../components/UI.jsx";
import { useSocket } from "../hooks/useSocket.js";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
    refetchInterval: 60000,
  });
  useSocket({
    "notification:created": () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const read = useMutation({
    mutationFn: (id) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${query.data?.meta?.unreadCount || 0} unread notification(s).`}
        action={
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => readAll.mutate()}
          >
            <CheckCheck size={17} />
            Mark all read
          </button>
        }
      />
      <ErrorBox error={query.error || read.error || readAll.error} />
      <div className="card divide-y divide-slate-100">
        {query.isLoading && <Loading />}
        {query.data?.data?.map((item) => (
          <button
            key={item.id}
            onClick={() => !item.isRead && read.mutate(item.id)}
            className={`flex w-full items-start gap-4 p-5 text-left hover:bg-slate-50 ${item.isRead ? "opacity-60" : ""}`}
          >
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <Bell size={18} />
            </div>
            <div className="flex-1">
              <div className="font-semibold">{item.title}</div>
              <p className="mt-1 text-sm text-slate-600">{item.body}</p>
              <p className="mt-2 text-xs text-slate-400">
                {formatDistanceToNow(new Date(item.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
            {!item.isRead && (
              <span className="mt-2 h-2.5 w-2.5 rounded-full bg-blue-600" />
            )}
          </button>
        ))}
        {!query.isLoading && !query.error && !query.data?.data?.length && (
          <p className="p-8 text-center text-sm text-slate-500">
            No notifications yet.
          </p>
        )}
      </div>
    </>
  );
}
