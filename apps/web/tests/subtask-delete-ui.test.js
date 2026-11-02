import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_OPTIONS, ACCENT_OPTIONS } from "../src/lib/appearance.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../src/pages/TasksPage.jsx");
const css = read("../src/pages/tasks-page.css");

describe("Subtask deletion UI", () => {
  it("requires confirmation and refreshes the parent list after success", () => {
    expect(page).toContain('className="task-detail-subtask-delete"');
    expect(page).toContain('aria-label={`Delete subtask ${subtask.title}`}');
    expect(page).toContain('title="Delete subtask"');
    expect(page).toContain('title="Delete subtask"\n              className="task-subtask-delete-dialog"');
    expect(page).toContain('This action cannot be undone.');
    expect(page).toContain('api(`/tasks/${subtaskId}`, { method: "DELETE" })');
    expect(page).toContain('qc.invalidateQueries({ queryKey: ["task", id] });');
    expect(page).toContain('disabled={deleteSubtask.isPending}');
    expect(page).toContain('setSubtaskToDelete(null)');
  });

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "uses the common modal surface for the %s theme",
    () => {
      expect(css).toContain(".modal.task-subtask-delete-dialog");
      expect(css).toContain("var(--app-surface");
      expect(css).toContain("var(--app-border");
      expect(css).toContain("var(--app-text");
    },
  );

  it.each(ACCENT_OPTIONS.map(({ id }) => [id]))(
    "colors the trash action with palette-derived accent tokens in %s",
    () => {
      expect(css).toContain(".task-detail .task-detail-subtask-delete:hover");
      expect(css).toContain("var(--app-icon-muted");
      expect(css).toContain("var(--app-icon-accent");
      expect(css).toContain("var(--app-icon-soft-bg");
      expect(css).toContain("var(--app-ui-accent-selected");
    },
  );
});
