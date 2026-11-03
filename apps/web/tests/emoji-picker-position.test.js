import { describe, expect, it } from "vitest";
import { getEmojiMenuPosition } from "../src/lib/emoji-picker-position.js";

const viewport = { width: 1280, height: 800 };
const menuHeight = 360;

describe("Emoji picker positioning", () => {
  it("opens below a message near the chat header", () => {
    const position = getEmojiMenuPosition(
      { left: 80, right: 100, top: 95, bottom: 115 },
      menuHeight,
      viewport,
    );
    expect(position.placement).toBe("bottom");
    expect(position.top).toBe(123);
  });

  it("opens above a message near the composer", () => {
    const position = getEmojiMenuPosition(
      { left: 500, right: 525, top: 710, bottom: 730 },
      menuHeight,
      viewport,
    );
    expect(position.placement).toBe("top");
    expect(position.top).toBe(342);
  });

  it("aligns to the right for outgoing messages", () => {
    const position = getEmojiMenuPosition(
      { left: 1180, right: 1200, top: 440, bottom: 460 },
      menuHeight,
      viewport,
      "right",
    );
    expect(position.left).toBe(848);
  });

  it("fits narrow screens and keeps the menu within the viewport", () => {
    const narrow = { width: 300, height: 390 };
    const position = getEmojiMenuPosition(
      { left: 270, right: 290, top: 180, bottom: 204 },
      menuHeight,
      narrow,
      "right",
    );
    expect(position.width).toBe(276);
    expect(position.left).toBe(12);
    expect(position.top).toBeGreaterThanOrEqual(12);
    expect(position.top + Math.min(menuHeight, narrow.height - 24)).toBeLessThanOrEqual(378);
  });
});
