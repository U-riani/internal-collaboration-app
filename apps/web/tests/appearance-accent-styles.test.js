import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static regression checks: Indigo must keep the original approved gradients.
// Other accents should inherit a single palette without replacing status colors.
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/account-page.css", import.meta.url), "utf8");
const tasks = readFileSync(new URL("../src/pages/tasks-page.css", import.meta.url), "utf8");
const messages = readFileSync(new URL("../src/pages/messages-theme.css", import.meta.url), "utf8");
const approvals = readFileSync(new URL("../src/pages/approvals-page.css", import.meta.url), "utf8");

describe("Incremental shared accent styling", () => {
  it("only defines legacy gradient overrides for non-default accents", () => {
    expect(theme).toContain('--app-primary: #6366f1;');
    expect(theme).toContain(
      '.app-theme-dark:is([data-accent="cyan"], [data-accent="violet"], [data-accent="sky"]) {',
    );
    expect(theme).toContain("--app-ui-accent-start: var(--app-accent-gradient-start);");
    expect(theme).toContain("--app-ui-accent-label: var(--app-on-accent);");
    expect(theme).toContain("--app-ui-focus-ring: var(--app-focus-ring);");
    expect(theme).toContain("--app-success: #53d7b5;");
    expect(theme).toContain("--app-danger: #ff94a5;");
  });

  it("preserves Account's default tab and password gradients", () => {
    expect(account).toContain("var(--app-ui-accent-start, #8981ff)");
    expect(account).toContain("var(--app-ui-accent-end, #6c69ed)");
    expect(account).toContain("var(--app-ui-accent-label, #191845)");
    expect(account).toContain("var(--app-ui-accent-start, #8e83ff)");
    expect(account).toContain("var(--app-ui-accent-end, #706af0)");
  });

  it("preserves Tasks' original action, tab and focus styling", () => {
    expect(tasks).toContain("var(--app-ui-accent-start, #867afa)");
    expect(tasks).toContain("var(--app-ui-accent-end, #6465ef)");
    expect(tasks).toContain("var(--app-ui-accent-start, #8880ff)");
    expect(tasks).toContain("var(--app-ui-accent-end, #6f6af1)");
    expect(tasks).toContain("var(--app-ui-accent-label, #fff)");
    expect(tasks).toContain("var(--app-ui-focus-ring, #918bff)");
  });
  it("uses the selected accent for native dropdowns and their checkmarks", () => {
    expect(theme).toContain("--app-ui-accent-selected: var(--app-accent);");
    expect(theme).toContain("--app-ui-accent-selected-text: var(--app-on-accent);");
    expect(theme).toContain("background: var(--app-ui-accent-selected, #655ff1);");
    expect(theme).toContain("color: var(--app-ui-accent-selected-text, #f4f1ff);");
    expect(theme).toContain("color: var(--app-ui-accent-selected-text, #fff);");
  });

  it("recolors Tasks search, filter checkboxes, and form dropdown focus without changing Indigo", () => {
    expect(tasks).toContain("border-color: var(--app-ui-focus-ring, #817cf0)");
    expect(tasks).toContain("box-shadow: 0 0 0 2px var(--app-ui-accent-tint, #8077f621)");
    expect(tasks).toContain("background: var(--app-ui-accent-selected, #746dff)");
    expect(tasks).toContain("border-color: var(--app-ui-accent-selected, #746dff)");
    expect(tasks).toContain("border-bottom: 2px solid var(--app-ui-accent-selected-text, #fff)");
    expect(tasks).toContain("background: var(--app-ui-accent-tint, rgba(118, 109, 245, .13))");
    expect(tasks).toContain("border: 1px solid var(--app-ui-focus-ring, #7873ca) !important");
  });

  it("keeps Tasks Created from/to date focus to a single accent-colored border", () => {
    expect(tasks).toContain('.tasks-page .task-filter-dates input[type="date"].input:focus-visible');
    expect(tasks).toContain('border-color: var(--app-ui-focus-ring, #817cf0) !important');
    expect(tasks).toContain("outline: none !important;");
    expect(tasks).toContain("box-shadow: none !important;");
    expect(tasks).toContain("--tw-ring-shadow: 0 0 #0000 !important;");
    expect(tasks).toContain('input[type="date"]::-webkit-datetime-edit-month-field:focus');
    expect(tasks).toContain('input[type="date"]::-webkit-datetime-edit-day-field:focus');
    expect(tasks).toContain('input[type="date"]::-webkit-datetime-edit-year-field:focus');
    expect(tasks).toContain("background: var(--app-ui-accent-selected, #746dff);");
    expect(tasks).toContain("color: var(--app-ui-accent-selected-text, #fff);");
  });

  it("connects the Account notification toggle to the accent palette", () => {
    expect(account).toContain("accent-color: var(--app-ui-accent-selected, #827aff)");
  });

  it("reuses accents across Messages without changing outgoing bubble defaults", () => {
    expect(messages).toContain("var(--app-ui-accent-start, #8077ff)");
    expect(messages).toContain("var(--app-ui-accent-end, #5755e8)");
    expect(messages).toContain("var(--app-ui-focus-ring, #7670dd)");
    expect(messages).toContain("var(--app-ui-accent-tint, #7670dd22)");
    expect(messages).toContain("var(--app-ui-focus-ring, #8279ff)");
    expect(messages).toContain("var(--app-ui-accent-start, #8279ff)");
    expect(messages).toContain("var(--app-ui-accent-end, #6e63ee)");
    expect(messages).toContain("var(--app-ui-accent-label, #fff)");
  });

  it("styles New Conversation inputs, selection, checkmarks and submit action with the shared palette", () => {
    expect(theme).toContain("--app-ui-selection-start: color-mix(");
    expect(theme).toContain("--app-ui-selection-hover: color-mix(");
    expect(messages).toContain("var(--app-ui-selection-start, #282b60)");
    expect(messages).toContain("var(--app-ui-selection-end, #222653)");
    expect(messages).toContain("var(--app-ui-selection-hover, #313574)");
    expect(messages).toContain("var(--app-ui-accent-selected, #6760eb)");
    expect(messages).toContain("var(--app-ui-focus-ring, #6663d9)");
    expect(messages).toContain("var(--app-ui-accent-start, #716cf6)");
    expect(messages).toContain("var(--app-ui-accent-end, #4b46d7)");
    expect(messages).toContain("var(--app-ui-accent-selected-hover, #7771ff)");
    // Unread and online-state colors must not be overwritten by account accents.
    expect(messages).toContain("background:#50c7de;");
    expect(messages).toContain("background: #204e65;");
  });


  it("keeps Approvals filters, dates and Request Types controls on the selected accent", () => {
    expect(approvals).toContain("border-color: var(--app-ui-focus-ring, #817cf0)");
    expect(approvals).toContain("box-shadow: 0 0 0 2px var(--app-ui-accent-tint, #8077f621)");
    expect(approvals).toContain("border-color: var(--app-ui-accent-outline, #817cf088)");
    expect(approvals).toContain("background: linear-gradient(110deg, var(--app-ui-accent-start, #867afa) 0%, var(--app-ui-accent-end, #6465ef) 100%)");
    expect(approvals).toContain("color: var(--app-ui-accent-label, #fff)");
    expect(approvals).toContain("background: var(--app-ui-accent-selected, #716bf4)");
    expect(approvals).toContain("border-color: var(--app-ui-accent-outline, #6c67b87a)");
  });

  it("recolors Approval Type and Request Details focus while preserving status semantics", () => {
    expect(approvals).toContain("border-color: var(--app-ui-focus-ring, #8078ed)");
    expect(approvals).toContain("box-shadow: 0 0 0 1px var(--app-ui-accent-tint, #8077f621)");
    expect(approvals).toContain("color: var(--app-ui-focus-ring, #8b85fd)");
    expect(approvals).toContain("outline: 2px solid var(--app-ui-focus-ring, #918bff)");
    // Green / red / neutral state meanings must not be replaced by user accents.
    expect(approvals).toContain("color: #6ad5ca;");
    expect(approvals).toContain("color: #ff9aa8;");
    expect(approvals).toContain("color: #96a0b8;");
  });


});
