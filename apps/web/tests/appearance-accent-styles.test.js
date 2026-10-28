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
});
