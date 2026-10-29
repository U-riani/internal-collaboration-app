import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const light = readFileSync(new URL("../src/light-theme.css", import.meta.url), "utf8");
const dark = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const palettes = readFileSync(new URL("../src/appearance-palettes.css", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/pages/dashboard.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/Layout.jsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/pages/AccountPage.jsx", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/lib/appearance.js", import.meta.url), "utf8");

const rgbLuminance = (hex) => {
  const rgb = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const [r, g, b] = rgb.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const contrast = (a, b) => {
  const x = rgbLuminance(a);
  const y = rgbLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("Light Theme — phase 2: Sidebar, Dashboard and shared components", () => {
  it("does not activate Light or alter any existing dark palette selectors", () => {
    expect(preferences).not.toContain('{ id: "light"');
    expect(account).toContain('const available = id !== "light"');
    expect(layout).toContain('data-appearance={appearance}');
    expect(palettes).toContain('.app-theme-dark[data-appearance="oled"]');
    expect(palettes).toContain('.app-theme-dark[data-appearance="slate"]');
    expect(dark).toContain('--app-bg: #0a0f1d;');
    expect(light).not.toContain('[data-appearance="midnight"]');
    expect(light).not.toContain('[data-appearance="oled"]');
    expect(light).not.toContain('[data-appearance="slate"]');
  });

  it("keeps active navigation gradient and foreground on hover", () => {
    const scope = '.app-theme-dark[data-appearance="light"]';
    expect(light).toContain(scope + ' .workspace-nav-link:not([aria-current="page"]):hover');
    expect(light).toContain(scope + ' .workspace-nav-link[aria-current="page"]:hover');
    expect(light).toContain('background: linear-gradient(112deg, var(--app-accent-gradient-start), var(--app-accent-gradient-end));');
    expect(light).toContain('color: var(--app-on-accent);');
    expect(light).toContain(scope + ' .workspace-nav-link[aria-current="page"] > span:first-of-type');
    expect(layout).toContain('className={({ isActive }) =>');
    expect(layout).toContain('workspace-nav-link flex items-center');
    // Keep unread badges on their own semantic red surface.
    expect(layout).toContain('rounded-full bg-red-500');
  });

  it("uses shared surfaces for the sidebar profile and reusable fields", () => {
    for (const selector of [
      '.sidebar-profile-card',
      '.sidebar-profile-identity .avatar',
      '.workspace-mobile-header .icon-btn:hover',
      '.card',
      '.modal',
      '.modal-head',
      '.input',
      '.btn-primary',
      '.btn-secondary',
      '.btn-danger',
      '.app-modern-select',
      '.attachment',
      '.status-completed',
      '.status-urgent',
      'table tbody tr:hover',
    ]) {
      expect(light).toContain(selector);
    }
    expect(light).toContain('--tw-ring-color: color-mix(in srgb, var(--app-focus-ring) 20%, transparent);');
    expect(light).toContain('background: var(--app-surface-hover);');
    expect(light).toContain('color: var(--app-text-strong);');
  });

  it("themes dashboard interior panels and keeps the existing responsive layout", () => {
    for (const selector of [
      '.overview-dashboard',
      '.overview-hero',
      '.overview-hero h1',
      '.overview-hero-date',
      '.overview-stat',
      '.overview-stat-number',
      '.overview-stat--cyan',
      '.overview-stat--coral',
      '.overview-stat--indigo',
      '.overview-stat--violet',
      '.overview-panel',
      '.overview-task-row:hover',
      '.overview-task-status',
      '.overview-shortcut-row:hover',
      '.overview-update-row:hover',
      '.overview-update-icon',
      '.overview-update-dot--read',
    ]) {
      expect(light).toContain(selector);
    }
    expect(dashboard).toContain('@media (max-width: 700px)');
    expect(dashboard).toContain('scroll-snap-type: x proximity;');
    expect(light).toContain('.overview-stats {');
  });

  it("maintains readable Light category badges and notification dates", () => {
    const pairs = [
      ["#075d76", "#dbf5fb"],
      ["#a42c43", "#fff0f2"],
      ["#4d43a9", "#efedff"],
      ["#7a3ba6", "#f6ebfd"],
      ["#0b6780", "#e2f6fa"],
      ["#13765c", "#dcf6eb"],
      ["#ae334c", "#ffe7ec"],
    ];
    for (const [fg, bg] of pairs) {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(light).toContain('.overview-update-dot--read');
    expect(light).toContain('background: #a4aebf;');
    expect(light).toContain('background: #0eafc5;');
  });

  it("keeps the new CSS syntactically balanced and Light-scoped", () => {
    expect([...light].reduce((n, c) => n + (c === "{") - (c === "}"), 0)).toBe(0);
    expect(light).toContain('Phase 2 — workspace navigation and shared primitives.');
    expect(light).toContain('Phase 2 — Dashboard.');
    expect(light).not.toContain('.app-theme-dark:not([data-appearance="light"])');
  });
});
