import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  ArrowUpDown,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Columns3,
  FolderPlus,
  List,
  ListFilter,
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
const UNASSIGNED = "__unassigned__";
const NO_DEPARTMENT = "__no_department__";

const DEFAULT_TASK_FILTERS = {
  statuses: [],
  priorities: [],
  assigneeIds: [],
  creatorIds: [],
  participantIds: [],
  groupIds: [],
  departmentIds: [],
  due: "any",
  createdFrom: "",
  createdTo: "",
  attachments: "any",
};

const SORT_OPTIONS = [
  ["manual", "Default / manual"],
  ["due_asc", "Due date · earliest"],
  ["due_desc", "Due date · latest"],
  ["priority_desc", "Priority · high to low"],
  ["priority_asc", "Priority · low to high"],
  ["created_desc", "Created · newest"],
  ["created_asc", "Created · oldest"],
  ["title_asc", "Title · A to Z"],
  ["title_desc", "Title · Z to A"],
  ["status", "Status"],
];

function completedCount(items = []) {
  return items.filter((item) => item.status === "COMPLETED").length;
}

function canUserChangeTaskStatus(task, user, hasPermission) {
  if (!task || !user) return false;
  return (
    task.creatorId === user.id ||
    task.assigneeId === user.id ||
    task.participants?.some((participant) => participant.userId === user.id) ||
    user.roles.includes("SYSTEM_ADMIN") ||
    (hasPermission("tasks.manage_department") &&
      user.departmentId &&
      user.departmentId === task.departmentId)
  );
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
    <Modal
      title={existing ? "Rename group" : "New task group"}
      onClose={onClose}
    >
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
    assigneeId:
      existing?.assigneeId ||
      (parentTask
        ? hasPermission("tasks.assign")
          ? parentTask.assigneeId || user.id
          : user.id
        : ""),
    priority: existing?.priority || parentTask?.priority || "NORMAL",
    groupId: existing?.personalLayout?.groupId || defaultGroupId || "",
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
    mutationFn: async () => {
      const attachmentIds = [
        ...(existing?.attachments.map((attachment) => attachment.fileId) || []),
        ...(file ? [(await uploadFile(file)).id] : []),
      ];
      const { groupId, ...sharedForm } = form;
      const response = await api(
        existing ? `/tasks/${existing.id}` : "/tasks",
        {
          method: existing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...sharedForm,
            ...(existing || isSubtask ? {} : { groupId: groupId || null }),
            assigneeId: form.assigneeId || null,
            parentTaskId: existing ? undefined : parentTask?.id || null,
            dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
            attachmentIds,
          }),
        },
      );
      if (existing && !isSubtask) {
        await api(`/tasks/${existing.id}/layout`, {
          method: "PUT",
          body: JSON.stringify({ groupId: groupId || null }),
        });
      }
      return response;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task"] });
      qc.invalidateQueries({ queryKey: ["task-groups"] });
      onClose();
    },
  });
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

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
            Subtask of{" "}
            <span className="font-semibold text-slate-700">
              {parentTask?.title || existing.parentTask.title}
            </span>
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
              {groups.data?.map((group) => (
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
            {save.isPending
              ? "Saving…"
              : parentTask
                ? "Save subtask"
                : "Save task"}
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
  const groups = useQuery({
    queryKey: ["task-groups"],
    queryFn: () => api("/tasks/groups").then((response) => response.data),
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
  const updateLayout = useMutation({
    mutationFn: (groupId) =>
      api(`/tasks/${id}/layout`, {
        method: "PUT",
        body: JSON.stringify({ groupId: groupId || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task-groups"] });
    },
  });
  const canManage =
    task &&
    (task.creatorId === user.id ||
      user.roles.includes("SYSTEM_ADMIN") ||
      (hasPermission("tasks.manage_department") &&
        user.departmentId === task.departmentId));
  const canChangeStatus = canUserChangeTaskStatus(task, user, hasPermission);
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
                {task.personalLayout?.group && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    My group · {task.personalLayout.group.name}
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
          <div
            className={`grid gap-4 my-6 rounded-xl bg-slate-50 p-4 text-sm ${
              task.parentTaskId
                ? "sm:grid-cols-2 lg:grid-cols-4"
                : "sm:grid-cols-2 lg:grid-cols-5"
            }`}
          >
            <div>
              <p className="text-xs text-slate-400 mb-2">Assigned to</p>
              {task.assignee?.displayName || "Unassigned"}
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">Created by</p>
              {task.creator?.displayName || "Unknown"}
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
            {!task.parentTaskId && (
              <div>
                <p className="text-xs text-slate-400 mb-2">My group</p>
                <select
                  aria-label="My task group"
                  className="input"
                  value={task.personalLayout?.groupId || ""}
                  disabled={updateLayout.isPending}
                  onChange={(event) => updateLayout.mutate(event.target.value)}
                >
                  <option value="">Ungrouped</option>
                  {(groups.data || []).map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <section className="my-7 rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold">Participants</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                People involved in this task. Use Edit task to change
                participants.
              </p>
            </div>
            {task.participants?.length ? (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-4">
                {task.participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-sm text-slate-600"
                  >
                    <Avatar small name={participant.user.displayName} />
                    <span className="font-medium">
                      {participant.user.displayName}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-t border-slate-100 px-4 py-4 text-sm text-slate-400">
                No participants.
              </div>
            )}
          </section>

          {!task.parentTaskId && (
            <section className="my-7 rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">Subtasks</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {subtasks.length
                      ? `${done} / ${subtasks.length} completed`
                      : "Break this task into smaller steps."}
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
                    const canChangeSubtaskStatus = canUserChangeTaskStatus(
                      subtask,
                      user,
                      hasPermission,
                    );
                    return (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-3 border-t border-slate-100 px-4 py-3"
                      >
                        <button
                          type="button"
                          aria-label={
                            completed
                              ? `Reopen ${subtask.title}`
                              : `Complete ${subtask.title}`
                          }
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={
                            updateStatus.isPending || !canChangeSubtaskStatus
                          }
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
                          <Avatar
                            small
                            name={subtask.assignee?.displayName || "?"}
                          />
                          {subtask.assignee?.displayName || "Unassigned"}
                        </span>
                        <Badge value={subtask.status} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-5 text-sm text-slate-400">
                  No subtasks yet.
                </div>
              )}
            </section>
          )}

          <Attachments items={task.attachments} />
          <ErrorBox
            error={updateStatus.error || updateLayout.error || groups.error}
          />
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
                  <p className="my-2 text-sm whitespace-pre-wrap">
                    {entry.content}
                  </p>
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
            <summary className="cursor-pointer font-semibold">
              Activity history
            </summary>
            <div className="mt-3 space-y-2">
              {task.history.map((history) => (
                <p key={history.id}>
                  {prettyDate(history.createdAt)} · {history.actor?.displayName}{" "}
                  · {history.actionType.replaceAll("_", " ").toLowerCase()}
                </p>
              ))}
            </div>
          </details>
          {edit && <TaskForm existing={task} onClose={() => setEdit(false)} />}
          {createSubtask && (
            <TaskForm
              parentTask={task}
              onClose={() => setCreateSubtask(false)}
            />
          )}
          {childId && (
            <TaskDetail id={childId} onClose={() => setChildId(null)} />
          )}
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
  const [advancedFilters, setAdvancedFilters] = useState(DEFAULT_TASK_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("manual");
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
    mutationFn: (groupId) =>
      api(`/tasks/groups/${groupId}`, { method: "DELETE" }),
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
  const filterPeople = useMemo(() => {
    const people = new Map();
    if (user?.id) {
      people.set(user.id, {
        id: user.id,
        displayName: user.displayName || user.email || "Me",
      });
    }
    for (const task of allTasks) {
      for (const person of [task.creator, task.assignee]) {
        if (person?.id) people.set(person.id, person);
      }
      for (const participant of task.participants || []) {
        if (participant.user?.id)
          people.set(participant.user.id, participant.user);
      }
    }
    return [...people.values()].sort((left, right) =>
      (left.displayName || left.email || "").localeCompare(
        right.displayName || right.email || "",
      ),
    );
  }, [allTasks, user?.id, user?.displayName, user?.email]);

  const filterDepartments = useMemo(() => {
    const departments = new Map();
    for (const task of allTasks) {
      if (task.department?.id)
        departments.set(task.department.id, task.department);
    }
    return [...departments.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [allTasks]);

  const toggleAdvancedValue = (key, value) => {
    setAdvancedFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  };

  const setAdvancedValues = (key, event) => {
    const values = [...event.target.selectedOptions].map(
      (option) => option.value,
    );
    setAdvancedFilters((current) => ({ ...current, [key]: values }));
  };

  const setAdvancedValue = (key, value) =>
    setAdvancedFilters((current) => ({ ...current, [key]: value }));

  const clearAdvancedFilters = () => setAdvancedFilters(DEFAULT_TASK_FILTERS);

  const advancedFilterCount = [
    advancedFilters.statuses.length,
    advancedFilters.priorities.length,
    advancedFilters.assigneeIds.length,
    advancedFilters.creatorIds.length,
    advancedFilters.participantIds.length,
    advancedFilters.groupIds.length,
    advancedFilters.departmentIds.length,
    advancedFilters.due !== "any",
    Boolean(advancedFilters.createdFrom),
    Boolean(advancedFilters.createdTo),
    advancedFilters.attachments !== "any",
  ].filter(Boolean).length;
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

  const matches = (task, parentTask = null) => {
    const textMatch = `${task.title} ${task.description || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());

    const quickFilterMatch =
      filter === "all" ||
      (filter === "mine" && task.assigneeId === user.id) ||
      (filter === "created" && task.creatorId === user.id) ||
      (filter === "participant" &&
        task.participants?.some(
          (participant) => participant.userId === user.id,
        )) ||
      (filter === "active" &&
        !["COMPLETED", "CANCELLED"].includes(task.status)) ||
      (filter === "completed" && task.status === "COMPLETED");

    const layoutOwner = task.parentTaskId && parentTask ? parentTask : task;
    const taskGroupId = layoutOwner.personalLayout?.groupId || UNGROUPED;
    const taskAssigneeId = task.assigneeId || UNASSIGNED;
    const taskDepartmentId = task.departmentId || NO_DEPARTMENT;

    const statusMatch =
      !advancedFilters.statuses.length ||
      advancedFilters.statuses.includes(task.status);
    const priorityMatch =
      !advancedFilters.priorities.length ||
      advancedFilters.priorities.includes(task.priority);
    const assigneeMatch =
      !advancedFilters.assigneeIds.length ||
      advancedFilters.assigneeIds.includes(taskAssigneeId);
    const creatorMatch =
      !advancedFilters.creatorIds.length ||
      advancedFilters.creatorIds.includes(task.creatorId);
    const participantMatch =
      !advancedFilters.participantIds.length ||
      task.participants?.some((participant) =>
        advancedFilters.participantIds.includes(participant.userId),
      );
    const groupMatch =
      !advancedFilters.groupIds.length ||
      advancedFilters.groupIds.includes(taskGroupId);
    const departmentMatch =
      !advancedFilters.departmentIds.length ||
      advancedFilters.departmentIds.includes(taskDepartmentId);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const nextWeekStart = new Date(todayStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const dueMatch =
      advancedFilters.due === "any" ||
      (advancedFilters.due === "no_due" && !dueDate) ||
      (advancedFilters.due === "overdue" &&
        dueDate &&
        !["COMPLETED", "CANCELLED"].includes(task.status) &&
        dueDate.getTime() < now.getTime()) ||
      (advancedFilters.due === "today" &&
        dueDate &&
        dueDate >= todayStart &&
        dueDate < tomorrowStart) ||
      (advancedFilters.due === "next7" &&
        dueDate &&
        dueDate >= todayStart &&
        dueDate < nextWeekStart);

    const createdAt = task.createdAt ? new Date(task.createdAt) : null;
    const createdFromMatch =
      !advancedFilters.createdFrom ||
      (createdAt &&
        createdAt >= new Date(`${advancedFilters.createdFrom}T00:00:00`));
    const createdToMatch =
      !advancedFilters.createdTo ||
      (createdAt &&
        createdAt <= new Date(`${advancedFilters.createdTo}T23:59:59.999`));

    const attachmentCount = task.attachments?.length || 0;
    const attachmentMatch =
      advancedFilters.attachments === "any" ||
      (advancedFilters.attachments === "with" && attachmentCount > 0) ||
      (advancedFilters.attachments === "without" && attachmentCount === 0);

    return (
      textMatch &&
      quickFilterMatch &&
      statusMatch &&
      priorityMatch &&
      assigneeMatch &&
      creatorMatch &&
      participantMatch &&
      groupMatch &&
      departmentMatch &&
      dueMatch &&
      createdFromMatch &&
      createdToMatch &&
      attachmentMatch
    );
  };

  const visibleParents = useMemo(
    () =>
      allTasks.filter((task) => {
        if (task.parentTaskId) return false;
        if (matches(task)) return true;
        return (childrenByParent.get(task.id) || []).some((child) =>
          matches(child, task),
        );
      }),
    // matches depends on these scalar states and is intentionally local to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, childrenByParent, filter, search, user.id, advancedFilters],
  );

  const isOverdue = (task) =>
    task.dueDate &&
    !["COMPLETED", "CANCELLED"].includes(task.status) &&
    new Date(task.dueDate).getTime() < Date.now();

  const incompleteChildren = (task) =>
    (childrenByParent.get(task.id) || []).filter(
      (child) => child.status !== "COMPLETED",
    );

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

  const compareManualPosition = (left, right) =>
    (left.personalLayout?.position ?? Number.MAX_SAFE_INTEGER) -
    (right.personalLayout?.position ?? Number.MAX_SAFE_INTEGER);

  const compareDueDate = (left, right, direction) => {
    const leftDate = left.dueDate ? new Date(left.dueDate).getTime() : null;
    const rightDate = right.dueDate ? new Date(right.dueDate).getTime() : null;
    if (leftDate === null && rightDate === null) return 0;
    if (leftDate === null) return 1;
    if (rightDate === null) return -1;
    return (leftDate - rightDate) * direction;
  };

  const sortTasks = (items) =>
    items.slice().sort((left, right) => {
      let result = 0;
      if (sortBy === "due_asc") result = compareDueDate(left, right, 1);
      else if (sortBy === "due_desc") result = compareDueDate(left, right, -1);
      else if (sortBy === "priority_desc")
        result =
          priorities.indexOf(right.priority) -
          priorities.indexOf(left.priority);
      else if (sortBy === "priority_asc")
        result =
          priorities.indexOf(left.priority) -
          priorities.indexOf(right.priority);
      else if (sortBy === "created_desc")
        result =
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime();
      else if (sortBy === "created_asc")
        result =
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime();
      else if (sortBy === "title_asc")
        result = left.title.localeCompare(right.title);
      else if (sortBy === "title_desc")
        result = right.title.localeCompare(left.title);
      else if (sortBy === "status")
        result = statuses.indexOf(left.status) - statuses.indexOf(right.status);
      else result = compareManualPosition(left, right);

      return (
        result ||
        compareManualPosition(left, right) ||
        left.title.localeCompare(right.title)
      );
    });

  const boardParents = useMemo(
    () => sortTasks(visibleParents),
    // sortTasks depends only on sortBy and the static ordering definitions above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleParents, sortBy],
  );

  const groupSections = useMemo(() => {
    const data = groups.data || [];
    const sections = data.map((group) => ({
      ...group,
      tasks: sortTasks(
        visibleParents.filter(
          (task) => task.personalLayout?.groupId === group.id,
        ),
      ),
    }));
    const ungrouped = sortTasks(
      visibleParents.filter((task) => !task.personalLayout?.groupId),
    );
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
  }, [groups.data, visibleParents, sortBy]);

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
        {task.personalLayout?.group && (
          <p className="mt-3 truncate text-[11px] font-medium text-slate-400">
            My group · {task.personalLayout.group.name}
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
    const shownChildren = children.filter(
      (child) => matches(task) || matches(child, task),
    );
    const done = completedCount(children);
    const expanded = expandedTasks.has(task.id);
    const updating =
      quickStatus.isPending && quickStatus.variables?.taskId === task.id;
    const canChangeStatus = canUserChangeTaskStatus(task, user, hasPermission);

    return (
      <div key={task.id}>
        <div
          role="button"
          tabIndex={0}
          className={`task-list-row grid min-w-[940px] grid-cols-[minmax(300px,1.8fr)_180px_165px_110px_145px_70px] items-center gap-4 border-t border-slate-100 px-5 py-3.5 text-left transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${subtask ? "bg-slate-50/40" : ""}`}
          onClick={() => setId(task.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setId(task.id);
            }
          }}
        >
          <div
            className={`flex min-w-0 items-start gap-2 ${subtask ? "pl-8" : ""}`}
          >
            {!subtask && children.length > 0 ? (
              <button
                type="button"
                aria-label={
                  expanded
                    ? `Collapse subtasks for ${task.title}`
                    : `Expand subtasks for ${task.title}`
                }
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={(event) => toggleTaskExpanded(event, task.id)}
              >
                {expanded ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            ) : (
              <span className="h-6 w-6 shrink-0" />
            )}
            <button
              type="button"
              aria-label={
                completed ? `Reopen ${task.title}` : `Complete ${task.title}`
              }
              title={completed ? "Mark as open" : "Mark as completed"}
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
              disabled={updating || !canChangeStatus}
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
                  <span className="max-w-[330px] truncate">
                    {task.description}
                  </span>
                ) : (
                  <span>{subtask ? "Subtask" : "No description"}</span>
                )}
                {!subtask && children.length > 0 && (
                  <span className="shrink-0">
                    · {done}/{children.length} subtasks
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
            <Avatar small name={task.assignee?.displayName || "?"} />
            <span className="truncate">
              {task.assignee?.displayName || "Unassigned"}
            </span>
          </div>
          <div
            className={`flex items-center gap-2 text-sm ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}
          >
            <CalendarDays size={15} />
            <span className="truncate">
              {task.dueDate ? prettyDate(task.dueDate) : "No due date"}
            </span>
            {overdue && <span className="text-[10px] uppercase">Overdue</span>}
          </div>
          <div>
            <Badge value={task.priority} />
          </div>
          <div>
            <Badge value={task.status} />
          </div>
          <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400">
            <MessageSquare size={14} />
            {task._count.comments}
          </div>
        </div>
        {!subtask &&
          expanded &&
          shownChildren.map((child) => listRow(child, { subtask: true }))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        action={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setGroupForm({})}>
              <FolderPlus size={17} />
              New group
            </button>
            {hasPermission("tasks.create") && (
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
            )}
          </div>
        }
      />
      <div className="toolbar task-toolbar stickytop-20 z-30 flex items-center gap-4 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="tabs task-quick-tabs" aria-label="Task quick filters">
          {[
            ["active", "Active", "Active"],
            ["mine", "Assigned to me", "Assigned"],
            ["created", "Created by me", "Created"],
            ["participant", "Participant", "Participant"],
            ["completed", "Completed", "Completed"],
            ["all", "All", "All"],
          ].map(([value, label, compactLabel]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
              title={label}
            >
              <span className="task-quick-label-full">{label}</span>
              <span className="task-quick-label-short">{compactLabel}</span>
            </button>
          ))}
        </div>

        <div className="task-toolbar-actions ml-auto flex items-center gap-2">
          <div className="relative">
            <Search
              className={`absolute right-3  top-3 text-slate-400`}
              size={15}
            />
            <input
              aria-label="Search tasks"
              className="input pl-9 pe-8! w-44 xl:w-52"
              placeholder="Search tasks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="relative">
            <button
              type="button"
              className={`btn-secondary relative ${advancedFilterCount ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`}
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
            >
              <ListFilter size={16} />
              <span className="hidden xl:inline">Filter</span>
              {advancedFilterCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                  {advancedFilterCount}
                </span>
              )}
            </button>

            {filtersOpen && (
              <div className="task-filter-panel fixed top-2 left-1/2 -translate-x-1/2 w-[680px] max-w-[calc(100vw-48px)] max-h-[calc(100vh-1rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white px-5 shadow-xl z-50">
                <div className="sticky top-0 z-10  bg-white pt-5 pb-3 flex items-center justify-between gap-4 border-b border-slate-200">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 sticky">
                      Filter tasks
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      These filters refine the selected quick filter.
                    </p>
                  </div>
                  <div>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setFiltersOpen((current) => !current)}
                    >
                      x
                    </button>
                  </div>
                </div>
                <div className="relative h-full mb-4 flex items-start justify-between gap-4">
                  {advancedFilterCount > 0 && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      onClick={clearAdvancedFilters}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {statuses.map((status) => (
                        <label
                          key={status}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={advancedFilters.statuses.includes(status)}
                            onChange={() =>
                              toggleAdvancedValue("statuses", status)
                            }
                          />
                          <span>{status.replaceAll("_", " ")}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Priority
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {priorities.map((priority) => (
                        <label
                          key={priority}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={advancedFilters.priorities.includes(
                              priority,
                            )}
                            onChange={() =>
                              toggleAdvancedValue("priorities", priority)
                            }
                          />
                          <span>{priority}</span>
                        </label>
                      ))}
                    </div>

                    <label className="mt-4 block text-xs font-semibold text-slate-500">
                      Due date
                      <select
                        className="input mt-1.5"
                        value={advancedFilters.due}
                        onChange={(event) =>
                          setAdvancedValue("due", event.target.value)
                        }
                      >
                        <option value="any">Any due date</option>
                        <option value="overdue">Overdue</option>
                        <option value="today">Due today</option>
                        <option value="next7">Due in next 7 days</option>
                        <option value="no_due">No due date</option>
                      </select>
                    </label>
                  </div>

                  <label className="text-xs font-semibold text-slate-500">
                    Assigned to
                    <select
                      multiple
                      className="input mt-1.5 h-28"
                      value={advancedFilters.assigneeIds}
                      onChange={(event) =>
                        setAdvancedValues("assigneeIds", event)
                      }
                    >
                      <option value={UNASSIGNED}>Unassigned</option>
                      {filterPeople.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName || person.email}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-slate-500">
                    Created by
                    <select
                      multiple
                      className="input mt-1.5 h-28"
                      value={advancedFilters.creatorIds}
                      onChange={(event) =>
                        setAdvancedValues("creatorIds", event)
                      }
                    >
                      {filterPeople.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName || person.email}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-slate-500">
                    Participant
                    <select
                      multiple
                      className="input mt-1.5 h-28"
                      value={advancedFilters.participantIds}
                      onChange={(event) =>
                        setAdvancedValues("participantIds", event)
                      }
                    >
                      {filterPeople.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName || person.email}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-slate-500">
                    Personal group
                    <select
                      multiple
                      className="input mt-1.5 h-28"
                      value={advancedFilters.groupIds}
                      onChange={(event) => setAdvancedValues("groupIds", event)}
                    >
                      <option value={UNGROUPED}>Ungrouped</option>
                      {(groups.data || []).map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-slate-500">
                    Department
                    <select
                      multiple
                      className="input mt-1.5 h-28"
                      value={advancedFilters.departmentIds}
                      onChange={(event) =>
                        setAdvancedValues("departmentIds", event)
                      }
                    >
                      <option value={NO_DEPARTMENT}>No department</option>
                      {filterDepartments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-slate-500">
                    Attachments
                    <select
                      className="input mt-1.5"
                      value={advancedFilters.attachments}
                      onChange={(event) =>
                        setAdvancedValue("attachments", event.target.value)
                      }
                    >
                      <option value="any">Any</option>
                      <option value="with">Has attachments</option>
                      <option value="without">No attachments</option>
                    </select>
                  </label>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2">
                    <label className="text-xs font-semibold text-slate-500">
                      Created from
                      <input
                        type="date"
                        className="input mt-1.5"
                        value={advancedFilters.createdFrom}
                        onChange={(event) =>
                          setAdvancedValue("createdFrom", event.target.value)
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-500">
                      Created to
                      <input
                        type="date"
                        className="input mt-1.5"
                        value={advancedFilters.createdTo}
                        onChange={(event) =>
                          setAdvancedValue("createdTo", event.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="sticky bottom-0 py-3 flex items-center justify-between border-t border-slate-100 bg-white pt-4">
                  <span className="hidden text-xs text-slate-400 sm:inline">
                    Hold Ctrl/Cmd to select multiple people or groups.
                  </span>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setFiltersOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
            <ArrowUpDown size={15} className="text-slate-400" />
            <select
              aria-label="Sort tasks"
              className="max-w-40 bg-transparent outline-none"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div
            className="inline-flex rounded-xl border border-slate-200 bg-white p-1"
            aria-label="Task view"
          >
            <button
              type="button"
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!board ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setBoard(false)}
            >
              <List size={15} />
              <span className="hidden xl:inline">List</span>
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${board ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-800"}`}
              onClick={() => setBoard(true)}
            >
              <Columns3 size={15} />
              <span className="hidden xl:inline">Board</span>
            </button>
          </div>
        </div>
      </div>

      {advancedFilterCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
            {advancedFilterCount} advanced filter
            {advancedFilterCount === 1 ? "" : "s"} active
          </span>
          <button
            type="button"
            className="font-semibold text-slate-500 hover:text-slate-800"
            onClick={clearAdvancedFilters}
          >
            Clear
          </button>
        </div>
      )}
      <ErrorBox
        error={
          query.error || groups.error || quickStatus.error || deleteGroup.error
        }
      />
      {query.isLoading || groups.isLoading ? (
        <Loading />
      ) : !visibleParents.length && !(groups.data || []).length ? (
        <div className="card">
          <Empty
            title="No tasks to show"
            text="Create a group or task, or try another filter."
          />
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
                  {
                    boardParents.filter((task) =>
                      statusGroup.includes(task.status),
                    ).length
                  }
                </span>
              </h3>
              <div className="space-y-3">
                {boardParents
                  .filter((task) => statusGroup.includes(task.status))
                  .map(card)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="task-list-card card max-h-[calc(100vh-18rem)] md:max-h-[calc(100vh-11.7rem)] overflow-auto">
          <div className=" ">
            <div className="task-list-header sticky top-0 z-5 grid min-w-[940px] grid-cols-[minmax(300px,1.8fr)_180px_165px_110px_145px_70px] items-center gap-4 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
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
                  <div className="task-group-header sticky top-10 z-4 flex min-w-[940px] items-center gap-2 border-t border-slate-200 bg-slate-100 px-4 py-2.5">
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => toggleGroup(group.id)}
                      aria-label={
                        collapsed
                          ? `Expand ${group.name}`
                          : `Collapse ${group.name}`
                      }
                    >
                      {collapsed ? (
                        <ChevronRight size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    <span className="font-semibold text-sm text-slate-700">
                      {group.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {group.tasks.length} task
                      {group.tasks.length === 1 ? "" : "s"}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      {hasPermission("tasks.create") &&
                        group.canUse !== false && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-800"
                            onClick={(event) =>
                              openCreateForGroup(event, group.id)
                            }
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
                                  `Delete “${group.name}”? Your tasks in this group will move to Ungrouped. Other users are not affected.`,
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
                  {!collapsed &&
                    (group.tasks.length ? (
                      group.tasks.map((task) => listRow(task))
                    ) : (
                      <div className="task-empty-row min-w-[940px] border-t border-slate-100 px-14 py-4 text-sm text-slate-400">
                        No tasks in this group.
                      </div>
                    ))}
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
