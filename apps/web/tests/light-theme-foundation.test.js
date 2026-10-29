import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const palettes = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/Layout.jsx", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/lib/appearance.js", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255);
  const [r, g, b] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const aLum = luminance(a);
  const bLum = luminance(b);
  return (Math.max(aLum, bLum) + 0.05) / (Math.min(aLum, bLum) + 0.05);
}

describe("Light Theme foundation / phase 1", () => {
  it("is opt-in and leaves all three working dark themes unchanged", () => {
    expect(layout).toContain('import "../theme.css";');
    expect(layout).toContain('import "../appearance-palettes.css";');
    expect(layout).toContain('import "../light-theme.css";');
    expect(layout.indexOf('import "../light-theme.css";')).toBeGreaterThan(
      layout.indexOf('import "../appearance-palettes.css";'),
    );
    expect(layout).toContain('data-appearance={appearance}');
    expect(preferences).toContain('const DEFAULT_THEME = "midnight";');
    expect(preferences).not.toContain('{ id: "light"');
    expect(account).toContain('{ id: "system", label: "System Sync" }');
    expect(account).toContain("disabled={!available}");
    expect(palettes).toContain('.app-theme-dark[data-appearance="oled"]');
    expect(palettes).toContain('.app-theme-dark[data-appearance="slate"]');
    expect(light).not.toContain('[data-appearance="midnight"]');
    expect(light).not.toContain('[data-appearance="oled"]');
    expect(light).not.toContain('[data-appearance="slate"]');
  });

  it("defines a complete shared surface, text, interaction and accent token hierarchy", () => {
    for (const token of [
      "--app-bg:", "--app-sidebar:", "--app-surface:", "--app-surface-raised:",
      "--app-surface-hover:", "--app-surface-input:", "--app-border:",
      "--app-border-strong:", "--app-text:", "--app-text-strong:",
      "--app-muted:", "--app-subtle:", "--app-primary:", "--app-primary-hover:",
      "--app-primary-soft:", "--app-focus-ring:", "--app-interactive-hover:",
      "--app-interactive-hover-text:", "--app-interactive-focus:",
      "--app-ui-accent-start:", "--app-ui-accent-end:",
      "--app-ui-accent-selected-text:", "--palette-page:", "--palette-panel:",
      "--palette-input:", "--palette-selection:", "--palette-panel-gradient:",
    ]) {
      expect(light).toContain(token);
    }
    expect(light).toContain('color-scheme: light;');
    expect(light).toContain('body:has(.app-theme-dark[data-appearance="light"])');
    expect(light).toContain('.app-theme-dark[data-appearance="light"] > .workspace-main');
    expect(light).toContain('.app-theme-dark[data-appearance="light"] .modal::backdrop');
    expect(light).toContain('.app-theme-dark[data-appearance="light"] .app-modern-select option:checked');
    expect([...light].reduce((balance, char) => balance + (char === "{") - (char === "}"), 0)).toBe(0);
  });

  it("uses readable text on white cards and a contrasting default primary action", () => {
    for (const foreground of ["#314058", "#182335", "#59677b", "#68788d"]) {
      expect(contrastRatio(foreground, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio("#ffffff", "#5c55d7")).toBeGreaterThanOrEqual(4.5);
    expect(light).toContain('--app-danger: #bd3650;');
    expect(light).toContain('--app-success: #13765c;');
  });

  it("prepares all four existing accents with a visible focus ring on white", () => {
    for (const accent of ["cyan", "violet", "sky"]) {
      expect(light).toContain(`[data-appearance="light"][data-accent="${accent}"]`);
    }
    for (const focus of ["#5c55d7", "#0b7185", "#7b45a8", "#196b83"]) {
      expect(contrastRatio(focus, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
    expect(light).toContain('--app-ui-accent-selected-text: var(--app-on-accent);');
  });
});
