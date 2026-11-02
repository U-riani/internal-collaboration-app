import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const auditPage = read("../src/pages/AuditPage.jsx");
const auditCss = read("../src/pages/audit-page.css");
const header = read("../src/components/PageHeader.jsx");
const layout = read("../src/components/Layout.jsx");

describe("Audit & Diagnostics — sticky header and theme-aware focus regressions", () => {
  it("reuses the shared sticky header with no divider or painted panel at rest", () => {
    expect(auditPage).toContain('<PageHeader title="Audit & Diagnostics"');
    expect(header).toContain("page-header sticky");
    expect(auditCss).toMatch(/\.app-theme-dark \.audit-page > \.page-header\s*\{[^}]*position: sticky;[^}]*top: 0;[^}]*z-index: 25;[^}]*background: transparent;[^}]*border: 0;[^}]*box-shadow: none;/s);
    expect(auditCss).toContain("overflow: visible;");
    expect(layout).toContain("workspace-mobile-header sticky top-0");
    expect(auditCss).toMatch(/@media \(max-width: 900px\)\s*\{[^}]*\.app-theme-dark \.audit-page > \.page-header\s*\{[^}]*top: 64px;/s);
  });

  it("only protects the header surface when the workspace actually scrolls", () => {
    expect(auditPage).toContain('data-header-scrolled={headerScrolled ? "true" : "false"}');
    expect(auditPage).toContain('main?.addEventListener("scroll", syncHeader');
    expect(auditPage).toContain('window.addEventListener("scroll", syncHeader');
    expect(auditPage).toContain('main?.removeEventListener("scroll", syncHeader)');
    expect(auditPage).toContain('window.removeEventListener("scroll", syncHeader)');
    expect(auditCss).toMatch(/\.app-theme-dark \.audit-page\[data-header-scrolled="true"\] > \.page-header\s*\{[^}]*background: color-mix\(in srgb, var\(--app-bg\) 98%, transparent\);[^}]*backdrop-filter: blur\(16px\);/s);
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
