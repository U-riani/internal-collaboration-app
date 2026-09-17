import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import { Attachments, ErrorBox, Loading, prettyDate } from "../components/UI.jsx";

export default function LinkedMessagePage() {
  const { messageId } = useParams();
  const query = useQuery({
    queryKey: ["notification-message", messageId],
    queryFn: () =>
      api(`/notifications/messages/${messageId}`).then(
        (response) => response.data,
      ),
  });
  const message = query.data;
  const conversationName =
    message?.conversation?.name ||
    (message?.conversation?.type === "DIRECT"
      ? "Direct message"
      : "Conversation");

  return (
    <>
      <PageHeader
        title="Message"
        description="Opened from your notification inbox."
        action={
          <Link className="btn-secondary flex items-center gap-2" to="/chat">
            <ArrowLeft size={16} />
            Messages
          </Link>
        }
      />
      <ErrorBox error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : message ? (
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <MessageSquare size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{message.sender.displayName}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {conversationName} · {prettyDate(message.createdAt)}
                  </p>
                </div>
              </div>

              {message.replyToMessage && (
                <div className="mt-5 rounded-lg border-l-2 border-blue-300 bg-slate-50 p-3 text-xs text-slate-500">
                  Reply to {message.replyToMessage.sender.displayName}:{" "}
                  {message.replyToMessage.content || "Message"}
                </div>
              )}

              <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {message.deletedAt
                  ? "Message deleted"
                  : message.content || "Attachment"}
              </p>
              {message.attachments?.length > 0 && (
                <div className="mt-5">
                  <Attachments items={message.attachments} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
