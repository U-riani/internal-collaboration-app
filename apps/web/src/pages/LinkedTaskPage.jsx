import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api.js";
import PageHeader from "../components/PageHeader.jsx";
import {
  Attachments,
  Badge,
  ErrorBox,
  Loading,
  prettyDate,
} from "../components/UI.jsx";

export default function LinkedTaskPage() {
  const { taskId } = useParams();
  const query = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api(`/tasks/${taskId}`).then((response) => response.data),
  });
  const task = query.data;

  return (
    <>
      <PageHeader
        title="Task"
        description="Opened from your notification inbox."
        action={
          <Link className="btn-secondary flex items-center gap-2" to="/tasks">
            <ArrowLeft size={16} />
            All tasks
          </Link>
        }
      />
      <ErrorBox error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : task ? (
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">{task.title}</h2>
              <div className="mt-3 flex gap-2">
                <Badge value={task.priority} />
                <Badge value={task.status} />
              </div>
            </div>
            <div className="text-right text-xs text-slate-400">
              <p>Due {prettyDate(task.dueDate)}</p>
              <p className="mt-1">
                Assigned to {task.assignee?.displayName || "Unassigned"}
              </p>
            </div>
          </div>
          <p className="mt-6 whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {task.description || "No description provided."}
          </p>
          {task.attachments?.length > 0 && (
            <div className="mt-6">
              <Attachments items={task.attachments} />
            </div>
          )}
          {task.participants?.length > 0 && (
            <p className="mt-5 text-xs text-slate-400">
              Participants:{" "}
              {task.participants.map((p) => p.user.displayName).join(", ")}
            </p>
          )}
          {task.comments?.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-semibold">
                Discussion · {task.comments.length}
              </h3>
              <div className="space-y-3">
                {task.comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold">
                      {comment.author.displayName}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                      {comment.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
