import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const palette = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/Layout.jsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");
const spreadsheet = readFileSync(new URL("../src/pages/SpreadsheetPage.jsx", import.meta.url), "utf8");
const tasksCss = readFileSync(new URL("../src/pages/tasks-page.css", import.meta.url), "utf8");
const driveCss = readFileSync(new URL("../src/pages/drive-personal.css", import.meta.url), "utf8");
const messagesCss = readFileSync(new URL("../src/pages/messages-theme.css", import.meta.url), "utf8");
const dashboardCss = readFileSync(new URL("../src/pages/dashboard.css", import.meta.url), "utf8");
const accountCss = readFileSync(new URL("../src/pages/account-page.css", import.meta.url), "utf8");

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

  it("does not replace an active navigation gradient with a dark hover background", () => {
    expect(theme).toContain('.workspace-nav-link:not([aria-current="page"]):hover');
    expect(theme).toContain('.workspace-nav-link[aria-current="page"]:hover');
    expect(theme).toContain('color: var(--app-interactive-selected-text);');
    expect(palette).toContain('.workspace-nav-link:not([aria-current="page"]):hover');
    expect(palette).toContain('.workspace-nav-link[aria-current="page"]:hover');
    expect(theme).toContain('background: linear-gradient(112deg, var(--app-accent-gradient-start), var(--app-accent-gradient-end))');
  });

  it("keeps primary button labels legible before and after hover", () => {
    expect(theme).toContain('--app-interactive-selected-text: var(--app-on-accent);');
    expect(theme).toContain('.btn-primary:hover:not(:disabled)');
    expect(theme).toContain('color: var(--app-interactive-selected-text);');
    expect(tasksCss).toContain('.task-header-actions .btn-primary:hover:not(:disabled)');
    expect(tasksCss).toContain('background: linear-gradient(110deg, var(--app-ui-accent-start, #867afa)');
    expect(tasksCss).toContain('color: var(--app-ui-accent-label, #fff);');
    expect(driveCss).toContain('.drive-header-actions .btn-primary:hover:not(:disabled)');
    expect(driveCss).toContain('.drive-toolbar .tabs button.active:hover');
    expect(theme).toContain('.btn-secondary:hover:not(:disabled)');
  });

  it("does not leave Task Description and Participants on Midnight in OLED/Slate", () => {
    expect(palette).toContain(' .task-form {');
    for (const token of [
      '--task-control: var(--app-surface-input);',
      '--task-surface: var(--app-surface);',
      '--task-surface-raised: var(--app-surface-raised);',
      '--task-border: var(--app-border-strong);',
    ]) {
      expect(palette).toContain(token);
    }
    expect(palette).toContain('.task-form .filter-multiselect-panel');
    expect(palette).toContain('.task-form .filter-multiselect-search');
  });

  it("uses a shared font family and type scale without flattening component hierarchy", () => {
    for (const token of [
      '--app-font-family:',
      '--app-text-xs: 10px;',
      '--app-text-sm: 11px;',
      '--app-text-base: 12px;',
      '--app-text-md: 13px;',
      '--app-text-lg: 14px;',
      '--app-text-section: 16px;',
      '--app-text-heading:',
      '--app-text-heading-compact:',
      '--app-text-modal-title: 18px;',
    ]) {
      expect(theme).toContain(token);
    }
    expect(theme).toContain('font-family: var(--app-font-family);');
    expect(tasksCss).toContain('font-size: var(--app-text-heading,');
    expect(messagesCss).toContain('font-size: var(--app-text-heading,');
    expect(driveCss).toContain('font-size: var(--app-text-heading,');
    expect(dashboardCss).toContain('font-family: var(--app-font-family,');
    expect(dashboardCss).toContain('font-size: var(--app-text-heading-compact,');
    expect(accountCss).toContain('font-size: var(--app-text-section, 16px);');
  });

  it("offers three working dark radios and keeps System Sync disabled", () => {
    expect(account).toContain('...THEME_OPTIONS, { id: "system", label: "System Sync" }');
    expect(account).toContain('disabled={!available}');
    expect(account).toContain('saveThemePreference(userId, nextTheme)');
  });
});
