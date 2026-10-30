// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCENT_OPTIONS,
  THEME_OPTIONS,
  THEME_EVENT,
  getThemePreference,
  saveThemePreference,
  saveAccentPreference,
  themeStorageKey,
  accentStorageKey,
} from "../src/lib/appearance.js";

const dark = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/Layout.jsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/.{2}/g)
    .map((part) => parseInt(part, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return r * .2126 + g * .7152 + b * .0722;
}
function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
function splitSelectorList(selector) {
  let start = 0, paren = 0, quote = "";
  const selectors = [];
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (quote) {
      if (c === quote && selector[i - 1] !== "\\") quote = "";
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === "(") {
      paren++;
    } else if (c === ")") {
      paren--;
    } else if (c === "," && paren === 0) {
      selectors.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  selectors.push(selector.slice(start).trim());
  return selectors;
}

describe("Light Theme final activation", () => {
  it("provides four persisted themes and four independent accent colors", () => {
    expect(THEME_OPTIONS.map((entry) => entry.id)).toEqual(["midnight", "oled", "slate", "light"]);
    expect(ACCENT_OPTIONS.map((entry) => entry.id)).toEqual(["indigo", "cyan", "violet", "sky"]);
    expect(account).toContain("THEME_OPTIONS.map(({ id, label }) => {");
    expect(account).not.toContain("disabled={!available}");
    expect(account).not.toContain('const available = id !== "light"');
    expect(layout).toContain('data-theme={appearance === "light" ? "light" : "dark"}');
    expect(layout).toContain("data-appearance={appearance}");
    expect(layout).toContain("data-accent={accent}");
  });

  it("preserves per-user Light preference, accent and switching back to a dark theme", () => {
    window.localStorage.clear();
    const events = [];
    const listener = (event) => events.push(event.detail);
    window.addEventListener(THEME_EVENT, listener);
    try {
      for (const accent of ACCENT_OPTIONS) {
        expect(saveAccentPreference("person-a", accent.id)).toBe(true);
        expect(saveThemePreference("person-a", "light")).toBe(true);
        expect(getThemePreference("person-a")).toBe("light");
        expect(window.localStorage.getItem(accentStorageKey("person-a"))).toBe(accent.id);
      }
      expect(window.localStorage.getItem(themeStorageKey("person-a"))).toBe("light");
      expect(getThemePreference("person-b")).toBe("midnight");
      expect(saveThemePreference("person-a", "slate")).toBe(true);
      expect(getThemePreference("person-a")).toBe("slate");
      expect(saveThemePreference("person-a", "system")).toBe(false);
      expect(events.some((event) => event.userId === "person-a" && event.theme === "light")).toBe(true);
      expect(events.at(-1)).toEqual({ userId: "person-a", theme: "slate" });
    } finally {
      window.removeEventListener(THEME_EVENT, listener);
      window.localStorage.clear();
    }
  });

  it("preserves readable primary action gradient endpoints for all Light accents", () => {
    const matrix = [
      { id: "indigo", label: "#ffffff", start: "#5c55d7", end: "#514ac8" },
      { id: "cyan", label: "#092630", start: "#46cfe0", end: "#19adc4" },
      { id: "violet", label: "#261737", start: "#d3a0f2", end: "#a970db" },
      { id: "sky", label: "#17313a", start: "#afe7f3", end: "#80cde1" },
    ];
    expect(light).toContain("--app-primary: #5c55d7;");
    expect(light).toContain("--app-primary-hover: #514ac8;");
    expect(dark).toContain("--app-accent-gradient-start: var(--app-primary);");
    expect(dark).toContain("--app-accent-gradient-end: var(--app-primary-hover);");
    expect(light).toContain("--app-ui-accent-label: var(--app-on-accent);");
    for (const { id, label, start, end } of matrix) {
      if (id !== "indigo") {
        expect(dark).toContain(`--app-accent-gradient-start: ${start};`);
        expect(dark).toContain(`--app-accent-gradient-end: ${end};`);
        expect(dark).toContain(`--app-on-accent: ${label};`);
        expect(light).toContain(`[data-appearance="light"][data-accent="${id}"]`);
      }
      expect(contrast(label, start), `${id} gradient start`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(label, end), `${id} gradient end`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("scopes every Light CSS selector to its appearance or its body background", () => {
    const css = light.replace(/\/\*[\s\S]*?\*\//g, "");
    let buffer = "", depth = 0, rules = 0;
    const stack = [];
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (c === "{") {
        const selector = buffer.trim().split(";").at(-1).trim();
        if (selector.startsWith("@")) stack.push("at");
        else {
          stack.push("rule");
          rules++;
          for (const part of splitSelectorList(selector)) {
            expect(
              part.startsWith('.app-theme-dark[data-appearance="light"]') ||
              part.startsWith('body:has(.app-theme-dark[data-appearance="light"])'),
              `Unscoped Light rule: ${part}`,
            ).toBe(true);
          }
        }
        depth++;
        buffer = "";
      } else if (c === "}") {
        depth--;
        stack.pop();
        buffer = "";
      } else if (c === ";" && stack.at(-1) === "rule") {
        buffer = "";
      } else {
        buffer += c;
      }
    }
    expect(depth).toBe(0);
    expect(rules).toBeGreaterThan(400);
  });
});
