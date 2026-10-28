import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const palette = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/Layout.jsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");
const spreadsheet = readFileSync(new URL("../src/pages/SpreadsheetPage.jsx", import.meta.url), "utf8");

describe("Dark workspace appearance palettes", () => {
  it("has two scoped palettes and leaves Midnight CSS untouched", () => {
    expect(palette).toContain('.app-theme-dark[data-appearance="oled"]');
    expect(palette).toContain('.app-theme-dark[data-appearance="slate"]');
    expect(palette).toContain('--app-bg: #000000;');
    expect(palette).toContain('--app-bg: #171b23;');
    expect(theme).toContain('--app-bg: #0a0f1d;');
    expect(palette).not.toContain('[data-appearance="midnight"]');
    expect(palette).not.toContain('data-appearance="system"');
    expect([...palette].reduce((n, char) => n + (char === "{") - (char === "}"), 0)).toBe(0);
  });

  it("applies theme without replacing Layout or adding a new global Provider", () => {
    expect(layout).toContain('data-appearance={appearance}');
    expect(layout).toContain('data-accent={accent}');
    expect(layout).toContain('data-theme="dark"');
    expect(layout).toContain('window.addEventListener(THEME_EVENT, onThemeChange)');
    expect(layout).not.toContain('AppearanceProvider');
  });

  it("covers workspace surfaces, modals and main functional modules", () => {
    for (const selector of [
      '.tasks-page',
      '.account-page',
      '.messages-page',
      '.messages-page .chat-sidebar',
      '.new-conversation-dialog',
      '.new-conversation-name-field',
      '.task-detail',
      '.approval-detail',
      '.drive-page',
      '.drive-page .drive-directory-list',
      'dialog.modal:has(.drive-upload-modal)',
      '.modal:has(> .modal-body > .approval-detail)',
      '.overview-hero',
      '.overview-panel',
    ]) {
      expect(palette).toContain(selector);
    }
    expect(palette).not.toContain('status-approved {');
    expect(palette).not.toContain('notification-unread-dot {');
    expect(palette).not.toContain('drive-item-icon--pdf {');
  });

  it("covers deep Messages/Drive/Task/Approval/Account surfaces, not only page backgrounds", () => {
    for (const selector of [
      ".chat-composer-form",
      ".chat-message-row:not(.chat-message-own) .chat-message-bubble",
      ".chat-messages-scroll .btn-secondary",
      ".conversation-members-current-list",
      ".drive-directory-list .drive-table-head",
      ".drive-directory-summary",
      ".drive-space-nav",
      ".drive-member-person",
      ".drive-permission-mode-select",
      ".drive-upload-float-icon",
      ".task-form .task-form-footer",
      ".task-detail",
      ".approval-type-row",
      ".approval-config-field-card",
      ".approval-config-step-row",
      ".approval-bases-page",
      ".account-password-field",
      ".overview-task-row",
      ".overview-focus-count",
    ]) {
      expect(palette).toContain(selector);
    }
  });

  it("theming respects semantic states and also reaches Admin and Audit", () => {
    expect(palette).toContain(".app-modern-select::picker(select)");
    expect(palette).toContain("pre.bg-slate-50");
    expect(palette).toContain(".badge.bg-slate-100");
    expect(palette).not.toContain(".notification-card--urgent");
    expect(palette).not.toContain(".drive-item-icon--pdf");
    expect(palette).not.toContain(".task-group-state--attention");
    expect(palette).not.toContain('.app-theme-dark[data-appearance="midnight"]');
  });

  it("uses Univer native dark mode on desktop but keeps mobile WebView unchanged", () => {
    expect(spreadsheet).toContain('darkMode: !mobile && getThemePreference(user.id) !== "midnight"');
    expect(spreadsheet).toContain('workspace-spreadsheet flex');
    expect(palette).toContain(".workspace-spreadsheet");
    expect(spreadsheet).toContain('mobile');
  });

  it("offers three working dark radios and keeps System Sync disabled", () => {
    expect(account).toContain('...THEME_OPTIONS, { id: "system", label: "System Sync" }');
    expect(account).toContain('disabled={!available}');
    expect(account).toContain('saveThemePreference(userId, nextTheme)');
  });
});
