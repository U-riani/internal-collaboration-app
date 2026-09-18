import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

let h;

before(async () => {
  h = await harness();
});

after(async () => {
  if (h) await h.close();
});

function ok(result, status = 200) {
  assert.equal(result.statusCode, status, result.body);
  return result.json().data;
}

test("the same task can belong to different personal groups for different users", async () => {
  const { employee, admin } = h.users;

  const task = ok(
    await h.call(employee, "POST", "/tasks", {
      title: "Personal grouping isolation",
    }),
    201,
  );

  const employeeGroup = ok(
    await h.call(employee, "POST", "/tasks/groups", {
      name: "Employee focus",
    }),
    201,
  );

  ok(
    await h.call(employee, "PUT", `/tasks/${task.id}/layout`, {
      groupId: employeeGroup.id,
    }),
  );

  const adminGroupsBefore = ok(await h.call(admin, "GET", "/tasks/groups"));
  assert.ok(!adminGroupsBefore.some((group) => group.id === employeeGroup.id));

  let employeeTask = ok(
    await h.call(employee, "GET", `/tasks/${task.id}`),
  );
  let adminTask = ok(
    await h.call(admin, "GET", `/tasks/${task.id}`),
  );

  assert.equal(employeeTask.personalLayout.groupId, employeeGroup.id);
  assert.equal(adminTask.personalLayout, null);

  const adminGroup = ok(
    await h.call(admin, "POST", "/tasks/groups", {
      name: "Admin focus",
    }),
    201,
  );

  ok(
    await h.call(admin, "PUT", `/tasks/${task.id}/layout`, {
      groupId: adminGroup.id,
    }),
  );

  employeeTask = ok(
    await h.call(employee, "GET", `/tasks/${task.id}`),
  );
  adminTask = ok(
    await h.call(admin, "GET", `/tasks/${task.id}`),
  );

  assert.equal(employeeTask.personalLayout.groupId, employeeGroup.id);
  assert.equal(employeeTask.personalLayout.group.name, "Employee focus");
  assert.equal(adminTask.personalLayout.groupId, adminGroup.id);
  assert.equal(adminTask.personalLayout.group.name, "Admin focus");
});
