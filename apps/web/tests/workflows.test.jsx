import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import DrivePage from "../src/pages/DrivePage.jsx";
import ChatPage from "../src/pages/ChatPage.jsx";
import TasksPage from "../src/pages/TasksPage.jsx";
import ApprovalsPage from "../src/pages/ApprovalsPage.jsx";
import { api, uploadFiles, fetchAvatarImage } from "../src/lib/api.js";
const permissionState = vi.hoisted(() => ({ canAssignTasks: false }));
vi.mock("../src/lib/api.js", () => ({
  api: vi.fn(),
  uploadFile: vi.fn(),
  uploadFiles: vi.fn(),
  downloadFile: vi.fn(),
  fetchAvatarImage: vi.fn(),
}));
vi.mock("../src/hooks/useSocket.js", () => ({
  useSocket: () => ({ current: null }),
}));
vi.mock("../src/context/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: {
      id: "me",
      displayName: "Test User",
      departmentId: "department",
      roles: ["EMPLOYEE"],
    },
    hasPermission: (p) =>
      ["drive.use", "tasks.create", "approvals.submit"].includes(p) ||
      (p === "tasks.assign" && permissionState.canAssignTasks),
  }),
}));
const people = [
  { id: "me", displayName: "Test User", status: "ACTIVE" },
  { id: "colleague", displayName: "Test Colleague", status: "ACTIVE" },
];
function mount(Page) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
beforeEach(() => {
  vi.resetAllMocks();
  permissionState.canAssignTasks = false;
  uploadFiles.mockResolvedValue([]);
  fetchAvatarImage.mockRejectedValue(Object.assign(new Error("Photo not found"), { status: 404 }));
  sessionStorage.clear();
});

describe("main workspace flows", () => {
  it("creates a Drive folder through a labeled form and refreshes the list", async () => {
    const items = [];
    api.mockImplementation(async (path, options = {}) => {
      if (path === "/drive/spaces")
        return {
          data: [{ id: "personal", type: "PERSONAL", name: "Personal", access: "OWNER" }],
        };
      if (options.method === "POST") {
        const input = JSON.parse(options.body);
        items.push({
          ...input,
          id: "folder",
          kind: "FOLDER",
          access: "OWNER",
          owner: { displayName: "Test User" },
          updatedAt: "2026-09-16",
        });
        return { data: items[0] };
      }
      return {
        data: [...items],
        meta: {
          breadcrumbs: [],
          folder: null,
          space: { id: "personal", access: "OWNER" },
          usedBytes: 0,
        },
      };
    });
    const user = mount(DrivePage);
    await user.click(await screen.findByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("Folder name"), "Team handbook");
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    await screen.findByRole("button", { name: /^Team handbook/ });
    expect(api).toHaveBeenCalledWith("/drive", {
      method: "POST",
      body: JSON.stringify({ name: "Team handbook", parentId: null, spaceId: "personal" }),
    });
  });

  it("selects a newly created conversation and sends the message to it", async () => {
    const old = {
      id: "old",
      type: "GROUP",
      name: "Existing team",
      members: [],
      messages: [],
    };
    const newConversation = {
      id: "new",
      type: "DIRECT",
      members: [
        { userId: "me", user: people[0] },
        { userId: "colleague", user: people[1] },
      ],
      messages: [],
    };
    let created = false;
    api.mockImplementation(async (path, options = {}) => {
      if (path === "/users") return { data: people };
      if (path === "/conversations" && options.method === "POST") {
        created = true;
        return { data: newConversation };
      }
      if (path === "/conversations")
        return { data: created ? [newConversation, old] : [old] };
      if (path.endsWith("/messages") && options.method === "POST")
        return { data: { id: "sent" } };
      if (path.endsWith("/messages"))
        return { data: [], meta: { nextCursor: null } };
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = mount(ChatPage);
    await screen.findByRole("button", { name: /Existing team/ });
    await user.click(screen.getByRole("button", { name: "New conversation" }));
    await user.click(await screen.findByRole("radio", { name: /Test Colleague/ }));
    await user.click(
      screen.getByRole("button", { name: "Start conversation" }),
    );
    await screen.findByRole("heading", { name: "Test Colleague" });
    await user.type(
      screen.getByRole("textbox", { name: "Message", exact: true }),
      "Hello team",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/conversations/new/messages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            content: "Hello team",
            attachmentIds: [],
            replyToMessageId: null,
          }),
        }),
      ),
    );
  });

  it("renames a group from its options menu and updates the header and list", async () => {
    const group = {
      id: "team",
      type: "GROUP",
      name: "Original group",
      ownerId: "me",
      members: [
        { userId: "me", role: "OWNER", user: people[0] },
        { userId: "colleague", role: "MEMBER", user: people[1] },
      ],
      messages: [],
      unreadCount: 0,
      updatedAt: "2026-10-30T08:00:00.000Z",
    };
    api.mockImplementation(async (path, options = {}) => {
      if (path === "/conversations") return { data: [{ ...group }] };
      if (path === "/conversations/team" && options.method === "PATCH") {
        const { name } = JSON.parse(options.body);
        group.name = name;
        return { data: { id: group.id, type: group.type, name } };
      }
      if (path.endsWith("/messages"))
        return { data: [], meta: { nextCursor: null } };
      if (path === "/users") return { data: people };
      return { data: [] };
    });

    const user = mount(ChatPage);
    await user.click(await screen.findByRole("button", { name: /Original group/ }));
    await screen.findByRole("heading", { name: "Original group" });
    await user.click(screen.getByRole("button", { name: "Group options" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename group" }));

    const nameField = screen.getByRole("textbox", { name: "Group name" });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(nameField.value).toBe("Original group");
    expect(save.disabled).toBe(true);

    await user.clear(nameField);
    await user.type(nameField, "A");
    expect(save.disabled).toBe(true);
    await user.clear(nameField);
    await user.type(nameField, "  New team name  ");
    await user.click(save);

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/conversations/team", {
        method: "PATCH",
        body: JSON.stringify({ name: "New team name" }),
      }),
    );
    await screen.findByRole("heading", { name: "New team name" });
    expect(screen.getByRole("button", { name: /New team name/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows an employee to assign their own new task without offering other assignees", async () => {
    api.mockImplementation(async (path, options = {}) =>
      path === "/users"
        ? { data: people }
        : { data: options.method ? { id: "task" } : [] },
    );
    const user = mount(TasksPage);
    await user.click(screen.getByRole("button", { name: "New task" }));
    // Header, scrollable fields and footer must be independent for all TaskForm modes.
    const dialog = screen.getByRole("dialog");
    const fields = dialog.querySelector(".task-form-scroll");
    const footer = dialog.querySelector(".task-form-footer");
    expect(fields).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(fields.contains(footer)).toBe(false);
    expect(footer.querySelector('button[type="submit"]').textContent).toBe("Save task");
    expect(footer.querySelector('button[type="button"]')).toBeNull();
    expect(dialog.querySelector(".task-form")?.classList.contains("task-form")).toBe(true);
    await user.type(screen.getByLabelText("Task title"), "Prepare handbook");
    expect(screen.getByLabelText("Priority").classList.contains("app-modern-select")).toBe(true);
    const assigneeSearch = screen.getByRole("searchbox", { name: "Search assigned to" });
    await user.type(assigneeSearch, "Test");
    expect(screen.queryByRole("checkbox", { name: "Assigned to: Test Colleague" })).toBeNull();
    const self = await screen.findByRole("checkbox", { name: "Assigned to: Test User" });
    await user.click(self);
    expect(self.checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save task" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"assigneeId":"me"'),
        }),
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("selects multiple task participants without Ctrl and saves them", async () => {
    api.mockImplementation(async (path, options = {}) =>
      path === "/users"
        ? { data: people }
        : { data: options.method ? { id: "task" } : [] },
    );
    const user = mount(TasksPage);
    await user.click(screen.getByRole("button", { name: "New task" }));
    await user.type(screen.getByLabelText("Task title"), "Review milestones");

    const first = await screen.findByRole("checkbox", {
      name: "Participants: Test User",
    });
    const second = screen.getByRole("checkbox", {
      name: "Participants: Test Colleague",
    });
    await user.click(first);
    await user.click(second);
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(true);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save task" }));
    await waitFor(() => {
      const call = api.mock.calls.find(
        ([path, options]) => path === "/tasks" && options?.method === "POST",
      );
      expect(call).toBeDefined();
      expect(JSON.parse(call[1].body).participantIds).toEqual(["me", "colleague"]);
    });
  });

  it("keeps one searchable assignee, supports Unassigned, and positions fields in New Task", async () => {
    permissionState.canAssignTasks = true;
    api.mockImplementation(async (path, options = {}) =>
      path === "/users"
        ? { data: people }
        : { data: options.method ? { id: "task" } : [] },
    );
    const user = mount(TasksPage);
    await user.click(screen.getByRole("button", { name: "New task" }));
    const dialog = screen.getByRole("dialog", { name: "New task" });
    const form = dialog.querySelector(".task-form-scroll");
    const group = screen.getByLabelText("Group");
    const priority = screen.getByLabelText("Priority");
    const dueDate = screen.getByLabelText("Due date");
    const assigned = dialog.querySelectorAll(".filter-multiselect")[0];
    const participants = dialog.querySelectorAll(".filter-multiselect")[1];
    expect(group.closest(".task-form-row")).toBe(priority.closest(".task-form-row"));
    expect(form.querySelector(".task-form-row").compareDocumentPosition(dueDate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dueDate.compareDocumentPosition(assigned) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(assigned.compareDocumentPosition(participants) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const first = await screen.findByRole("checkbox", { name: "Assigned to: Test User" });
    const second = screen.getByRole("checkbox", { name: "Assigned to: Test Colleague" });
    const unassigned = screen.getByRole("checkbox", { name: "Assigned to: Unassigned" });
    expect(unassigned.checked).toBe(true);
    await user.click(first);
    expect(first.checked).toBe(true);
    expect(unassigned.checked).toBe(false);
    await user.click(second);
    expect(second.checked).toBe(true);
    expect(first.checked).toBe(false);
    await user.click(unassigned);
    expect(second.checked).toBe(false);
    expect(unassigned.checked).toBe(true);

    await user.type(screen.getByLabelText("Task title"), "Review access");
    await user.click(second);
    await user.click(screen.getByRole("button", { name: "Save task" }));
    await waitFor(() => {
      const call = api.mock.calls.find(([path, options]) => path === "/tasks" && options?.method === "POST");
      expect(JSON.parse(call[1].body).assigneeId).toBe("colleague");
    });
  });

  it("reuses the searchable assignee in Edit Task and Add Sub Task without a subtask group", async () => {
    permissionState.canAssignTasks = true;
    const task = {
      id: "task-1", title: "Parent task", description: "", status: "OPEN",
      creatorId: "me", assigneeId: "colleague", assignee: people[1],
      creator: people[0], priority: "NORMAL", dueDate: null,
      parentTaskId: null, personalLayout: { groupId: null },
      participants: [], attachments: [], subtasks: [], comments: [], history: [],
      createdAt: "2026-11-04T09:00:00.000Z", _count: { comments: 0 },
    };
    api.mockImplementation(async (path, options = {}) => {
      if (path === "/users") return { data: people };
      if (path === "/tasks") return { data: [task] };
      if (path === "/tasks/task-1") return { data: task };
      if (path === "/tasks/groups") return { data: [] };
      if (path === "/notifications/read-related") return { data: null };
      if (options.method) return { data: null };
      return { data: [] };
    });
    const user = mount(TasksPage);
    await user.click(await screen.findByText("Parent task"));
    await user.click(await screen.findByRole("button", { name: "Edit task" }));
    const edit = screen.getByRole("dialog", { name: "Edit task" });
    expect(edit.querySelectorAll(".filter-multiselect")).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: "Assigned to: Test Colleague" }).checked).toBe(true);
    expect(edit.querySelector(".task-form-row").querySelectorAll("select")).toHaveLength(2);
    await user.click(edit.querySelector('button[aria-label="Close dialog"]'));

    await user.click(screen.getByRole("button", { name: "Add subtask" }));
    const subtask = screen.getByRole("dialog", { name: "New subtask" });
    expect(subtask.querySelectorAll(".filter-multiselect")).toHaveLength(2);
    expect(subtask.querySelector(".task-form-row").querySelectorAll("select")).toHaveLength(1);
    expect(subtask.querySelector(".task-form-row select").value).toBe("NORMAL");
    expect(subtask.querySelector(".task-form-row").textContent).not.toContain("Group");
    expect(screen.getByRole("checkbox", { name: "Assigned to: Test Colleague" }).checked).toBe(true);
  });

  it("keeps long task group names compact and shows participants as user rows", async () => {
    const group = {
      id: "group-1",
      name: "Flutter Mobile App Team with a very long group name",
      canManage: true,
      canUse: true,
    };
    const task = {
      id: "task-details-fixture",
      title: "Task details visual regression",
      description: "Review the current implementation.",
      creatorId: "me",
      assigneeId: "me",
      creator: people[0],
      assignee: people[0],
      status: "OPEN",
      priority: "NORMAL",
      dueDate: null,
      createdAt: "2026-10-27T08:00:00.000Z",
      parentTaskId: null,
      personalLayout: { groupId: group.id, group, position: 0 },
      participants: [{ userId: "colleague", user: people[1] }],
      subtasks: [],
      attachments: [],
      comments: [],
      history: [],
      _count: { comments: 0 },
    };
    api.mockImplementation(async (path, options = {}) => {
      if (path === "/tasks") return { data: [task] };
      if (path === `/tasks/${task.id}`) return { data: task };
      if (path === "/tasks/groups") return { data: [group] };
      if (path === "/notifications") return { data: [] };
      if (path === "/notifications/read-related") return { data: {} };
      if (path === `/tasks/${task.id}/layout` && options.method === "PUT") {
        return { data: {} };
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
    const user = mount(TasksPage);
    await user.click(await screen.findByText("Task details visual regression"));
    const details = await screen.findByRole("dialog", { name: "Task details" });
    const groupSelect = screen.getByRole("combobox", { name: "My task group" });
    expect(groupSelect.classList.contains("task-detail-group-select")).toBe(true);
    expect(groupSelect.title).toBe(group.name);
    expect(groupSelect.value).toBe(group.id);
    const statusSelect = screen.getByRole("combobox", { name: "Task status" });
    const groupWrap = groupSelect.closest(".task-detail-select-wrap");
    const statusWrap = statusSelect.closest(".task-detail-select-wrap");
    expect(groupWrap).not.toBeNull();
    expect(statusWrap).not.toBeNull();
    expect(groupWrap.querySelector(".task-detail-select-preview-label").textContent).toBe(group.name);
    expect(statusWrap.querySelector(".task-detail-select-preview-label").textContent).toBe("OPEN");
    expect(details.querySelectorAll(".task-detail-select-preview > svg")).toHaveLength(2);
    expect(details.querySelector(".task-detail-person-name")?.textContent).toBe("Test Colleague");
    expect(details.querySelector(".task-detail-person-icon")).not.toBeNull();
    expect(details.querySelector(".task-detail-participants-list")).not.toBeNull();

    await user.selectOptions(groupSelect, "");
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/tasks/${task.id}/layout`, {
        method: "PUT",
        body: JSON.stringify({ groupId: null }),
      }),
    );
  });

  it("submits typed approval fields without asking employees to edit JSON", async () => {
    const type = {
      id: "equipment",
      name: "Equipment request",
      formSchema: {
        reason: { label: "Reason", type: "textarea", required: true },
        cost: { label: "Cost", type: "number" },
      },
    };
    api.mockImplementation(async (path, options = {}) => ({
      data:
        path === "/approval-types"
          ? [type]
          : options.method
            ? { id: "request" }
            : [],
    }));
    const user = mount(ApprovalsPage);
    await user.click(screen.getByRole("button", { name: "New request" }));
    await user.selectOptions(
      await screen.findByLabelText("Request type"),
      "equipment",
    );
    await user.type(screen.getByLabelText("Title"), "New laptop");
    await user.type(screen.getByLabelText("Reason *"), "Development work");
    await user.type(screen.getByLabelText("Cost"), "1400");
    await user.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/approval-requests", {
        method: "POST",
        body: JSON.stringify({
          approvalTypeId: "equipment",
          title: "New laptop",
          data: { reason: "Development work", cost: 1400 },
          submit: true,
          attachmentIds: [],
        }),
      }),
    );
  });
});
