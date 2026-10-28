// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCENT_EVENT,
  accentStorageKey,
  getAccentPreference,
  saveAccentPreference,
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
});
