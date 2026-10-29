import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const accountCss = readFileSync(new URL("../src/pages/account-page.css", import.meta.url), "utf8");
const accountPage = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../src/pages/AdminPage.jsx", import.meta.url), "utf8");
const auditPage = readFileSync(new URL("../src/pages/AuditPage.jsx", import.meta.url), "utf8");
const spreadsheet = readFileSync(new URL("../src/pages/SpreadsheetPage.jsx", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/lib/appearance.js", import.meta.url), "utf8");
const dark = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");

describe("Light Theme — phase 5: account, administration, audit and spreadsheet", () => {
  it("makes Light selectable while keeping Midnight/OLED/Slate untouched", () => {
    expect(preferences).toContain('{ id: "light", label: "Light Theme" }');
    expect(accountPage).toContain("THEME_OPTIONS.map(({ id, label }) => {");
    expect(dark).toContain("--app-bg: #0a0f1d;");
    expect(light).not.toContain('[data-appearance="midnight"]');
    expect(light).not.toContain('[data-appearance="oled"]');
    expect(light).not.toContain('[data-appearance="slate"]');
    expect(light).toContain('Phase 5A — My Account.');
    expect(light).toContain('Phase 5B — Administration and Audit.');
    expect(light).toContain('Phase 5C — Spreadsheet desktop wrapper.');
  });

  it("maps all My Account panels to shared surfaces without changing appearance previews", () => {
    for (const token of [
      "--account-page: var(--app-bg);",
      "--account-panel: var(--app-surface);",
      "--account-deep: var(--app-surface-input);",
      "--account-button: var(--app-surface-raised);",
      "--account-text: var(--app-text-strong);",
      "--account-border: var(--app-border-strong);",
    ]) {
      expect(light).toContain(token);
    }
    for (const selector of [
      ".account-hero",
      ".account-tab.is-active",
      ".account-settings-card",
      ".account-sound-preview.btn-secondary",
      ".account-push-warning",
      ".account-profile-input-wrap",
      ".account-password-field",
      ".account-security-card",
      ".account-appearance-theme.is-active",
      ".account-appearance-accent-option.is-selected",
    ]) {
      expect(light).toContain(selector);
    }
    // Midnight uses the default preview styling; the other palettes
    // explicitly override that preview to depict their own appearance.
    expect(accountCss).toContain(".account-appearance-theme-preview {");
    for (const preview of ["preview-oled", "preview-slate", "preview-light"]) {
      expect(accountCss).toContain(preview);
    }
    expect(light).not.toContain(".account-appearance-theme-preview.preview-midnight");
    expect(light).not.toContain(".account-appearance-theme-preview.preview-oled");
    expect(light).not.toContain(".account-appearance-theme-preview.preview-slate");
    expect(light).not.toContain(".account-appearance-theme-preview.preview-light");
  });

  it("keeps Administration and Audit CSS scoped without changing authorization/data", () => {
    expect(adminPage).toContain('className="administration-page"');
    expect(adminPage).toContain('hasPermission("users.manage")');
    expect(adminPage).toContain("createUser.mutate()");
    expect(adminPage).toContain("updateUser.mutate()");
    expect(auditPage).toContain('className="audit-page"');
    expect(auditPage).toContain('hasPermission("system.audit.read")');
    expect(auditPage).toContain('queryFn: () => api("/audit").then((r) => r.data)');
    expect(auditPage).toContain('JSON.stringify(');
    for (const selector of [
      ".administration-page",
      ".audit-page",
      ".administration-page .form-actions",
      ".audit-page details",
      ".audit-page details pre",
    ]) {
      expect(light).toContain(selector);
    }
    expect(light).toContain("background: #fff0f2;");
    expect(light).toContain("color: #13765c;");
  });

  it("renders Univer light mode for Midnight and Light and dark for OLED/Slate only", () => {
    expect(spreadsheet).toContain('darkMode: !mobile && ["oled", "slate"].includes(getThemePreference(user.id)),');
    expect(spreadsheet).not.toContain('getThemePreference(user.id) !== "midnight"');
    expect(spreadsheet).toContain('createUniver({');
    expect(spreadsheet).toContain('runtime.univer.dispose()');
    expect(spreadsheet).toContain('snapshot: cloneSpreadsheetSnapshot(');
    expect(spreadsheet).toContain('className="workspace-spreadsheet-create mx-auto max-w-xl py-8"');
    expect(spreadsheet).toContain('className="spreadsheet-resize-backdrop fixed inset-0');
    expect(spreadsheet).toContain("workspace-spreadsheet flex h-[calc(100vh-9.1rem)]");
    expect(light).toContain(".workspace-spreadsheet-create");
    expect(light).toContain(".spreadsheet-resize-backdrop form .input");
    expect(light).toContain("Univer's own UI must not be re-themed");
  });

  it("maintains balanced CSS and accessible Light-only interaction foregrounds", () => {
    expect([...light].reduce((sum, ch) => sum + (ch === "{") - (ch === "}"), 0)).toBe(0);
    expect(light).toContain('color: var(--app-ui-accent-label);');
    expect(light).toContain('color: var(--app-text-strong);');
    expect(light).toContain('background: var(--app-surface-hover);');
    expect(light).not.toContain('.app-theme-dark:not([data-appearance="light"])');
  });
});
