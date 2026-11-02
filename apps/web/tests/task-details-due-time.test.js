import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prettyTime } from "../src/components/UI.jsx";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../src/pages/TasksPage.jsx");
const css = read("../src/pages/tasks-page.css");

describe("Task details due date and time", () => {
  it("formats the stored UTC timestamp in the viewer's local time using 24-hour hours and minutes", () => {
    const timestamp = "2026-11-02T13:30:00.000Z";
    const expected = new Date(timestamp).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    expect(prettyTime(timestamp)).toBe(expected);
    expect(prettyTime(null)).toBe("");
  });

  it("shows time only in Task Details and preserves existing list/board date summaries", () => {
    expect(page).toContain('<time className="task-detail-due-time" dateTime={task.dueDate}>');
    expect(page).toContain("{prettyTime(task.dueDate)}");
    expect(page).toContain("{prettyDate(task.dueDate)}");
    expect(page).toContain('type="datetime-local"');
    expect((page.match(/prettyTime\(task\.dueDate\)/g) || [])).toHaveLength(1);
  });

  it("keeps the clock readable on narrow cards and across themes", () => {
    expect(css).toContain(".task-detail .task-detail-due-time");
    expect(css).toContain("color: var(--detail-muted);");
    expect(css).toContain("white-space: nowrap;");
  });
});
