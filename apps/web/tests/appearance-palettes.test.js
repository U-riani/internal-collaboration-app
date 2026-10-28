import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const palette = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/Layout.jsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");

describe("Dark workspace appearance palettes", () => {
  it("has two scoped palettes and leaves Midnight CSS untouched", () => {
    expect(palette).toContain('.app-theme-dark[data-appearance="oled"]');
    expect(palette).toContain('.app-theme-dark[data-appearance="slate"]');
    expect(palette).toContain('--app-bg: #000000;');
    expect(palette).toContain('--app-bg: #171b23;');
    expect(theme).toContain('--app-bg: #0a0f1d;');
    expect(palette).not.toContain('[data-appearance="midnight"]');
    expect(palette).not.toContain('data-appearance="system"');
    expect([...palette].reduce((n, char) => n + (char === "{") - (char === "}"), 0)).toBe(0);
  });

  it("applies theme without replacing Layout or adding a new global Provider", () => {
    expect(layout).toContain('data-appearance={appearance}');
    expect(layout).toContain('data-accent={accent}');
    expect(layout).toContain('data-theme="dark"');
    expect(layout).toContain('window.addEventListener(THEME_EVENT, onThemeChange)');
    expect(layout).not.toContain('AppearanceProvider');
  });

  it("covers workspace surfaces, modals and main functional modules", () => {
    for (const selector of [
      '.tasks-page',
      '.account-page',
      '.messages-page',
      '.messages-page .chat-sidebar',
      '.new-conversation-dialog',
      '.new-conversation-name-field',
      '.task-detail',
      '.approval-detail',
      '.drive-page',
      '.drive-page .drive-directory-list',
      'dialog.modal:has(.drive-upload-modal)',
      '.modal:has(> .modal-body > .approval-detail)',
      '.overview-hero',
      '.overview-panel',
    ]) {
      expect(palette).toContain(selector);
    }
    expect(palette).not.toContain('status-approved {');
    expect(palette).not.toContain('notification-unread-dot {');
    expect(palette).not.toContain('drive-item-icon--pdf {');
  });

  it("offers three working dark radios and keeps System Sync disabled", () => {
    expect(account).toContain('...THEME_OPTIONS, { id: "system", label: "System Sync" }');
    expect(account).toContain('disabled={!available}');
    expect(account).toContain('saveThemePreference(userId, nextTheme)');
  });
});
