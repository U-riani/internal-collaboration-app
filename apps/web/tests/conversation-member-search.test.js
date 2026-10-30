import { describe, expect, it } from "vitest";
import { filterConversationMembers } from "../src/lib/conversation-member-search.js";

const members = [
  { userId: "1", role: "OWNER", user: { displayName: "System Administrator" } },
  { userId: "2", role: "MEMBER", user: { displayName: "ანა   გიორგაძე" } },
  { userId: "3", role: "MEMBER", user: { displayName: "Luka Tsatsiashvili" } },
];

describe("conversation members local search", () => {
  it("shows all loaded members with an empty or whitespace-only query", () => {
    expect(filterConversationMembers(members, "")).toBe(members);
    expect(filterConversationMembers(members, "   ")).toBe(members);
  });

  it("matches first name, surname and mixed-case input", () => {
    expect(filterConversationMembers(members, "administrator").map((m) => m.userId)).toEqual(["1"]);
    expect(filterConversationMembers(members, "SYSTEM").map((m) => m.userId)).toEqual(["1"]);
    expect(filterConversationMembers(members, "Tsatsiashvili").map((m) => m.userId)).toEqual(["3"]);
  });

  it("matches Georgian names and normalizes extra spaces", () => {
    expect(filterConversationMembers(members, "გიორგაძე").map((m) => m.userId)).toEqual(["2"]);
    expect(filterConversationMembers(members, "  ანა გიორგაძე  ").map((m) => m.userId)).toEqual(["2"]);
  });

  it("shows no results without mutating the original member list", () => {
    expect(filterConversationMembers(members, "not in group")).toEqual([]);
    expect(members).toHaveLength(3);
  });
});
