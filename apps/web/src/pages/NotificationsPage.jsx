import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Eye, Mail, MailOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import { ErrorBox, Loading } from "../components/UI.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { leftBorderColors } from "../config/colors.js";

const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];

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

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${query.data?.meta?.unreadCount || 0} unread notification(s).`}
        action={
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => readAll.mutate()}
            disabled={readAll.isPending}
          >
            <CheckCheck size={17} />
            Mark all read
          </button>
        }
      />
      <div className="max-h-[calc(100vh-17rem)] md:max-h-[calc(100vh-7.8rem)] overflow-y-auto">
        <ErrorBox
          error={
            query.error ||
            read.error ||
            unread.error ||
            priority.error ||
            readAll.error
          }
        />
        <div className="card divide-y divide-slate-100">
          {query.isLoading && <Loading />}
          {query.data?.data?.map((item) => {
            const approval =
              item.relatedEntityType === "APPROVAL_REQUEST"
                ? approvalById.get(item.relatedEntityId)
                : null;

            return (
              <div
                key={item.id}
                className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-start border-l-3
              ${item.priority === "LOW" ? leftBorderColors.low : ""}
              ${item.priority === "NORMAL" ? leftBorderColors.normal : ""}
              ${item.priority === "HIGH" ? leftBorderColors.high : ""}
              ${item.priority === "URGENT" ? leftBorderColors.urgent : ""}
              `}
              >
                {console.log(item)}
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                    <Bell size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{item.title}</div>
                      {!item.isRead && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.body}</p>
                    {approval && <ApprovalStepProgress steps={approval.steps} />}
                    <p className="mt-2 text-xs text-slate-400">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <button
                    className="btn-secondary flex items-center gap-2"
                    disabled={!item.targetUrl || read.isPending}
                    title={
                      item.targetUrl ? "Open related item" : "No linked item"
                    }
                    onClick={() => view(item)}
                  >
                    <Eye size={15} />
                    View
                  </button>

                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Priority
                    <select
                      className="input min-w-28 py-2 text-xs"
                      aria-label={`Priority for ${item.title}`}
                      value={item.priority || "NORMAL"}
                      disabled={priority.isPending}
                      onChange={(e) =>
                        priority.mutate({ id: item.id, value: e.target.value })
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
                    className="btn-secondary flex items-center gap-2"
                    disabled={read.isPending || unread.isPending}
                    onClick={() =>
                      item.isRead ? unread.mutate(item.id) : read.mutate(item.id)
                    }
                  >
                    {item.isRead ? <Mail size={15} /> : <MailOpen size={15} />}
                    {item.isRead ? "Mark unread" : "Mark read"}
                  </button>
                </div>
              </div>
            );
          })}
          {!query.isLoading && !query.error && !query.data?.data?.length && (
            <p className="p-8 text-center text-sm text-slate-500">
              No notifications yet.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
