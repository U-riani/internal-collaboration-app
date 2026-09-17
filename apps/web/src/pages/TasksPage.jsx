import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  CalendarDays,
  MessageSquare,
  Paperclip,
  CheckSquare,
  Columns3,
  List,
} from "lucide-react";
import { api, uploadFile } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import {
  Modal,
  Field,
  Badge,
  ErrorBox,
  Empty,
  Loading,
  Avatar,
  Attachments,
  prettyDate,
} from "../components/UI.jsx";
const statuses = [
  "DRAFT",
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "WAITING_REVIEW",
  "COMPLETED",
  "CANCELLED",
];
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
function TaskDetail({ id, onClose }) {
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const [comment, setComment] = useState("");
  const [file, setFile] = useState(null);
  const [edit, setEdit] = useState(false);
  const query = useQuery({
    queryKey: ["task", id],
    queryFn: () => api(`/tasks/${id}`).then((r) => r.data),
  });
  const task = query.data;
  const add = useMutation({
    mutationFn: async () =>
      api(`/tasks/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          content: comment,
          attachmentIds: file ? [(await uploadFile(file)).id] : [],
        }),
      }),
    onSuccess: () => {
      setComment("");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const update = useMutation({
    mutationFn: (status) =>
      api(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const canManage =
    task &&
    (task.creatorId === user.id ||
      user.roles.includes("SYSTEM_ADMIN") ||
      (hasPermission("tasks.manage_department") &&
        user.departmentId === task.departmentId));
  return (
    <Modal title="Task details" onClose={onClose} wide>
      {query.isLoading ? (
        <Loading />
      ) : task ? (
        <>
          <div className="flex justify-between gap-3 items-start">
            <div>
              <h2 className="text-xl font-bold mb-3">{task.title}</h2>
              <div className="flex gap-2">
                <Badge value={task.priority} />
                <Badge value={task.status} />
              </div>
            </div>
            {canManage && (
              <button className="btn-secondary" onClick={() => setEdit(true)}>
                Edit task
              </button>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-500 mt-6">
            {task.description || "No description provided."}
          </p>
          <div className="grid sm:grid-cols-3 gap-4 my-6 rounded-xl bg-slate-50 p-4 text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-2">Assigned to</p>
              {task.assignee?.displayName || "Unassigned"}
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">Due date</p>
              {prettyDate(task.dueDate)}
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">Status</p>
              <select
                aria-label="Task status"
                className="input"
                value={task.status}
                disabled={update.isPending}
                onChange={(e) => update.mutate(e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Attachments items={task.attachments} />
          {task.participants.length > 0 && (
            <p className="text-xs text-slate-400 mt-4">
              Participants:{" "}
              {task.participants.map((p) => p.user.displayName).join(", ")}
            </p>
          )}
          <ErrorBox error={update.error} />
          <h3 className="font-semibold text-sm mt-8 mb-4">
            Discussion · {task.comments.length}
          </h3>
          <div className="space-y-5">
            {task.comments.map((c) => (
              <div className="flex gap-3" key={c.id}>
                <Avatar small name={c.author.displayName} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">
                    {c.author.displayName}
                    <span className="ml-3 font-normal text-slate-400">
                      {prettyDate(c.createdAt)}
                    </span>
                  </div>
                  <p className="my-2 text-sm whitespace-pre-wrap">
                    {c.content}
                  </p>
                  <Attachments items={c.attachments} />
                </div>
              </div>
            ))}
          </div>
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <textarea
              aria-label="Comment"
              placeholder="Add a comment…"
              className="input min-h-24"
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex justify-between items-center mt-3">
              <label className="text-xs text-slate-500 flex items-center gap-2 cursor-pointer">
                <Paperclip size={16} />
                {file?.name || "Attach a file"}
                <input
                  type="file"
                  className="sr-only"
                  aria-label="Comment attachment"
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </label>
              <button className="btn-primary" disabled={add.isPending}>
                Comment
              </button>
            </div>
            <ErrorBox error={add.error} />
          </form>
          <details className="mt-7 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold">
              Activity history
            </summary>
            <div className="mt-3 space-y-2">
              {task.history.map((h) => (
                <p key={h.id}>
                  {prettyDate(h.createdAt)} · {h.actor?.displayName} ·{" "}
                  {h.actionType.replaceAll("_", " ").toLowerCase()}
                </p>
              ))}
            </div>
          </details>
          {edit && <TaskForm existing={task} onClose={() => setEdit(false)} />}
        </>
      ) : (
        <ErrorBox error={query.error} />
      )}
    </Modal>
  );
}
function TaskForm({ existing, onClose }) {
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const [form, setForm] = useState({
    title: existing?.title || "",
    description: existing?.description || "",
    assigneeId: existing?.assigneeId || "",
    priority: existing?.priority || "NORMAL",
    dueDate: existing?.dueDate
      ? new Date(
          new Date(existing.dueDate).getTime() -
            new Date(existing.dueDate).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
    participantIds: existing?.participants.map((p) => p.userId) || [],
  });
  const [file, setFile] = useState(null);
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: async () =>
      api(existing ? `/tasks/${existing.id}` : "/tasks", {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          assigneeId: form.assigneeId || null,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
          attachmentIds: [
            ...(existing?.attachments.map((a) => a.fileId) || []),
            ...(file ? [(await uploadFile(file)).id] : []),
          ],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task"] });
      onClose();
    },
  });
  const change = (key, value) => setForm({ ...form, [key]: value });
  return (
    <Modal title={existing ? "Edit task" : "New task"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field
          label="Task title"
          required
          minLength={2}
          value={form.title}
          onChange={(e) => change("title", e.target.value)}
        />
        <Field label="Description">
          <textarea
            className="input min-h-24"
            value={form.description}
            onChange={(e) => change("description", e.target.value)}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="Assigned to">
            <select
              className="input"
              value={form.assigneeId}
              onChange={(e) => change("assigneeId", e.target.value)}
            >
              <option value="">Unassigned</option>
              {users.data
                ?.filter(
                  (u) =>
                    u.status === "ACTIVE" &&
                    (hasPermission("tasks.assign") ||
                      u.id === user.id ||
                      u.id === existing?.assigneeId),
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              className="input"
              value={form.priority}
              onChange={(e) => change("priority", e.target.value)}
            >
              {priorities.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label="Due date"
          type="datetime-local"
          value={form.dueDate}
          onChange={(e) => change("dueDate", e.target.value)}
        />
        <Field label="Participants">
          <select
            className="input h-24"
            multiple
            value={form.participantIds}
            onChange={(e) =>
              change(
                "participantIds",
                [...e.target.selectedOptions].map((x) => x.value),
              )
            }
          >
            {users.data
              ?.filter((u) => u.status === "ACTIVE")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
          </select>
        </Field>
        <p className="text-xs text-slate-400 mt-1">
          Hold Ctrl / Cmd to select multiple people.
        </p>
        <Field
          label="Attachment"
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function TasksPage() {
  const { user, hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [board, setBoard] = useState(false);
  const [create, setCreate] = useState(false);
  const [id, setId] = useState(null);
  const query = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api("/tasks").then((r) => r.data),
  });
  const tasks = useMemo(
    () =>
      (query.data || []).filter(
        (t) =>
          `${t.title} ${t.description || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (filter === "all" ||
            (filter === "mine" && t.assigneeId === user.id) ||
            (filter === "active" &&
              !["COMPLETED", "CANCELLED"].includes(t.status)) ||
            (filter === "completed" && t.status === "COMPLETED")),
      ),
    [query.data, filter, search, user.id],
  );
  const card = (t) => (
    <button
      key={t.id}
      className="card p-4 text-left w-full hover:border-blue-300 transition"
      onClick={() => setId(t.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-semibold text-sm">{t.title}</span>
        <Badge value={t.priority} />
      </div>
      <p className="line-clamp-2 mt-3 text-xs leading-5 text-slate-400">
        {t.description}
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <Avatar small name={t.assignee?.displayName || "?"} />
        <span className="flex-1 truncate">
          {t.assignee?.displayName || "Unassigned"}
        </span>
        <MessageSquare size={12} />
        {t._count.comments}
      </div>
      <div className="flex items-center justify-between gap-2 mt-4">
        <span className="text-[11px] text-slate-400 flex items-center gap-1">
          <CalendarDays size={12} />
          {prettyDate(t.dueDate)}
        </span>
        <Badge value={t.status} />
      </div>
    </button>
  );
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Keep priorities clear and move work forward."
        action={
          hasPermission("tasks.create") && (
            <button className="btn-primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              New task
            </button>
          )
        }
      />
      <div className="toolbar">
        <div className="tabs">
          {[
            ["active", "Active"],
            ["mine", "Assigned to me"],
            ["completed", "Completed"],
            ["all", "All"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={filter === v ? "active" : ""}
              onClick={() => setFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={15}
            />
            <input
              aria-label="Search tasks"
              className="input pl-9 w-48"
              placeholder="Search tasks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            aria-label={board ? "List view" : "Board view"}
            className="btn-secondary px-3"
            onClick={() => setBoard(!board)}
          >
            {board ? <List size={17} /> : <Columns3 size={17} />}
          </button>
        </div>
      </div>
      <ErrorBox error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : !tasks.length ? (
        <div className="card">
          <Empty
            title="No tasks to show"
            text="Create a task or try another filter."
          />
        </div>
      ) : board ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["OPEN", "DRAFT"],
            ["IN_PROGRESS", "BLOCKED"],
            ["WAITING_REVIEW"],
            ["COMPLETED", "CANCELLED"],
          ].map((group, i) => (
            <section key={i} className="rounded-xl bg-slate-100 p-3">
              <h3 className="text-xs font-bold px-1 mb-4 text-slate-500">
                {["TO DO", "IN PROGRESS", "IN REVIEW", "DONE"][i]}{" "}
                <span className="float-right">
                  {tasks.filter((t) => group.includes(t.status)).length}
                </span>
              </h3>
              <div className="space-y-3">
                {tasks.filter((t) => group.includes(t.status)).map(card)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map(card)}
        </div>
      )}
      {create && <TaskForm onClose={() => setCreate(false)} />}{" "}
      {id && <TaskDetail id={id} onClose={() => setId(null)} />}
    </>
  );
}
