import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENT_OPTIONS, THEME_OPTIONS } from "../src/lib/appearance.js";

const load = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const approvals = load("../src/pages/ApprovalsPage.jsx");
const bases = load("../src/pages/ApprovalBasesPage.jsx");
const css = load("../src/pages/approvals-page.css");
const baseCss = load("../src/pages/approval-bases-page.css");
const modal = load("../src/components/UI.jsx");
const theme = load("../src/theme.css");
const light = load("../src/light-theme.css");
const messages = load("../src/pages/ChatPage.jsx");

describe("Approvals and Approval Bases shared filters", () => {
  it("uses one native dialog pattern with native backdrop and working X/Escape", () => {
    expect(approvals).toContain('className="task-filter-panel approval-filter-panel"');
    expect(approvals).toContain('title="Filter approvals"');
    expect(approvals).toContain("onClose={() => setFiltersOpen(false)}");
    expect(bases).toContain('className="task-filter-panel approval-filter-panel approval-bases-filter-panel"');
    expect(bases).toContain('title="Filter approval base"');
    expect(bases).toContain("onClose={() => setFiltersOpen(false)}");
    expect(approvals).not.toContain('<div className="approval-filter-panel task-filter-panel fixed');
    expect(bases).not.toContain('<div className="approval-filter-panel task-filter-panel approval-bases-filter-panel fixed');
    expect(modal).toContain("d.showModal()");
    expect(modal).toContain("onCancel={onClose}");
    expect(modal).toContain("onClick={onClose}");
    expect(load("../src/styles.css")).toContain("backdrop-filter: blur(3px)");
  });

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "binds Request Types and Details to shared surface tokens in %s",
    () => {
      expect(css).toContain("--task-control: var(--app-surface-input)");
      expect(css).toContain("--task-hover: var(--app-surface-hover)");
      expect(css).toContain(".app-theme-dark .approval-type-row:hover");
      expect(css).toContain("border-color: var(--app-border-strong)");
      expect(css).toContain("background: var(--app-surface-hover)");
      expect(css).toContain(".app-theme-dark .approval-detail {");
      expect(css).toContain("--detail-panel: var(--app-surface-raised)");
      expect(css).toContain("--detail-control: var(--app-surface-input)");
      expect(css).toContain(".app-theme-dark .approval-detail .approval-detail-step-info");
      expect(light).not.toContain(".approval-detail-round, .approval-detail-step-info)");
      expect(approvals).toContain('className="task-detail approval-detail"');
    },
  );

  it.each(ACCENT_OPTIONS.map(({ id }) => [id]))(
    "uses the selected accent for focus and semantic action states (%s)",
    () => {
      expect(css).toContain("var(--app-focus-ring)");
      expect(css).toContain("var(--app-ui-accent-tint");
      expect(css).toContain("var(--app-danger)");
      expect(css).toContain("var(--app-success)");
      expect(css).toContain("color-mix(in srgb, var(--app-danger)");
      expect(css).toContain("color-mix(in srgb, var(--app-success)");
      expect(baseCss).toContain("background: var(--app-interactive-hover)");
      expect(baseCss).toContain("color: var(--app-interactive-hover-text)");
      expect(baseCss).toContain("border-color: var(--app-focus-ring)");
      expect(baseCss).not.toContain("border-color: #817cf088");
      expect(css).toContain(".approval-date-control:hover:not(:focus-within)");
    },
  );

  it("standardizes close buttons in shared and New Conversation dialogs", () => {
    expect(modal).toContain('className="icon-btn modal-close-btn"');
    expect(messages).toContain('className="new-conversation-close modal-close-btn"');
    expect(theme).toContain(
      ".app-theme-dark :is(.modal .modal-head, .new-conversation-dialog .new-conversation-header) > .modal-close-btn",
    );
    expect(theme).toContain("background: var(--app-surface-hover) !important");
    expect(theme).toContain("outline: 2px solid var(--app-focus-ring)");
  });

  it("keeps existing filters and request actions intact", () => {
    expect(approvals).toContain("onClick={clearAdvancedFilters}");
    expect(bases).toContain("onClick={clearFilters}");
    expect(approvals).toContain('onClick={() => setFiltersOpen(false)}');
    expect(bases).toContain('onClick={() => setFiltersOpen(false)}');
    expect(bases).toContain('onClick={() => navigate("/approvals")}');
    expect(approvals).toContain("changeStatus.mutate({");
  });
});
