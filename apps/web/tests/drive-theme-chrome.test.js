import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_OPTIONS } from "../src/lib/appearance.js";

const driveCss = readFileSync(new URL("../src/pages/drive-personal.css", import.meta.url), "utf8");
const drivePage = readFileSync(new URL("../src/pages/DrivePage.jsx", import.meta.url), "utf8");
const messagesPage = readFileSync(new URL("../src/pages/ChatPage.jsx", import.meta.url), "utf8");
const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const palettes = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");

function rule(selector) {
  const start = driveCss.indexOf(`${selector} {`);
  expect(start, `Missing shared rule: ${selector}`).toBeGreaterThanOrEqual(0);
  return driveCss.slice(start, driveCss.indexOf("}", start) + 1);
}

describe("Drive header and directory footer across all workspace themes", () => {
  it("uses one directory footer for Personal, Shared, Shared with me and Trash", () => {
    expect(drivePage).toContain(
      'const unifiedDirectoryView = ["personal", "shared", "shared-with-me", "trash"].includes(section)',
    );
    expect(drivePage).toContain('"drive-directory-summary"');
    expect(drivePage).toContain('"drive-personal-summary"');
    expect(drivePage).toContain('"drive-shared-summary"');
    expect(drivePage).toContain('"drive-shared-with-me-summary"');
    expect(drivePage).toContain('"drive-trash-summary"');
  });

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "uses the shared theme palette for the directory footer (%s)",
    () => {
      const footer = rule(".drive-page .drive-directory-summary");
      expect(footer).toContain("background: var(--app-surface-raised");
      expect(footer).toContain("color: var(--app-muted");
      expect(footer).toContain("border: 1px solid var(--app-border");
      expect(footer).not.toContain("background: #101624");
      expect(footer).not.toContain("color: #99a7c4");
      expect(rule(".drive-page .drive-directory-summary::before"))
        .toContain("background: var(--app-secondary");
    },
  );

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "keeps the Drive header on the page canvas without a rectangular background (%s)",
    () => {
      const sharedHeader = theme.slice(
        theme.indexOf(".app-theme-dark .page-header {"),
      );
      expect(sharedHeader).toContain("background: transparent;");
      expect(sharedHeader).toContain("border: 0;");
      expect(sharedHeader).toContain("box-shadow: none;");
      expect(driveCss).not.toContain(".app-theme-dark .drive-page > .page-header:first-child");
      expect(drivePage).toContain('<PageHeader\n        title="Drive"');
      expect(theme).toContain(".app-theme-dark .page-header {");
      expect(light).not.toContain('.app-theme-dark[data-appearance="light"] .page-header {');
      expect(palettes).toContain(':is(.page-header, .modal-head, .form-actions)');
    },
  );

  it.each(THEME_OPTIONS.map(({ id }) => [id]))(
    "also renders the Messages header directly on the page background (%s)",
    () => {
      const sharedHeader = theme.slice(
        theme.indexOf(".app-theme-dark .page-header {"),
      );
      expect(sharedHeader).toContain("background: transparent;");
      expect(sharedHeader).toContain("border: 0;");
      expect(sharedHeader).toContain("box-shadow: none;");
      expect(messagesPage).toContain('<PageHeader\n        title="Messages"');
      expect(messagesPage).toContain("onClick={() => setNewChat(true)}");
      expect(light).not.toContain('.app-theme-dark[data-appearance="light"] .page-header {');
      expect(palettes).toContain(':is(.page-header, .modal-head, .form-actions)');
    },
  );

  it("does not change global PageHeader styling or section-specific file actions", () => {
    expect(driveCss).toContain(".drive-page .page-header-action");
    expect(drivePage).toContain("onUploaded={reload}");
    expect(drivePage).toContain("query.data?.meta.usedBytes");
    expect(driveCss).not.toContain("!important;\n  background: transparent;");
  });
});
