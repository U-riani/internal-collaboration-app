import { describe, expect, it, vi } from "vitest";
import {
  filterAvailableColleagues,
  toggleColleagueSelection,
  addSelectedColleagues,
} from "../src/lib/group-member-selection.js";

const users = [
  { id: "owner", displayName: "System Administrator", email: "sysadmin@example.com", status: "ACTIVE" },
  { id: "manager", displayName: "Demo Manager", email: "manager@example.com", status: "ACTIVE", jobTitle: "Manager" },
  { id: "employee", displayName: "Demo Employee", email: "employee@example.com", status: "ACTIVE" },
  { id: "inactive", displayName: "Former Colleague", email: "former@example.com", status: "INACTIVE" },
];
const members = [{ userId: "owner" }];

describe("Conversation Members colleague picker", () => {
  it("always excludes existing members and inactive users", () => {
    expect(filterAvailableColleagues(users, members).map((user) => user.id))
      .toEqual(["manager", "employee"]);
  });

  it("searches names, email and job title case-insensitively", () => {
    expect(filterAvailableColleagues(users, members, "  EMPLOYEE ").map((user) => user.id))
      .toEqual(["employee"]);
    expect(filterAvailableColleagues(users, members, "manager@example").map((user) => user.id))
      .toEqual(["manager"]);
    expect(filterAvailableColleagues(users, members, "manager").map((user) => user.id))
      .toEqual(["manager"]);
    expect(filterAvailableColleagues(users, members, "System")).toEqual([]);
  });

  it("toggles multiple independent selections without mutating prior state", () => {
    const first = toggleColleagueSelection([], "manager");
    const second = toggleColleagueSelection(first, "employee");
    const third = toggleColleagueSelection(second, "manager");
    expect(first).toEqual(["manager"]);
    expect(second).toEqual(["manager", "employee"]);
    expect(third).toEqual(["employee"]);
  });

  it("adds all selected users once through the existing endpoint", async () => {
    const addOne = vi.fn().mockResolvedValue(undefined);
    const result = await addSelectedColleagues(["manager", "employee", "manager"], addOne);
    expect(addOne.mock.calls).toEqual([["manager"], ["employee"]]);
    expect(result).toEqual({ addedIds: ["manager", "employee"], failed: [] });
  });

  it("reports failed users without discarding successful additions or blocking later ones", async () => {
    const addOne = vi.fn(async (id) => {
      if (id === "manager") throw new Error("Request denied");
    });
    const result = await addSelectedColleagues(["manager", "employee"], addOne);
    expect(result.addedIds).toEqual(["employee"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe("manager");
    expect(result.failed[0].error.message).toBe("Request denied");
    expect(addOne).toHaveBeenCalledTimes(2);
  });
});
