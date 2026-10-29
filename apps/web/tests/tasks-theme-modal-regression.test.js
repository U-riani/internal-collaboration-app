import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_OPTIONS, ACCENT_OPTIONS } from "../src/lib/appearance.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../src/pages/TasksPage.jsx");
const css = read("../src/pages/tasks-page.css");
const modal = read("../src/components/UI.jsx");
const theme = read("../src/theme.css");
const light = read("../src/light-theme.css");
const palettes = read("../src/appearance-palettes.css");

describe("Tasks modal behavior and themed controls", () => {
  it("opens the filter in the shared native dialog instead of a nonmodal floating div", () => {
    expect(page).toContain('{filtersOpen && (\n              <Modal');
    expect(page).toContain('title="Filter tasks"');
    expect(page).toContain('className="task-filter-panel"');
    expect(page).toContain('onClose={() => setFiltersOpen(false)}');
    expect(page).toContain('onClick={() => setFiltersOpen(false)}');
    expect(page).not.toContain('<div className="task-filter-panel fixed');
    expect(modal).toContain("d.showModal()");
    expect(modal).toContain("onCancel={onClose}");
    expect(modal).toContain('aria-label="Close dialog"');
    expect(modal).toContain("onClick={onClose}");
    expect(modal).toContain('className = ""');
    expect(css).toContain(".tasks-page .modal[open].task-filter-panel");
    expect(css).toContain(".tasks-page .modal.task-filter-panel .modal-body");
    expect(css).toContain("overflow-y: auto;");
    expect(theme).toContain(".app-theme-dark .modal::backdrop");
    expect(read("../src/styles.css")).toContain("backdrop-filter: blur(3px)");
  });

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "uses the shared appearance palette for New Subtask in %s",
    () => {
      expect(page).toContain('title={existing ? "Edit task" : parentTask ? "New subtask" : "New task"}');
      expect(page).toContain("task-form-parent");
      expect(page).toContain("task-form-parent-title");
      expect(page).not.toContain('className="mb-4 rounded-xl bg-slate-50');
      for (const token of [
        "--task-text: var(--app-text-strong)",
        "--task-muted: var(--app-muted)",
        "--task-control: var(--app-surface-input)",
        "--task-surface: var(--app-surface)",
        "--task-surface-raised: var(--app-surface-raised)",
      ]) expect(css).toContain(token);
      expect(css).toContain("background: var(--task-surface-raised);");
      expect(css).toContain(".task-form .task-form-date");
      expect(light).toContain('.app-theme-dark[data-appearance="light"] .task-form');
      expect(palettes).toContain('[data-appearance="oled"]');
      expect(palettes).toContain('[data-appearance="slate"]');
      expect(page).toContain('onClose={() => setCreateSubtask(false)}');
    },
  );

  it.each(ACCENT_OPTIONS.map(({ id }) => [id]))(
    "uses global icon accent tokens rather than fixed blue decorations (%s)",
    () => {
      expect(theme).toContain("--app-icon-muted: var(--app-muted)");
      expect(theme).toContain("--app-icon-accent: var(--app-focus-ring)");
      expect(theme).toContain("--app-icon-soft-bg: var(--app-accent-soft)");
      expect(css).toContain("var(--app-icon-accent");
      expect(css).toContain("var(--app-icon-soft-bg");
      expect(css).not.toContain("background: #233b57;\n  color: #8baefe;");
    },
  );

  it("preserves filter selections and task/subtask save paths", () => {
    expect(page).toContain("checked={advancedFilters.statuses.includes(status)}");
    expect(page).toContain('toggleAdvancedValue("statuses", status)');
    expect(page).toContain('onClick={clearAdvancedFilters}');
    expect(page).toContain('onClick={() => setFiltersOpen(false)}');
    expect(page).toContain("parentTaskId: existing ? undefined : parentTask?.id || null");
    expect(page).toContain('parentTask\n                ? "Save subtask"');
  });
});
