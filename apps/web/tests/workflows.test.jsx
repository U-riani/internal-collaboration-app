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
import { api } from "../src/lib/api.js";
vi.mock("../src/lib/api.js", () => ({
  api: vi.fn(),
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
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
      ["drive.use", "tasks.create", "approvals.submit"].includes(p),
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
beforeEach(() => vi.resetAllMocks());

describe("main workspace flows", () => {
  it("creates a Drive folder through a labeled form and refreshes the list", async () => {
    const items = [];
    api.mockImplementation(async (path, options = {}) => {
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
        meta: { breadcrumbs: [], folder: null, usedBytes: 0 },
      };
    });
    const user = mount(DrivePage);
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("Name"), "Team handbook");
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    await screen.findByRole("button", { name: /^Team handbook/ });
    expect(api).toHaveBeenCalledWith("/drive", {
      method: "POST",
      body: JSON.stringify({ name: "Team handbook", parentId: null }),
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
    await screen.findByRole("heading", { name: "Existing team" });
    await user.click(screen.getByRole("button", { name: "New conversation" }));
    await user.selectOptions(
      await screen.findByLabelText("Person"),
      "colleague",
    );
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

  it("allows an employee to assign their own new task without offering other assignees", async () => {
    api.mockImplementation(async (path, options = {}) =>
      path === "/users"
        ? { data: people }
        : { data: options.method ? { id: "task" } : [] },
    );
    const user = mount(TasksPage);
    await user.click(screen.getByRole("button", { name: "New task" }));
    await user.type(screen.getByLabelText("Task title"), "Prepare handbook");
    const assignee = screen.getByLabelText("Assigned to");
    await waitFor(() =>
      expect(assignee.querySelectorAll("option")).toHaveLength(2),
    );
    await user.selectOptions(assignee, "me");
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
