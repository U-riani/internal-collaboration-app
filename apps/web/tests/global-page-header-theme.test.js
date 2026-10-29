import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_OPTIONS } from "../src/lib/appearance.js";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const pageHeader = read("../src/components/PageHeader.jsx");
const theme = read("../src/theme.css");
const light = read("../src/light-theme.css");
const palettes = read("../src/appearance-palettes.css");

const pages = [
  ["Messages", "ChatPage.jsx"],
  ["Drive", "DrivePage.jsx"],
  ["Tasks", "TasksPage.jsx"],
  ["Approvals", "ApprovalsPage.jsx"],
  ["Approval Bases", "ApprovalBasesPage.jsx"],
  ["Inbox", "NotificationsPage.jsx"],
  ["People", "DirectoryPage.jsx"],
  ["Administration", "AdminPage.jsx"],
  ["Audit", "AuditPage.jsx"],
];

function themeHeaderRule() {
  const start = theme.indexOf(".app-theme-dark .page-header {");
  expect(start).toBeGreaterThanOrEqual(0);
  return theme.slice(start, theme.indexOf("}", start) + 1);
}

describe("Global PageHeader canvas styling", () => {
  it("removes hardcoded white backgrounds and borders at the shared component", () => {
    const root = pageHeader.match(/className="page-header[^"]*"/)?.[0];
    expect(root).toBeDefined();
    expect(root).not.toContain("bg-white");
    expect(root).not.toContain("border-b");
    expect(root).not.toContain("border-slate-200");
    expect(pageHeader).toContain("{title}");
    expect(pageHeader).toContain("{description}");
    expect(pageHeader).toContain("{action}");
    expect(pageHeader).toContain("justify-between");
  });

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "inherits transparent, borderless header chrome in the %s theme",
    () => {
      const shared = themeHeaderRule();
      expect(shared).toContain("background: transparent;");
      expect(shared).toContain("border: 0;");
      expect(shared).toContain("box-shadow: none;");
      expect(light).not.toContain(
        '.app-theme-dark[data-appearance="light"] .page-header {',
      );
      expect(theme).not.toContain(
        ".app-theme-dark :is(.messages-page, .drive-page) > .page-header:first-child",
      );
      expect(theme).not.toContain(
        ".app-theme-dark .messages-page .page-header {",
      );
      expect(palettes).toContain(
        ':is(.page-header, .modal-head, .form-actions)',
      );
    },
  );

  it.each(pages)(
    "uses the same reusable PageHeader in the %s module",
    (_label, filename) => {
      const source = read(`../src/pages/${filename}`);
      expect(source).toContain('import PageHeader from "../components/PageHeader.jsx"');
      expect(source).toContain("<PageHeader");
    },
  );

  it("keeps module-specific layouts and other headers out of the shared rule", () => {
    expect(themeHeaderRule()).not.toContain("modal-head");
    expect(themeHeaderRule()).not.toContain("task-list-header");
    expect(themeHeaderRule()).not.toContain("workspace-mobile-header");
    expect(theme).toContain(".app-theme-dark .page-header h1 { color: var(--app-text-strong); }");
    expect(theme).toContain(".app-theme-dark .page-header p { color: var(--app-muted); }");
  });
});
