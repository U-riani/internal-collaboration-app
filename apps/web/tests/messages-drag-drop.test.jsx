// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ChatPage from "../src/pages/ChatPage.jsx";
import { api, uploadFiles, fetchAvatarImage } from "../src/lib/api.js";

vi.mock("../src/lib/api.js", () => ({
  api: vi.fn(), uploadFiles: vi.fn(), downloadFile: vi.fn(), fetchAvatarImage: vi.fn(),
}));
vi.mock("../src/hooks/useSocket.js", () => ({ useSocket: () => ({ current: null }) }));
vi.mock("../src/context/AuthContext.jsx", () => ({
  useAuth: () => ({ user: { id: "me", displayName: "Me" } }),
}));

let conversationType = "DIRECT";
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  fetchAvatarImage.mockResolvedValue(null);
  uploadFiles.mockResolvedValue(["uploaded-1", "uploaded-2"]);
  api.mockImplementation(async (path, options) => {
    if (path === "/conversations") return { data: [{
      id: "chat", type: conversationType, name: conversationType === "GROUP" ? "Project team" : null,
      members: [
        { userId: "me", user: { id: "me", displayName: "Me" } },
        { userId: "other", user: { id: "other", displayName: "Colleague" } },
      ],
      messages: [], updatedAt: "2026-11-09T10:00:00Z",
      unreadCount: 0, unreadMessageCount: 0, unreadReactionCount: 0,
    }] };
    if (path === "/conversations/chat/messages" && !options)
      return { data: [], meta: { nextCursor: null } };
    return { data: [] };
  });
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mounted = render(<QueryClientProvider client={client}><MemoryRouter><ChatPage /></MemoryRouter></QueryClientProvider>);
  return mounted;
}
async function openChat(name) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name }));
  const zone = document.querySelector(".chat-messages-drop-zone");
  expect(zone).toBeTruthy();
  return { zone, user };
}
const drag = (files) => ({ dataTransfer: { types: ["Files"], files, dropEffect: "none" } });

describe("Messages drag-and-drop attachments", () => {
  it("shows an overlay only for files, survives nested drag events, and hides on leave", async () => {
    conversationType = "DIRECT";
    mount();
    const { zone } = await openChat(/Colleague/);
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["text/plain"] } });
    expect(screen.queryByText("Drop files here")).toBeNull();
    fireEvent.dragEnter(zone, drag([]));
    expect(screen.getByText("Drop files here")).toBeTruthy();
    fireEvent.dragEnter(zone.querySelector(".chat-messages-scroll"), drag([]));
    fireEvent.dragLeave(zone.querySelector(".chat-messages-scroll"), drag([]));
    expect(screen.getByText("Drop files here")).toBeTruthy();
    fireEvent.dragLeave(zone, drag([]));
    expect(screen.queryByText("Drop files here")).toBeNull();
  });

  it("confines the overlay and drop handler to messages content, not header or composer", async () => {
    conversationType = "DIRECT";
    mount();
    const { zone } = await openChat(/Colleague/);
    const header = document.querySelector(".chat-conversation > header");
    const footer = document.querySelector(".chat-composer");
    const file = new File(["draft"], "inside.txt");
    expect(zone.previousElementSibling).toBe(header);
    expect(zone.nextElementSibling).toBe(footer);
    fireEvent.dragEnter(header, drag([file]));
    fireEvent.drop(header, drag([file]));
    fireEvent.dragEnter(footer, drag([file]));
    fireEvent.drop(footer, drag([file]));
    expect(screen.queryByText("Drop files here")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove inside.txt" })).toBeNull();
    fireEvent.dragEnter(zone, drag([file]));
    const overlay = screen.getByRole("status", { name: "Drop files here" });
    expect(overlay.parentElement).toBe(zone);
    expect(zone.contains(overlay)).toBe(true);
    expect(header.contains(overlay)).toBe(false);
    expect(footer.contains(overlay)).toBe(false);
    fireEvent.drop(zone, drag([file]));
    expect(screen.getByRole("button", { name: "Remove inside.txt" })).toBeTruthy();
  });

  it("queues multiple dropped files without uploading or sending until Send is clicked", async () => {
    conversationType = "GROUP";
    mount();
    const { zone, user } = await openChat(/Project team/);
    const one = new File(["one"], "first.pdf", { type: "application/pdf" });
    const two = new File(["two"], "second.png", { type: "image/png" });
    fireEvent.dragEnter(zone, drag([one, two]));
    fireEvent.drop(zone, drag([one, two]));
    expect(screen.queryByText("Drop files here")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove first.pdf" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove second.png" })).toBeTruthy();
    expect(uploadFiles).not.toHaveBeenCalled();
    expect(api.mock.calls.some(([path, options]) =>
      path === "/conversations/chat/messages" && options?.method === "POST")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(uploadFiles).toHaveBeenCalledWith([one, two], expect.any(Map)));
    await waitFor(() => expect(api.mock.calls.some(([path, options]) =>
      path === "/conversations/chat/messages" && options?.method === "POST")).toBe(true));
  });

  it("uses the same deduplication and ten-file limit as the Attach button", async () => {
    conversationType = "DIRECT";
    mount();
    const { zone, user } = await openChat(/Colleague/);
    const first = new File(["a"], "first.txt");
    fireEvent.drop(zone, drag([first, first]));
    expect(screen.getAllByRole("button", { name: "Remove first.txt" })).toHaveLength(1);
    const more = Array.from({ length: 10 }, (_, i) => new File(["x"], `extra-${i}.txt`));
    fireEvent.drop(zone, drag(more));
    expect(screen.getByRole("alert").textContent).toContain("up to 10 files");
    expect(screen.getAllByRole("button", { name: "Remove first.txt" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Remove extra-0.txt" })).toBeNull();
    await user.upload(screen.getByLabelText("Message attachments"), new File(["b"], "from-picker.txt"));
    expect(screen.getByRole("button", { name: "Remove from-picker.txt" })).toBeTruthy();
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it("does not attach files dropped onto the Conversations sidebar", async () => {
    conversationType = "DIRECT";
    mount();
    const { zone } = await openChat(/Colleague/);
    const file = new File(["data"], "outside.txt");
    const sidebar = document.querySelector(".chat-sidebar");
    fireEvent.dragEnter(sidebar, drag([file]));
    fireEvent.drop(sidebar, drag([file]));
    expect(screen.queryByRole("button", { name: "Remove outside.txt" })).toBeNull();
    expect(screen.queryByText("Drop files here")).toBeNull();
    expect(zone.classList.contains("chat-file-drop-overlay")).toBe(false);
  });
});
