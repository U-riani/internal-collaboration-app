import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static regression checks: Indigo must keep the original approved gradients.
// Other accents should inherit a single palette without replacing status colors.
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/account-page.css", import.meta.url), "utf8");
const tasks = readFileSync(new URL("../src/pages/tasks-page.css", import.meta.url), "utf8");

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

  it("connects the Account notification toggle to the accent palette", () => {
    expect(account).toContain("accent-color: var(--app-ui-accent-selected, #827aff)");
  });

});
