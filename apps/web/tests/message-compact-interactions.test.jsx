// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ChatPage from "../src/pages/ChatPage.jsx";
import { api, fetchAvatarImage } from "../src/lib/api.js";

vi.mock("../src/lib/api.js", () => ({
  api: vi.fn(),
  uploadFiles: vi.fn(),
  downloadFile: vi.fn(),
  fetchAvatarImage: vi.fn(),
}));
vi.mock("../src/hooks/useSocket.js", () => ({ useSocket: () => ({ current: null }) }));
vi.mock("../src/context/AuthContext.jsx", () => ({
  useAuth: () => ({ user: { id: "me", displayName: "Me" } }),
}));

const sender = { id: "me", displayName: "Me" };
const colleague = { id: "other", displayName: "Colleague" };
const makeMessage = (id, owner, minute) => ({
  id,
  senderId: owner.id,
  sender: owner,
  content: `Message ${id}`,
  attachments: [],
  reactions: [],
  receipts: [],
  createdAt: `2026-11-06T10:${String(minute).padStart(2, "0")}:00Z`,
});

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  fetchAvatarImage.mockRejectedValue(new Error("No avatar"));
  api.mockImplementation(async (path) => {
    if (path === "/conversations") return { data: [{
      id: "team", type: "GROUP", name: "Project team", ownerId: "me",
      members: [{ userId: "me", user: sender }, { userId: "other", user: colleague }],
      messages: [], updatedAt: "2026-11-06T10:03:00Z",
      unreadCount: 0, unreadMessageCount: 0, unreadReactionCount: 0,
    }] };
    if (path === "/conversations/team/messages") return {
      data: [
        makeMessage("1", sender, 0),
        makeMessage("2", sender, 1),
        makeMessage("3", sender, 2),
        makeMessage("4", colleague, 3),
      ],
      meta: { nextCursor: null },
    };
    return { data: [] };
  });
});

describe("compact chat UI", () => {
  it("shows grouped bubbles and opens only the clicked message toolbar", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter><ChatPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Project team/ }));
    const first = await screen.findByRole("button", { name: /Message 1\. Press Enter/ });
    const second = screen.getByRole("button", { name: /Message 2\. Press Enter/ });
    expect(container.querySelectorAll(".chat-message-group-continuation")).toHaveLength(2);
    expect(container.querySelectorAll(".chat-message-meta")).toHaveLength(2);
    expect(container.querySelectorAll(".chat-message-actions")).toHaveLength(0);
    expect(container.querySelectorAll(".chat-message-avatar-slot .avatar")).toHaveLength(1);

    await user.click(first);
    expect(within(screen.getByRole("toolbar", { name: "Message actions" })).getByRole("button", { name: "Reply to message" })).toBeTruthy();
    expect(first.getAttribute("aria-expanded")).toBe("true");

    await user.click(second);
    expect(screen.getAllByRole("toolbar", { name: "Message actions" })).toHaveLength(1);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");

    await user.click(second);
    expect(screen.queryByRole("toolbar", { name: "Message actions" })).toBeNull();
    await user.click(first);
    await user.click(container.querySelector(".chat-messages-scroll"));
    expect(screen.queryByRole("toolbar", { name: "Message actions" })).toBeNull();
  });
});
