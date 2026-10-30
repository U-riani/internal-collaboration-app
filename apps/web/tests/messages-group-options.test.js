import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync(new URL("../src/pages/ChatPage.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/pages/messages-theme.css", import.meta.url), "utf8");
const lightTheme = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const appearancePalettes = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");

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

  it("keeps Members searchable and restricts management controls to the group creator", () => {
    const members = chat.split("function Members(")[1].split("function GroupRenameModal(")[0];
    expect(members).toContain("Current members");
    expect(members).toContain("conversation.type === \"GROUP\"");
    expect(members).toContain("conversation.ownerId === currentUserId");
    expect(members).toContain("member.role === \"OWNER\"");
    expect(members).toContain("isCreator &&");
    expect(members).toContain("conversation-members-protected");
    expect(members).toContain("enabled: isCreator");
    expect(members).toContain("<SearchBar");
    expect(members).toContain('ariaLabel="Search conversation members"');
    expect(members).toContain('ariaLabel="Search colleagues to add"');
    expect(members).toContain("filterConversationMembers");
    expect(members).toContain('role="list"');
    expect(members).toContain("No members found.");
    expect(members).toContain("Remove Group Member");
    expect(members).not.toContain("conversation-members-leave");
  });

  it("uses the member API, refreshes the cache, and respects global theme tokens", () => {
    const members = chat.split("function Members(")[1].split("function GroupRenameModal(")[0];
    expect(members).toContain('api("/conversations/" + conversation.id + "/members"');
    expect(members).toContain('method: "POST"');
    expect(members).toContain('method: "DELETE"');
    expect(members).toContain('qc.invalidateQueries({ queryKey: ["conversations"] })');
    expect(chat).toContain('"conversation:updated":');
    expect(chat).toContain('"conversation:removed":');
    expect(styles).toContain(".conversation-members-search");
    expect(styles).toContain(".conversation-members-current-list");
    expect(styles).toContain(".conversation-members-invite");
    expect(styles).toContain(".conversation-members-remove");
    expect(styles).toContain("var(--app-interactive-focus)");
    expect(styles).toContain("var(--app-surface-raised)");
    expect(styles).toContain("var(--app-interactive-hover)");
    expect(styles).toContain("var(--app-danger)");
    expect(styles).toContain(".chat-group-options-menu");
    expect(styles).toContain(".modal.group-action-modal");
  });
  it("renders multi-select colleague cards and rich current member cards", () => {
    const members = chat.split("function Members(")[1].split("function GroupRenameModal(")[0];
    expect(members).toContain('role="group" aria-label="Select colleagues"');
    expect(members).toContain('type="checkbox"');
    expect(members).toContain("checked={checked}");
    expect(members).toContain("toggleColleagueSelection");
    expect(members).toContain("addSelectedColleagues");
    expect(members).toContain("eligibleSelectedIds");
    expect(members).toContain("disabled={!eligibleSelectedIds.length || busy}");
    expect(members).toContain("conversation-members-person-email");
    expect(members).toContain("conversation-members-role-badge");
    expect(members).toContain("<ShieldCheck");
    expect(members).toContain("Remove Group Member");
    expect(members).not.toContain("online-indicator");
    expect(styles).toContain(".conversation-member-card");
    expect(styles).toContain(".conversation-members-picker-list");
    expect(styles).toContain(".conversation-members-checkbox:checked");
    expect(styles).toContain(".conversation-members-add-btn:disabled:hover");
    expect(styles).toContain("pointer-events: none");
  });
  it("keeps the Add label simple and shows errors without success notices", () => {
    const members = chat.split("function Members(")[1].split("function GroupRenameModal(")[0];
    expect(members).toContain('{addMember.isPending ? "Adding…" : "Add"}');
    expect(members).toContain('eligibleSelectedIds.length === 1 ? "colleague" : "colleagues"');
    expect(members).not.toContain('"Add ("');
    expect(members).not.toContain('setSuccessMessage');
    expect(members).not.toContain('conversation-members-success');
    expect(members).toContain('<ErrorBox error={addError || addMember.error || users.error} />');
    expect(members).toContain('<ErrorBox error={removeMember.error} />');
  });

  it("matches Task Participants: search inside one framed panel with transparent member rows", () => {
    const members = chat.split("function Members(")[1].split("function GroupRenameModal(")[0];
    expect(members).toContain('className="conversation-members-current-panel"');
    expect(members).toContain('className="conversation-members-current-list"');
    expect(members).toContain('className="conversation-members-current-row"');
    expect(members).toContain('className="conversation-members-person-icon"');
    expect(members).toContain('<UserRound size={16} strokeWidth={1.8} />');
    expect(members).not.toContain('className="conversation-member-card conversation-members-current-row"');
    expect(styles).toContain('.conversation-members-current-panel {');
    expect(styles).toContain('.conversation-members-current-row {');
    expect(styles).toContain('background: transparent;');
    expect(styles).toContain('.conversation-members-person-icon {');
    expect(styles).toContain('var(--app-icon-soft-bg');
  });


  it("keeps only the inner Members panels bordered across all global themes", () => {
    expect(styles).toMatch(/\.conversation-members-invite\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
    expect(styles).toMatch(/\.conversation-members-picker\s*\{[^}]*border:\s*1px solid var\(--app-border-strong\);/s);
    expect(styles).toMatch(/\.conversation-members-current-panel\s*\{[^}]*border:\s*1px solid var\(--app-border-strong\);/s);
    expect(styles).toMatch(/\.conversation-members-current-list\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
    expect(styles).toMatch(/\.conversation-member-card\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
    expect(styles).toContain(".conversation-member-choice.is-selected");
    expect(styles).toContain("background: var(--app-accent-soft)");
    expect(lightTheme).not.toMatch(/:is\([^)]*\.conversation-members-current-list/);
    expect(appearancePalettes).not.toMatch(/\]\) \.conversation-members-current-list/);
  });
});
