import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_OPTIONS, ACCENT_OPTIONS } from "../src/lib/appearance.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../src/pages/TasksPage.jsx");
const css = read("../src/pages/tasks-page.css");

describe("Cancelled task checkbox behavior", () => {
  it("disables the completion toggle and displays an X for cancelled tasks and subtasks", () => {
    expect((page.match(/<CancelledCheckbox \/>/g) || [])).toHaveLength(2);
    expect(page).toContain('const cancelled = task.status === "CANCELLED";');
    expect(page).toContain('const cancelled = subtask.status === "CANCELLED";');
    expect(page).toContain('disabled={cancelled || updating || !canChangeStatus}');
    expect(page).toContain('cancelled || updateStatus.isPending || !canChangeSubtaskStatus');
    expect(page).toContain('if (task.status === "CANCELLED") return;');
    expect(page).toContain('if (cancelled) return;');
    expect(page).toContain("task-status-toggle--cancelled");
    expect(page).toContain('<X size={12} strokeWidth={2.5} />');
    expect(page).toContain('title={cancelled ? "Cancelled — change status in task details"');
  });

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "keeps the disabled X box visible in the %s appearance",
    () => {
      expect(css).toContain(".task-cancelled-checkbox");
      expect(css).toContain("border: 1.5px solid currentColor;");
      expect(css).toContain(".task-status-toggle--cancelled:disabled");
      expect(css).toContain("opacity: 1;");
    },
  );

  it.each(ACCENT_OPTIONS.map(({ id }) => [id]))(
    "uses palette tokens for the cancelled mark with accent %s",
    () => {
      expect(css).toContain("var(--app-icon-muted");
      expect(css).toContain("var(--app-surface-raised");
      expect(css).toContain(".task-detail .task-detail-subtask-toggle.task-status-toggle--cancelled:hover");
    },
  );
});
