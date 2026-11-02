import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const auditPage = read("../src/pages/AuditPage.jsx");
const auditCss = read("../src/pages/audit-page.css");
const header = read("../src/components/PageHeader.jsx");
const layout = read("../src/components/Layout.jsx");
const tasksCss = read("../src/pages/tasks-page.css");

describe("Audit & Diagnostics — shared static header and theme-aware focus regressions", () => {
  it("uses the same non-sticky PageHeader layout as People and Tasks", () => {
    expect(auditPage).toContain('<PageHeader title="Audit & Diagnostics"');
    expect(header).toContain("page-header sticky"); // Shared primitive, locally overridden.
    expect(tasksCss).toMatch(/\.tasks-page \.page-header\s*\{[^}]*position: relative;[^}]*top: auto;/s);
    expect(auditCss).toMatch(/\.app-theme-dark \.audit-page > \.page-header\s*\{[^}]*position: relative;[^}]*top: auto;[^}]*background: transparent;[^}]*box-shadow: none;/s);
    expect(auditCss).toContain("font-size: var(--app-text-heading, clamp(26px, 2.1vw, 34px));");
    expect(auditCss).toContain("padding: 25px 0 22px;");
    expect(auditCss).toContain("padding-top: 18px;");
  });

  it("never adds scroll listeners, a floating surface, or a special sticky offset", () => {
    expect(auditPage).not.toContain("data-header-scrolled");
    expect(auditPage).not.toContain("syncHeader");
    expect(auditCss).not.toContain('data-header-scrolled="true"');
    expect(auditCss).not.toContain("backdrop-filter: blur(16px)");
    expect(auditCss).not.toContain("top: 64px;");
    expect(layout).toContain("workspace-mobile-header sticky top-0");
  });

  it("keeps native select and date controls, without the stacked Tailwind focus ring", () => {
    expect(auditPage).toContain('className="input app-modern-select"');
    expect(auditPage).toContain('type="date"');
    expect(auditCss).toContain('select.input.app-modern-select, input.input[type="date"]');
    expect(auditCss).toMatch(/:focus\s*\{[^}]*box-shadow: none;[^}]*--tw-ring-shadow: 0 0 #0000;/s);
    expect(auditCss).toMatch(/:focus-visible\s*\{[^}]*outline: 1px solid var\(--app-ui-focus-ring\);/s);
    expect(auditCss).toContain('.app-theme-dark[data-appearance="light"] .audit-page');
    expect(auditCss).toContain("color-scheme: light;");
    expect(auditCss).toContain("color-scheme: dark;");
  });

  it("scopes keyboard focus and responsive chrome to Audit without changing shared global controls", () => {
    expect(auditCss).toContain(".app-theme-dark .audit-page :is(button, .audit-technical summary):focus-visible");
    expect(auditCss).toContain(".app-theme-dark .audit-page .audit-search:focus-within");
    expect(auditCss).toContain("@media (max-width: 700px)");
    expect([...auditCss].reduce((n, c) => n + (c === "{") - (c === "}"), 0)).toBe(0);
  });
});
