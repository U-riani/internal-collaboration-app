import { describe, expect, it, vi } from "vitest";
import {
  notificationSoundCategory,
  getNotificationSoundsEnabled,
  setNotificationSoundsEnabled,
  handleNotificationCreated,
  previewNotificationSound,
} from "../src/lib/notificationSounds.js";

describe("notification sounds", () => {
  it("routes every notification family to its own category", () => {
    for (const type of ["MESSAGE", "MESSAGE_REACTION", "MENTION"])
      expect(notificationSoundCategory(type)).toBe("messages");
    for (const type of ["TASK_ASSIGNED", "TASK_COMMENT", "TASK_UPDATED", "TASK_DUE", "TASK_OVERDUE"])
      expect(notificationSoundCategory(type)).toBe("tasks");
    for (const type of ["APPROVAL_PENDING", "APPROVAL_UPDATED"])
      expect(notificationSoundCategory(type)).toBe("approvals");
    expect(notificationSoundCategory("SYSTEM")).toBe("system");
    expect(notificationSoundCategory("UNKNOWN_FUTURE_TYPE")).toBe("system");
  });

  it("stores the preference per user and ignores notifications while muted", () => {
    localStorage.clear();
    expect(getNotificationSoundsEnabled("alpha")).toBe(true);
    setNotificationSoundsEnabled("alpha", false);
    expect(getNotificationSoundsEnabled("alpha")).toBe(false);
    expect(getNotificationSoundsEnabled("beta")).toBe(true);
    expect(handleNotificationCreated({ id: "muted-1", type: "MESSAGE" }, "alpha")).toBe(false);
  });

  it("plays only once per incoming notification, and gives each category its own notes", async () => {
    const notes = [];
    class FakeAudioContext {
      state = "running";
      currentTime = 10;
      destination = {};
      createOscillator() {
        return {
          frequency: { setValueAtTime: (frequency) => notes.push(frequency) },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        };
      }
      resume() { return Promise.resolve(); }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    setNotificationSoundsEnabled("recipient", true);
    const created = (id, type) => handleNotificationCreated({ id, type }, "recipient");
    expect(created("msg-1", "MESSAGE")).toBe(true);
    expect(notes).toEqual([880, 1174.66]);
    expect(created("msg-1", "MESSAGE")).toBe(false);
    expect(notes).toHaveLength(2);
    expect(created("task-1", "TASK_ASSIGNED")).toBe(true);
    expect(notes.slice(2)).toEqual([659.25, 783.99]);
    expect(created("approval-1", "APPROVAL_PENDING")).toBe(true);
    expect(notes.slice(4)).toEqual([523.25, 659.25, 783.99]);
    expect(created("system-1", "SYSTEM")).toBe(true);
    expect(notes.slice(7)).toEqual([587.33]);
    expect(await previewNotificationSound("messages")).toBe(true);
    expect(notes).toHaveLength(10);
    vi.unstubAllGlobals();
  });
});
