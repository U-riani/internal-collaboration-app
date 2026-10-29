import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/lib/appearance.js", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/Layout.jsx", import.meta.url), "utf8");
const dark = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const messages = readFileSync(new URL("../src/pages/messages-theme.css", import.meta.url), "utf8");
const tasks = readFileSync(new URL("../src/pages/tasks-page.css", import.meta.url), "utf8");
const approvals = readFileSync(new URL("../src/pages/approvals-page.css", import.meta.url), "utf8");

describe("Light Theme — phase 3: Messages, Tasks and Approvals", () => {
  it("supports Light preference while preserving three stable dark themes", () => {
    expect(preferences).toContain('{ id: "light", label: "Light Theme" }');
    expect(account).toContain("THEME_OPTIONS.map(({ id, label }) => {");
    expect(layout).toContain('data-appearance={appearance}');
    expect(dark).toContain('--app-bg: #0a0f1d;');
    for (const theme of ["midnight", "oled", "slate"]) {
      expect(light).not.toContain(`[data-appearance="${theme}"]`);
    }
    expect(light).toContain('Phase 3A — Messages');
    expect(light).toContain('Phase 3B — Tasks');
    expect(light).toContain('Phase 3C — Approvals');
  });

  it("covers Messages, conversation panes, composer and dialogs", () => {
    for (const selector of [
      ".messages-page .chat-shell",
      ".messages-page .chat-sidebar",
      ".messages-page .chat-conversation",
      ".messages-page .chat-conversation-item.is-selected",
      ".messages-page .chat-conversation-item:hover",
      ".messages-page .chat-message-bubble",
      ".messages-page .chat-message-own .chat-message-bubble",
      ".messages-page .chat-composer-form",
      ".messages-page .chat-messages-scroll .btn-secondary",
      ".new-conversation-dialog",
      ".new-conversation-dialog::backdrop",
      ".new-conversation-type-switch button.is-active",
      ".new-conversation-person.is-selected",
      ".new-conversation-submit",
      ".modal:has(.conversation-members-modal)",
    ]) {
      expect(light).toContain(selector);
    }
    expect(messages).toContain("background:#50c7de;");
    expect(messages).toContain("background: #204e65;");
    expect(light).toContain("color: var(--app-ui-accent-label);");
  });

  it("rebinds Tasks local tokens in page and form, including filters and details", () => {
    for (const token of [
      "--task-bg: var(--app-bg);",
      "--task-surface: var(--app-surface);",
      "--task-control: var(--app-surface-input);",
      "--task-text: var(--app-text-strong);",
      "--task-hover: var(--app-surface-hover);",
      "--detail-bg: var(--app-surface);",
      "--detail-panel: var(--app-surface-raised);",
      "--detail-control: var(--app-surface-input);",
      "--detail-text: var(--app-text-strong);",
    ]) {
      expect(light).toContain(token);
    }
    for (const selector of [
      ".task-group-card",
      ".tasks-page .task-board-card",
      ".tasks-page .task-filter-panel",
      ".task-list-header",
      ".tasks-page .task-group-add.btn-primary",
      ".task-form .task-form-file::file-selector-button",
      ".task-form .task-form-footer",
      ".task-detail .task-detail-select-wrap",
      ".task-detail-comment-submit",
      ".filter-multiselect-option.is-selected",
    ]) {
      expect(light).toContain(selector);
    }
    expect(tasks).toContain(".task-list-row--subtask");
  });

  it("includes Approvals list/board, request types, dynamic forms and bases", () => {
    for (const selector of [
      ".approvals-page",
      ".approvals-page .approval-list-row",
      ".approval-board-card",
      ".approval-types-manager",
      ".approval-types-search",
      ".approval-type-row",
      ".approval-config-field-card",
      ".approval-config-step-row",
      ".approval-request-form",
      ".approval-request-actions .btn-secondary:disabled",
      ".approval-request-file::file-selector-button",
      ".approval-detail",
      ".approval-detail-comment-input",
      ".approval-bases-page",
      ".approval-bases-page .approval-bases-nav-item--active",
      ".approval-bases-page .approval-base-table",
    ]) {
      expect(light).toContain(selector);
    }
    expect(approvals).toContain(".approval-request-form");
    expect(approvals).toContain("Save draft");
    expect(light).toContain('color: var(--app-ui-accent-selected-text);');
  });

  it("only changes Light styling and leaves semantic warnings/urgent indicators intact", () => {
    expect(light).not.toContain('.app-theme-dark:not([data-appearance="light"])');
    expect(light).not.toContain(".notification-card--urgent");
    expect(light).not.toContain(".drive-item-icon--pdf");
    expect(light).not.toContain(".chat-unread-indicator {");
    expect(light).not.toContain(".approval-detail-step-indicator--rejected");
    expect(light).toContain("background: var(--palette-selection);");
    expect(light).toContain("color-scheme: light;");
    expect([...light].reduce((balance, char) => balance + (char === "{") - (char === "}"), 0)).toBe(0);
  });
});
