import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const dark = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const palettes = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/lib/appearance.js", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");
const drive = readFileSync(new URL("../src/pages/drive-personal.css", import.meta.url), "utf8");
const upload = readFileSync(new URL("../src/components/DriveUploadModal.css", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/pages/notifications-page.css", import.meta.url), "utf8");
const directory = readFileSync(new URL("../src/pages/directory-page.css", import.meta.url), "utf8");

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

describe("Light Theme phase 4 — Drive, Notifications and People", () => {
  it("supports the selectable Light palette without changing old dark palettes", () => {
    expect(preferences).toContain('{ id: "light", label: "Light Theme" }');
    expect(account).toContain("THEME_OPTIONS.map(({ id, label }) => {");
    expect(dark).toContain("--app-bg: #0a0f1d;");
    expect(palettes).toContain('.app-theme-dark[data-appearance="oled"]');
    expect(palettes).toContain('.app-theme-dark[data-appearance="slate"]');
    for (const theme of ["midnight", "oled", "slate"]) {
      expect(light).not.toContain(`[data-appearance="${theme}"]`);
    }
  });

  it("covers Drive file tables, search, shared spaces and trash without changing file actions", () => {
    expect(light).toContain("Phase 4A — Drive");
    for (const item of [
      ".drive-page",
      ".drive-toolbar",
      ".drive-search-bar",
      ".drive-directory-list",
      ".drive-directory-row",
      ".drive-table-head",
      ".drive-directory-summary",
      ".drive-shared-list",
      ".drive-space-nav",
      ".drive-group-link.is-selected",
      ".drive-shared-space-heading",
      ".drive-header-actions .btn-secondary",
      ".drive-row-actions .icon-btn",
    ]) {
      expect(light).toContain(item);
    }
    expect(drive).toContain(".drive-shared-with-me-list");
    expect(drive).toContain(".drive-trash-list");
    expect(light).toContain("background: var(--palette-selection);");
  });

  it("styles Drive's separate Members, Permissions and Upload dialogs", () => {
    for (const item of [
      ".modal:has(.drive-space-members-modal)",
      ".modal:has(.drive-permission-note)",
      ".drive-member-person--admin",
      ".drive-member-role-select",
      ".drive-member-list",
      ".drive-permission-mode-select",
      ".drive-new-group-form",
      ".drive-new-folder-form",
      "dialog.modal:has(.drive-upload-modal)",
      "--upload-bg: var(--app-surface);",
      "--upload-panel: var(--app-surface-raised);",
      "--upload-text: var(--app-text-strong);",
      ".drive-upload-file",
      ".drive-upload-track",
    ]) {
      expect(light).toContain(item);
    }
    expect(light).toContain('.modal:has(.drive-space-members-modal) .modal-body {');
    expect(light).toContain('color: #13765c;');
    expect(light).toContain('color: #bd3650;');
    expect(upload).toContain(".drive-upload-status.status-done");
    expect(upload).toContain(".drive-upload-status.status-error");
    expect(drive).toContain(".drive-permission-note--restricted");
  });

  it("keeps Notifications priority/unread semantics but themes their controls", () => {
    expect(light).toContain("Phase 4B — Notifications");
    for (const item of [
      ".notifications-page",
      "--notice-surface: var(--app-surface);",
      "--notice-control: var(--app-surface-input);",
      ".notifications-header-sort.task-sort-control",
      ".notifications-tabs button.active",
      ".notification-card--unread",
      ".notification-card:hover",
      ".notification-priority-control.task-sort-control",
      ".notifications-pagination .btn-secondary",
      "border-left-color: var(--notice-accent);",
      "background: var(--notice-tint);",
    ]) {
      expect(light).toContain(item);
    }
    for (const priorityColor of ["#cbd5e1", "#7dd3fc", "#fde68a", "#fb7185"]) {
      expect(notifications).toContain(`--notice-accent: ${priorityColor};`);
    }
    expect(notifications).toContain(".notification-unread-dot");
  });

  it("covers People search/selects, directory cards and contact links", () => {
    expect(light).toContain("Phase 4C — People");
    for (const item of [
      ".directory-page .directory-filters",
      ".directory-search-bar.task-search-bar",
      ".directory-filters select.directory-filter-select",
      ".directory-page article.card",
      ".directory-page article.card h2",
      ".directory-page article.card .badge.bg-slate-100",
      'a[href^="tel:"]',
      'a[href^="mailto:"]',
    ]) {
      expect(light).toContain(item);
    }
    expect(directory).toContain("var(--app-ui-accent-outline");
  });

  it("keeps semantic Upload statuses readable and theme colors scoped", () => {
    for (const fg of ["#086a82", "#13765c", "#bd3650"]) {
      expect(contrast(fg, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
    expect(light).not.toContain(".app-theme-dark:not(");
    expect(light).not.toContain(".notification-card--urgent");
    expect(light).not.toContain(".drive-item-icon--pdf");
    expect([...light].reduce((n, char) => n + (char === "{") - (char === "}"), 0)).toBe(0);
  });
});
