import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync(new URL("../src/pages/ChatPage.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/pages/messages-theme.css", import.meta.url), "utf8");

describe("Messages group actions", () => {
  it("shows the menu only for GROUP and keeps its actions accessible", () => {
    expect(chat).toContain('selected.type === "GROUP"');
    expect(chat).toContain('aria-label="Group options"');
    expect(chat).toContain('aria-haspopup="menu"');
    expect(chat).toContain('role="menuitem"');
    expect(chat).toContain("Rename group");
    expect(chat).toContain("Leave group");
    expect(chat).toContain("selected.ownerId === user.id");
  });

  it("uses the existing leave API and the future PATCH rename API", () => {
    expect(chat).toContain('method: "PATCH"');
    expect(chat).toContain('body: JSON.stringify({ name: name.trim() })');
    expect(chat).toContain("members/${user.id}");
    expect(chat).toContain('method: "DELETE"');
    expect(chat).toContain('qc.invalidateQueries({ queryKey: ["conversations"] })');
  });

  it("keeps Members read-only and styles new controls using theme tokens", () => {
    const members = chat.split("function Members(")[1].split("function GroupRenameModal(")[0];
    expect(members).toContain("Current members");
    expect(members).not.toContain("conversation-members-leave");
    expect(members).not.toContain("conversation-members-add-form");
    expect(members).not.toContain("<button");
    expect(members).toContain("<SearchBar");
    expect(members).toContain('ariaLabel="Search conversation members"');
    expect(members).toContain("filterConversationMembers");
    expect(members).toContain('role="list"');
    expect(members).toContain("No members found.");
    expect(styles).toContain(".conversation-members-search");
    expect(styles).toContain(".conversation-members-current-list");
    expect(styles).toContain("var(--app-interactive-focus)");
    expect(styles).toContain(".chat-group-options-menu");
    expect(styles).toContain(".modal.group-action-modal");
    expect(styles).toContain("var(--app-surface-raised)");
    expect(styles).toContain("var(--app-interactive-hover)");
  });
});
