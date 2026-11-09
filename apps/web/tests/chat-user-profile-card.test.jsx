// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ChatPage from "../src/pages/ChatPage.jsx";
import { api, fetchAvatarImage } from "../src/lib/api.js";

vi.mock("../src/lib/api.js", () => ({
  api: vi.fn(), uploadFiles: vi.fn(), downloadFile: vi.fn(), fetchAvatarImage: vi.fn(),
}));
vi.mock("../src/hooks/useSocket.js", () => ({ useSocket: () => ({ current: null }) }));
vi.mock("../src/context/AuthContext.jsx", () => ({
  useAuth: () => ({ user: { id: "me", displayName: "Me" } }),
}));
const partner = { id: "other", displayName: "Alex Example", email: "alex@example.com" };
let group = false;
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  fetchAvatarImage.mockResolvedValue(null);
  api.mockImplementation(async (path) => {
    if (path === "/conversations") return { data: [{
      id: "chat", type: group ? "GROUP" : "DIRECT",
      name: group ? "Team Group" : null,
      members: [
        { userId: "me", user: { id: "me", displayName: "Me" } },
        { userId: "other", user: partner },
      ],
      messages: [], unreadCount: 0, unreadMessageCount: 0,
      unreadReactionCount: 0, updatedAt: "2026-11-09T10:00:00Z",
    }] };
    if (path === "/conversations/chat/messages")
      return { data: [], meta: { nextCursor: null } };
    if (path === "/users/other") return { data: {
      ...partner, phone: "+995 555 000 111", jobTitle: "ERP Specialist",
      department: { name: "Information Technology" }, roles: ["EMPLOYEE"], avatarUrl: null,
    } };
    return { data: [] };
  });
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ChatPage /></MemoryRouter></QueryClientProvider>);
}
describe("Messages user profile card", () => {
  it("opens from the avatar and name, displays user data, and closes", async () => {
    group = false;
    mount();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: /Alex Example/i }));
    const triggers = await screen.findAllByRole("button", { name: "View Alex Example profile" });
    await u.click(triggers[0]);
    expect(await screen.findByText("ERP Specialist")).toBeTruthy();
    expect(screen.getByText("Information Technology")).toBeTruthy();
    expect(screen.getByText("+995 555 000 111")).toBeTruthy();
    expect(screen.getByText("alex@example.com")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Close user profile" }));
    expect(screen.queryByRole("dialog", { name: /profile information/ })).toBeNull();
    await u.click(triggers[1]);
    expect(await screen.findByRole("dialog", { name: /profile information/ })).toBeTruthy();
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /profile information/ })).toBeNull();
  });
  it("positions the card below the header divider rather than the avatar", async () => {
    group = false;
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    const bounds = (left, top, width, height) => ({
      left, top, width, height,
      right: left + width, bottom: top + height, x: left, y: top,
      toJSON: () => ({}),
    });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.matches(".chat-conversation > header")) return bounds(0, 8, 600, 68);
      if (this.matches(".chat-header-person")) return bounds(68, 22, 230, 36);
      return bounds(0, 0, 0, 0);
    });
    try {
      mount();
      const u = userEvent.setup();
      await u.click(await screen.findByRole("button", { name: /Alex Example/i }));
      await u.click((await screen.findAllByRole("button", { name: "View Alex Example profile" }))[0]);
      const card = await screen.findByRole("dialog", { name: /profile information/ });
      expect(card.style.top).toBe("88px"); // header bottom (76) + 12px
    } finally {
      spy.mockRestore();
      HTMLElement.prototype.getBoundingClientRect = originalBounds;
    }
  });
  it("does not add profile triggers to group chat headers", async () => {
    group = true;
    mount();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: /Team Group/ }));
    expect(screen.queryByRole("button", { name: /View .* profile/ })).toBeNull();
    expect(api).not.toHaveBeenCalledWith("/users/other");
  });
});
