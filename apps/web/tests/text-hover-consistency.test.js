import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const tasks = read("../src/pages/TasksPage.jsx");
const tasksCss = read("../src/pages/tasks-page.css");
const overviewCss = read("../src/pages/dashboard.css");
const peopleCss = read("../src/pages/directory-page.css");
const basesCss = read("../src/pages/approval-bases-page.css");
const approvalsCss = read("../src/pages/approvals-page.css");
const driveCss = read("../src/components/DriveUploadModal.css");
const lightCss = read("../src/light-theme.css");
const chat = read("../src/pages/ChatPage.jsx");

describe("Consistent text hover behavior", () => {
  it("keeps task and subtask titles stable while retaining row interactions", () => {
    expect(tasksCss).not.toContain(".task-detail .task-detail-subtask-title:hover");
    expect(tasksCss).not.toContain(".task-detail .task-detail-file-label:hover");
    expect(tasksCss).toContain(".task-detail .task-detail-subtask-row:hover");
    expect(tasks).toContain("onClick={() => setChildId(subtask.id)}");
  });

  it("removes text-only hover color effects across modules", () => {
    expect(overviewCss).toContain(".overview-update-link:hover { background:");
    expect(overviewCss).not.toMatch(/\.overview-update-link:hover\s*\{[^}]*color:/);
    expect(peopleCss).not.toMatch(/a\[href\^="mailto:"\]:hover/);
    expect(basesCss).not.toContain(".approval-bases-active-filters button:hover");
    expect(approvalsCss).not.toContain(".approval-group-header > [draggable]:hover");
    expect(driveCss).not.toContain(".drive-upload-file-heading > button:hover");
    expect(lightCss).not.toMatch(/\.overview-update-link:hover\s*\{[^}]*color:/);
    expect(lightCss).not.toContain('.directory-page article.card :is(a[href^="tel:"], a[href^="mailto:"]):hover');
    expect(chat).not.toContain("hover:underline");
    expect(chat).not.toContain('className="hover:text-slate-700');
  });

  it("retains focus feedback and container/button hover states", () => {
    expect(peopleCss).toContain('a[href^="tel:"]:focus-visible');
    expect(tasksCss).toContain(".task-detail .task-detail-subtask-row:hover");
    expect(tasksCss).toContain(".task-detail .task-detail-subtask-delete:hover");
    expect(chat).toContain("onClick={() => onOpen({ message, type: \"read\" })}");
  });
});
