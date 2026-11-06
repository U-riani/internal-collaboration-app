import { describe, expect, it } from "vitest";
import { canGroupMessages, getMessageGroupPosition } from "../src/lib/message-grouping.js";

const message = (id, senderId, timestamp) => ({ id, senderId, createdAt: timestamp });

describe("compact Messages grouping", () => {
  const items = [
    message("a", "one", "2026-11-06T10:00:00Z"),
    message("b", "one", "2026-11-06T10:02:00Z"),
    message("c", "one", "2026-11-06T10:03:00Z"),
    message("d", "two", "2026-11-06T10:03:30Z"),
  ];

  it("groups consecutive messages by the same sender inside five minutes", () => {
    expect(getMessageGroupPosition(items, 0)).toEqual({ startsGroup: true, endsGroup: false });
    expect(getMessageGroupPosition(items, 1)).toEqual({ startsGroup: false, endsGroup: false });
    expect(getMessageGroupPosition(items, 2)).toEqual({ startsGroup: false, endsGroup: true });
    expect(getMessageGroupPosition(items, 3)).toEqual({ startsGroup: true, endsGroup: true });
  });

  it("breaks groups on author changes, pauses over five minutes and day changes", () => {
    expect(canGroupMessages(items[2], items[3])).toBe(false);
    expect(canGroupMessages(items[0], message("late", "one", "2026-11-06T10:05:01Z"))).toBe(false);
    expect(canGroupMessages(message("night", "one", "2026-11-06T23:59:50"), message("morning", "one", "2026-11-07T00:00:02"))).toBe(false);
    expect(canGroupMessages(items[1], items[0])).toBe(false);
  });

  it("starts a new group at the unread divider even with the same sender", () => {
    expect(getMessageGroupPosition(items, 1, "b")).toEqual({ startsGroup: true, endsGroup: false });
    expect(getMessageGroupPosition(items, 0, "b")).toEqual({ startsGroup: true, endsGroup: true });
  });

  it("does not group invalid dates", () => {
    expect(canGroupMessages(message("bad", "one", "invalid"), items[0])).toBe(false);
  });
});
