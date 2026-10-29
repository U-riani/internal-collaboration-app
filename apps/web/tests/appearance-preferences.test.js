// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCENT_EVENT,
  accentStorageKey,
  getAccentPreference,
  saveAccentPreference,
  THEME_EVENT,
  themeStorageKey,
  getThemePreference,
  saveThemePreference,
} from "../src/lib/appearance.js";

beforeEach(() => {
  window.localStorage.clear();
});

describe("appearance preferences", () => {
  it("defaults to Indigo, stores one account's accent and isolates other accounts", () => {
    expect(getAccentPreference("user-1")).toBe("indigo");
    expect(saveAccentPreference("user-1", "cyan")).toBe(true);
    expect(window.localStorage.getItem(accentStorageKey("user-1"))).toBe("cyan");
    expect(getAccentPreference("user-1")).toBe("cyan");
    expect(getAccentPreference("user-2")).toBe("indigo");
  });

  it("rejects unsupported accents without changing the stored choice", () => {
    expect(saveAccentPreference("user-1", "violet")).toBe(true);
    expect(saveAccentPreference("user-1", "not-a-theme")).toBe(false);
    expect(getAccentPreference("user-1")).toBe("violet");
  });

  it("notifies Layout when an accent changes", () => {
    const listener = vi.fn();
    window.addEventListener(ACCENT_EVENT, listener);
    try {
      expect(saveAccentPreference("user-1", "sky")).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].detail).toEqual({
        userId: "user-1",
        accent: "sky",
      });
    } finally {
      window.removeEventListener(ACCENT_EVENT, listener);
    }
  });
  it("defaults to Midnight and persists themes independently per account", () => {
    expect(getThemePreference("user-1")).toBe("midnight");
    expect(saveThemePreference("user-1", "oled")).toBe(true);
    expect(window.localStorage.getItem(themeStorageKey("user-1"))).toBe("oled");
    expect(getThemePreference("user-1")).toBe("oled");
    expect(getThemePreference("user-2")).toBe("midnight");
    expect(saveThemePreference("user-1", "slate")).toBe(true);
    expect(getThemePreference("user-1")).toBe("slate");
  });

  it("rejects unsupported Light and System Sync until rollout is complete", () => {
    expect(saveThemePreference("user-1", "oled")).toBe(true);
    expect(saveThemePreference("user-1", "system")).toBe(false);
    expect(saveThemePreference("user-1", "light")).toBe(false);
    expect(saveThemePreference("user-1", "invalid")).toBe(false);
    expect(getThemePreference("user-1")).toBe("oled");
    window.localStorage.setItem(themeStorageKey("user-2"), "invalid");
    expect(getThemePreference("user-2")).toBe("midnight");
  });

  it("broadcasts theme changes independently of the accent event", () => {
    const themeListener = vi.fn();
    const accentListener = vi.fn();
    window.addEventListener(THEME_EVENT, themeListener);
    window.addEventListener(ACCENT_EVENT, accentListener);
    try {
      expect(saveThemePreference("user-1", "slate")).toBe(true);
      expect(themeListener).toHaveBeenCalledTimes(1);
      expect(themeListener.mock.calls[0][0].detail).toEqual({
        userId: "user-1", theme: "slate",
      });
      expect(accentListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(THEME_EVENT, themeListener);
      window.removeEventListener(ACCENT_EVENT, accentListener);
    }
  });

});
