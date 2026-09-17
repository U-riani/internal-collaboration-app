import test from "node:test";
import assert from "node:assert/strict";
import {
  createRefreshToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../src/lib/security.js";
import { canAccessTask } from "../src/lib/task-access.js";

function user(id, roles = ["EMPLOYEE"], departmentId = "department-1") {
  return {
    id,
    departmentId,
    roles: roles.map((code) => ({
      role: {
        code,
        permissions:
          code === "MANAGER"
            ? [{ permission: { code: "tasks.manage_department" } }]
            : [],
      },
    })),
  };
}

test("refresh tokens are random and hashes are stable", () => {
  const first = createRefreshToken();
  const second = createRefreshToken();
  assert.notEqual(first, second);
  assert.equal(hashToken(first), hashToken(first));
  assert.notEqual(hashToken(first), hashToken(second));
});

test("password hashing verifies correct password only", async () => {
  const hash = await hashPassword("SecurePassword123!");
  assert.equal(await verifyPassword(hash, "SecurePassword123!"), true);
  assert.equal(await verifyPassword(hash, "WrongPassword123!"), false);
});

test("task access permits assignee and department manager but not unrelated employee", () => {
  const task = {
    creatorId: "creator",
    assigneeId: "assignee",
    departmentId: "department-1",
    participants: [],
  };
  assert.equal(canAccessTask(user("assignee"), task), true);
  assert.equal(canAccessTask(user("manager", ["MANAGER"]), task), true);
  assert.equal(canAccessTask(user("other"), task), false);
  assert.equal(canAccessTask(user("admin", ["SYSTEM_ADMIN"]), task), true);
});
