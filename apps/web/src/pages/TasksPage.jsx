import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Columns3,
  FolderPlus,
  List,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { api, uploadFile } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import {
  Attachments,
  Avatar,
  Badge,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
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
const UNGROUPED = "__ungrouped__";

function completedCount(items = []) {
  return items.filter((item) => item.status === "COMPLETED").length;
}

function GroupForm({ existing, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name || "");
  const save = useMutation({
    mutationFn: () =>
      api(existing ? `/tasks/groups/${existing.id}` : "/tasks/groups", {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-groups"] });
      onClose();
    },
  });

  return (
    <Modal title={existing ? "Rename group" : "New task group"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field
          label="Group name"
          required
          minLength={1}
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : existing ? "Save" : "Create group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TaskForm({ existing, parentTask, defaultGroupId = "", onClose }) {
  const qc = useQueryClient();
  const isSubtask = Boolean(parentTask || existing?.parentTaskId);
  const { user, hasPermission } = useAuth();
  const [form, setForm] = useState({
    title: existing?.title || "",
    description: existing?.description || "",
    assigneeId: existing?.assigneeId || parentTask?.assigneeId || "",
    priority: existing?.priority || parentTask?.priority || "NORMAL",
    groupId: existing?.groupId || parentTask?.groupId || defaultGroupId || "",
    dueDate: existing?.dueDate
      ? new Date(
          new Date(existing.dueDate).getTime() -
            new Date(existing.dueDate).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
    participantIds:
      existing?.participants.map((participant) => participant.userId) || [],
  });
  const [file, setFile] = useState(null);
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((response) => response.data),
  });
  const groups = useQuery({
    queryKey: ["task-groups"],
    queryFn: () => api("/tasks/groups").then((response) => response.data),
  });
  const save = useMutation({
    mutationFn: async () =>
      api(existing ? `/tasks/${existing.id}` : "/tasks", {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          assigneeId: form.assigneeId || null,
          groupId: parentTask ? parentTask.groupId || null : form.groupId || null,
          parentTaskId: existing ? undefined : parentTask?.id || null,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
          attachmentIds: [
            ...(existing?.attachments.map((attachment) => attachment.fileId) || []),
            ...(file ? [(await uploadFile(file)).id] : []),
          ],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task"] });
      qc.invalidateQueries({ queryKey: ["task-groups"] });
      onClose();
    },
  });
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <Modal
      title={existing ? "Edit task" : parentTask ? "New subtask" : "New task"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {(parentTask || existing?.parentTask) && (
          <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Subtask of <span className="font-semibold text-slate-700">{parentTask?.title || existing.parentTask.title}</span>
          </div>
        )}
        <Field
          label="Task title"
          required
          minLength={2}
          value={form.title}
          onChange={(event) => change("title", event.target.value)}
        />
        <Field label="Description">
          <textarea
            className="input min-h-24"
            value={form.description}
            onChange={(event) => change("description", event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 mt-4">
          <Field label="Assigned to">
            <select
              aria-label="Assigned to"
              className="input"
              value={form.assigneeId}
              onChange={(event) => change("assigneeId", event.target.value)}
            >
              <option value="">Unassigned</option>
              {users.data
                ?.filter(
                  (member) =>
                    member.status === "ACTIVE" &&
                    (hasPermission("tasks.assign") ||
                      member.id === user.id ||
                      member.id === existing?.assigneeId),
                )
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              className="input"
              value={form.priority}
              onChange={(event) => change("priority", event.target.value)}
            >
              {priorities.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </Field>
        </div>
        {!isSubtask && (
          <Field label="Group">
            <select
              className="input"
              value={form.groupId}
              onChange={(event) => change("groupId", event.target.value)}
            >
              <option value="">Ungrouped</option>
              {groups.data?.filter((group) => group.canUse !== false).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label="Due date"
          type="datetime-local"
          value={form.dueDate}
          onChange={(event) => change("dueDate", event.target.value)}
        />
        <Field label="Participants">
          <select
            className="input h-24"
            multiple
            value={form.participantIds}
            onChange={(event) =>
              change(
                "participantIds",
                [...event.target.selectedOptions].map((option) => option.value),
              )
            }
          >
            {users.data
              ?.filter((member) => member.status === "ACTIVE")
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
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
          onChange={(event) => setFile(event.target.files[0])}
        />
        <ErrorBox error={save.error || groups.error} />
        <div className="form-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : parentTask ? "Save subtask" : "Save task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TaskDetail({ id, onClose }) {
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const [comment, setComment] = useState("");
  const [file, setFile] = useState(null);
  const [edit, setEdit] = useState(false);
  const [createSubtask, setCreateSubtask] = useState(false);
  const [childId, setChildId] = useState(null);
  const query = useQuery({
    queryKey: ["task", id],
    queryFn: () => api(`/tasks/${id}`).then((response) => response.data),
  });
  const task = query.data;
  const addComment = useMutation({
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
  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }) =>
      api(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["task", variables.taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const canManage =
    task &&
    (task.creatorId === user.id ||
      user.roles.includes("SYSTEM_ADMIN") ||
      (hasPermission("tasks.manage_department") &&
        user.departmentId === task.departmentId));
  const canChangeStatus =
    task &&
    (canManage ||
      task.assigneeId === user.id ||
      task.participants?.some((participant) => participant.userId === user.id));
  const subtasks = task?.subtasks || [];
  const done = completedCount(subtasks);

  const changeParentStatus = (status) => {
    if (
      status === "COMPLETED" &&
      subtasks.some((subtask) => subtask.status !== "COMPLETED") &&
      !window.confirm(
        `${subtasks.length - done} subtask(s) are still incomplete. Complete the parent task anyway?`,
      )
    )
      return;
    updateStatus.mutate({ taskId: id, status });
  };

  return (
    <Modal title="Task details" onClose={onClose} wide>
      {query.isLoading ? (
        <Loading />
      ) : task ? (
        <>
          <div className="flex justify-between gap-3 items-start">
            <div className="min-w-0">
              {task.parentTask && (
                <p className="mb-2 text-xs text-slate-400">
                  Subtask of {task.parentTask.title}
                </p>
              )}
              <h2 className="text-xl font-bold mb-3">{task.title}</h2>
              <div className="flex flex-wrap gap-2">
                <Badge value={task.priority} />
                <Badge value={task.status} />
                {task.group && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    {task.group.name}
                  </span>
                )}
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
                disabled={updateStatus.isPending || !canChangeStatus}
                onChange={(event) => changeParentStatus(event.target.value)}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!task.parentTaskId && (
            <section className="my-7 rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">Subtasks</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {subtasks.length ? `${done} / ${subtasks.length} completed` : "Break this task into smaller steps."}
                  </p>
                </div>
                {hasPermission("tasks.create") && (
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => setCreateSubtask(true)}
                  >
                    <Plus size={14} />
                    Add subtask
                  </button>
                )}
              </div>
              {subtasks.length ? (
                <div>
                  {subtasks.map((subtask) => {
                    const completed = subtask.status === "COMPLETED";
                    return (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-3 border-t border-slate-100 px-4 py-3"
                      >
                        <button
                          type="button"
                          aria-label={completed ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-blue-600 hover:bg-blue-50"
                          onClick={() =>
                            updateStatus.mutate({
                              taskId: subtask.id,
                              status: completed ? "OPEN" : "COMPLETED",
                            })
                          }
                        >
                          {completed ? (
                            <CheckSquare size={18} />
                          ) : (
                            <span className="h-[17px] w-[17px] rounded-[5px] border-2 border-slate-300" />
                          )}
                        </button>
                        <button
                          type="button"
                          className={`min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-blue-600 ${completed ? "text-slate-400 line-through" : "text-slate-700"}`}
                          onClick={() => setChildId(subtask.id)}
                        >
                          {subtask.title}
                        </button>
                        <span className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
                          <Avatar small name={subtask.assignee?.displayName || "?"} />
                          {subtask.assignee?.displayName || "Unassigned"}
                        </span>
                        <Badge value={subtask.status} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-5 text-sm text-slate-400">No subtasks yet.</div>
              )}
            </section>
          )}

          <Attachments items={task.attachments} />
          {task.participants.length > 0 && (
            <p className="text-xs text-slate-400 mt-4">
              Participants: {task.participants.map((participant) => participant.user.displayName).join(", ")}
            </p>
          )}
          <ErrorBox error={updateStatus.error} />
          <h3 className="font-semibold text-sm mt-8 mb-4">
            Discussion · {task.comments.length}
          </h3>
          <div className="space-y-5">
            {task.comments.map((entry) => (
              <div className="flex gap-3" key={entry.id}>
                <Avatar small name={entry.author.displayName} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">
                    {entry.author.displayName}
                    <span className="ml-3 font-normal text-slate-400">
                      {prettyDate(entry.createdAt)}
                    </span>
                  </div>
                  <p className="my-2 text-sm whitespace-pre-wrap">{entry.content}</p>
                  <Attachments items={entry.attachments} />
                </div>
              </div>
            ))}
          </div>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              addComment.mutate();
            }}
          >
            <textarea
              aria-label="Comment"
              placeholder="Add a comment…"
              className="input min-h-24"
              required
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <div className="flex justify-between items-center mt-3">
              <label className="text-xs text-slate-500 flex items-center gap-2 cursor-pointer">
                <Paperclip size={16} />
                {file?.name || "Attach a file"}
                <input
                  type="file"
                  className="sr-only"
                  aria-label="Comment attachment"
                  onChange={(event) => setFile(event.target.files[0])}
                />
              </label>
              <button className="btn-primary" disabled={addComment.isPending}>
                Comment
              </button>
            </div>
            <ErrorBox error={addComment.error} />
          </form>
          <details className="mt-7 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold">Activity history</summary>
            <div className="mt-3 space-y-2">
              {task.history.map((history) => (
                <p key={history.id}>
                  {prettyDate(history.createdAt)} · {history.actor?.displayName} · {" "}
                  {history.actionType.replaceAll("_", " ").toLowerCase()}
                </p>
              ))}
            </div>
          </details>
          {edit && <TaskForm existing={task} onClose={() => setEdit(false)} />}
          {createSubtask && (
            <TaskForm parentTask={task} onClose={() => setCreateSubtask(false)} />
          )}
          {childId && <TaskDetail id={childId} onClose={() => setChildId(null)} />}
        </>
      ) : (
        <ErrorBox error={query.error} />
      )}
    </Modal>
  );
}

export default function TasksPage() {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedTaskId = searchParams.get("task");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [board, setBoard] = useState(false);
  const [create, setCreate] = useState(false);
  const [createInGroup, setCreateInGroup] = useState("");
  const [groupForm, setGroupForm] = useState(null);
  const [id, setId] = useState(linkedTaskId);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [expandedTasks, setExpandedTasks] = useState(() => new Set());

  const query = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api("/tasks").then((response) => response.data),
  });
  const groups = useQuery({
    queryKey: ["task-groups"],
    queryFn: () => api("/tasks/groups").then((response) => response.data),
  });
  const quickStatus = useMutation({
    mutationFn: ({ taskId, status }) =>
      api(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task", variables.taskId] });
    },
  });
  const deleteGroup = useMutation({
    mutationFn: (groupId) => api(`/tasks/groups/${groupId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  useEffect(() => {
    if (linkedTaskId) setId(linkedTaskId);
  }, [linkedTaskId]);

  const closeTask = () => {
    setId(null);
    if (linkedTaskId) {
      const next = new URLSearchParams(searchParams);
      next.delete("task");
      setSearchParams(next, { replace: true });
    }
  };

  const allTasks = query.data || [];
  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const task of allTasks) {
      if (!task.parentTaskId) continue;
      const children = map.get(task.parentTaskId) || [];
      children.push(task);
      map.set(task.parentTaskId, children);
    }
    return map;
  }, [allTasks]);

  const matches = (task) => {
    const textMatch = `${task.title} ${task.description || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const filterMatch =
      filter === "all" ||
      (filter === "mine" && task.assigneeId === user.id) ||
      (filter === "active" && !["COMPLETED", "CANCELLED"].includes(task.status)) ||
      (filter === "completed" && task.status === "COMPLETED");
    return textMatch && filterMatch;
  };

  const visibleParents = useMemo(
    () =>
      allTasks.filter((task) => {
        if (task.parentTaskId) return false;
        if (matches(task)) return true;
        return (childrenByParent.get(task.id) || []).some(matches);
      }),
    // matches depends on these scalar states and is intentionally local to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, childrenByParent, filter, search, user.id],
  );

  const boardParents = useMemo(
    () => allTasks.filter((task) => !task.parentTaskId && matches(task)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, filter, search, user.id],
  );

  const isOverdue = (task) =>
    task.dueDate &&
    !["COMPLETED", "CANCELLED"].includes(task.status) &&
    new Date(task.dueDate).getTime() < Date.now();

  const incompleteChildren = (task) =>
    (childrenByParent.get(task.id) || []).filter((child) => child.status !== "COMPLETED");

  const toggleCompleted = (event, task) => {
    event.stopPropagation();
    const nextStatus = task.status === "COMPLETED" ? "OPEN" : "COMPLETED";
    const incomplete = task.parentTaskId ? [] : incompleteChildren(task);
    if (
      nextStatus === "COMPLETED" &&
      incomplete.length &&
      !window.confirm(
        `${incomplete.length} subtask(s) are still incomplete. Complete the parent task anyway?`,
      )
    )
      return;
    quickStatus.mutate({ taskId: task.id, status: nextStatus });
  };

  const toggleTaskExpanded = (event, taskId) => {
    event.stopPropagation();
    setExpandedTasks((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleGroup = (groupId) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const groupSections = useMemo(() => {
    const data = groups.data || [];
    const sections = data.map((group) => ({
      ...group,
      tasks: visibleParents.filter((task) => task.groupId === group.id),
    }));
    const ungrouped = visibleParents.filter((task) => !task.groupId);
    if (ungrouped.length || !sections.length) {
      sections.push({
        id: UNGROUPED,
        name: "Ungrouped",
        canManage: false,
        canUse: true,
        tasks: ungrouped,
      });
    }
    return sections;
  }, [groups.data, visibleParents]);

  const openCreateForGroup = (event, groupId) => {
    event.stopPropagation();
    setCreateInGroup(groupId === UNGROUPED ? "" : groupId);
    setCreate(true);
  };

  const card = (task) => {
    const children = childrenByParent.get(task.id) || [];
    const done = completedCount(children);
    return (
      <button
        key={task.id}
        className="card p-4 text-left w-full hover:border-blue-300 transition"
        onClick={() => setId(task.id)}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-semibold text-sm">{task.title}</span>
          <Badge value={task.priority} />
        </div>
        <p className="line-clamp-2 mt-3 text-xs leading-5 text-slate-400">
          {task.description}
        </p>
        {task.group && (
          <p className="mt-3 truncate text-[11px] font-medium text-slate-400">
            {task.group.name}
          </p>
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Avatar small name={task.assignee?.displayName || "?"} />
          <span className="flex-1 truncate">
            {task.assignee?.displayName || "Unassigned"}
          </span>
          {children.length > 0 && (
            <span className="flex items-center gap-1" title="Subtask progress">
              <CheckSquare size={12} />
              {done}/{children.length}
            </span>
          )}
          <MessageSquare size={12} />
          {task._count.comments}
        </div>
        <div className="flex items-center justify-between gap-2 mt-4">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <CalendarDays size={12} />
            {prettyDate(task.dueDate)}
          </span>
          <Badge value={task.status} />
        </div>
      </button>
    );
  };

  const listRow = (task, { subtask = false } = {}) => {
    const completed = task.status === "COMPLETED";
    const overdue = isOverdue(task);
    const children = childrenByParent.get(task.id) || [];
    const shownChildren = children.filter((child) => matches(task) || matches(child));
    const done = completedCount(children);
    const expanded = expandedTasks.has(task.id);
    const updating = quickStatus.isPending && quickStatus.variables?.taskId === task.id;

    return (
      <div key={task.id}>
        <div
          role="button"
          tabIndex={0}
          className={`grid min-w-[940px] grid-cols-[minmax(300px,1.8fr)_180px_165px_110px_145px_70px] items-center gap-4 border-t border-slate-100 px-5 py-3.5 text-left transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${subtask ? "bg-slate-50/40" : ""}`}
          onClick={() => setId(task.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setId(task.id);
            }
          }}
        >
          <div className={`flex min-w-0 items-start gap-2 ${subtask ? "pl-8" : ""}`}>
            {!subtask && children.length > 0 ? (
              <button
                type="button"
                aria-label={expanded ? `Collapse subtasks for ${task.title}` : `Expand subtasks for ${task.title}`}
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={(event) => toggleTaskExpanded(event, task.id)}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="h-6 w-6 shrink-0" />
            )}
            <button
              type="button"
              aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
              title={completed ? "Mark as open" : "Mark as completed"}
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
              disabled={updating}
              onClick={(event) => toggleCompleted(event, task)}
            >
              {completed ? (
                <CheckSquare size={19} />
              ) : (
                <span className="h-[18px] w-[18px] rounded-[5px] border-2 border-slate-300 bg-white" />
              )}
            </button>
            <div className="min-w-0">
              <p
                className={`truncate text-sm font-semibold ${completed ? "text-slate-400 line-through" : "text-slate-700"}`}
              >
                {task.title}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-400">
                {task.description ? (
                  <span className="max-w-[330px] truncate">{task.description}</span>
                ) : (
                  <span>{subtask ? "Subtask" : "No description"}</span>
                )}
                {!subtask && children.length > 0 && (
                  <span className="shrink-0">· {done}/{children.length} subtasks</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
            <Avatar small name={task.assignee?.displayName || "?"} />
            <span className="truncate">{task.assignee?.displayName || "Unassigned"}</span>
          </div>
          <div className={`flex items-center gap-2 text-sm ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
            <CalendarDays size={15} />
            <span className="truncate">{task.dueDate ? prettyDate(task.dueDate) : "No due date"}</span>
            {overdue && <span className="text-[10px] uppercase">Overdue</span>}
          </div>
          <div><Badge value={task.priority} /></div>
          <div><Badge value={task.status} /></div>
          <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400">
            <MessageSquare size={14} />
            {task._count.comments}
          </div>
        </div>
        {!subtask && expanded && shownChildren.map((child) => listRow(child, { subtask: true }))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Organize work into groups, tasks, and focused subtasks."
        action={
          hasPermission("tasks.create") && (
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={() => setGroupForm({})}>
                <FolderPlus size={17} />
                New group
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setCreateInGroup("");
                  setCreate(true);
                }}
              >
                <Plus size={17} />
                New task
              </button>
            </div>
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
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={15} />
            <input
              aria-label="Search tasks"
              className="input pl-9 w-48"
              placeholder="Search tasks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1" aria-label="Task view">
            <button
              type="button"
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!board ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setBoard(false)}
            >
              <List size={15} />
              List
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${board ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setBoard(true)}
            >
              <Columns3 size={15} />
              Board
            </button>
          </div>
        </div>
      </div>
      <ErrorBox error={query.error || groups.error || quickStatus.error || deleteGroup.error} />
      {query.isLoading || groups.isLoading ? (
        <Loading />
      ) : !visibleParents.length && !(groups.data || []).length ? (
        <div className="card">
          <Empty title="No tasks to show" text="Create a group or task, or try another filter." />
        </div>
      ) : board ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [["OPEN", "DRAFT"], "TO DO"],
            [["IN_PROGRESS", "BLOCKED"], "IN PROGRESS"],
            [["WAITING_REVIEW"], "IN REVIEW"],
            [["COMPLETED", "CANCELLED"], "DONE"],
          ].map(([statusGroup, label]) => (
            <section key={label} className="rounded-xl bg-slate-100 p-3">
              <h3 className="text-xs font-bold px-1 mb-4 text-slate-500">
                {label}
                <span className="float-right">
                  {boardParents.filter((task) => statusGroup.includes(task.status)).length}
                </span>
              </h3>
              <div className="space-y-3">
                {boardParents.filter((task) => statusGroup.includes(task.status)).map(card)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <div className="grid min-w-[940px] grid-cols-[minmax(300px,1.8fr)_180px_165px_110px_145px_70px] items-center gap-4 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <span>Task</span>
              <span>Assignee</span>
              <span>Due date</span>
              <span>Priority</span>
              <span>Status</span>
              <span className="text-right">Comments</span>
            </div>
            {groupSections.map((group) => {
              const collapsed = collapsedGroups.has(group.id);
              return (
                <section key={group.id}>
                  <div className="flex min-w-[940px] items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5">
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => toggleGroup(group.id)}
                      aria-label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                    >
                      {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <span className="font-semibold text-sm text-slate-700">{group.name}</span>
                    <span className="text-xs text-slate-400">{group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {hasPermission("tasks.create") && group.canUse !== false && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-800"
                          onClick={(event) => openCreateForGroup(event, group.id)}
                        >
                          <Plus size={14} />
                          Add task
                        </button>
                      )}
                      {group.canManage && (
                        <>
                          <button
                            type="button"
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
                            aria-label={`Rename ${group.name}`}
                            onClick={() => setGroupForm(group)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-red-600"
                            aria-label={`Delete ${group.name}`}
                            disabled={deleteGroup.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete “${group.name}”? Its tasks will be moved to Ungrouped.`,
                                )
                              )
                                deleteGroup.mutate(group.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {!collapsed && (
                    group.tasks.length ? (
                      group.tasks.map((task) => listRow(task))
                    ) : (
                      <div className="min-w-[940px] border-t border-slate-100 px-14 py-4 text-sm text-slate-400">
                        No tasks in this group.
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {create && (
        <TaskForm
          defaultGroupId={createInGroup}
          onClose={() => {
            setCreate(false);
            setCreateInGroup("");
          }}
        />
      )}
      {groupForm && (
        <GroupForm
          existing={groupForm.id ? groupForm : null}
          onClose={() => setGroupForm(null)}
        />
      )}
      {id && <TaskDetail id={id} onClose={closeTask} />}
    </>
  );
}
