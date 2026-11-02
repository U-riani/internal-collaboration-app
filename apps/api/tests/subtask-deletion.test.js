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

test("only a subtask manager can delete, preserving the parent and audit trail", async () => {
  const { admin, employee } = h.users;
  const parent = ok(
    await h.call(admin, "POST", "/tasks", {
      title: "Parent stays after child deletion",
    }),
    201,
  );
  const subtask = ok(
    await h.call(admin, "POST", "/tasks", {
      title: "Accidentally created subtask",
      parentTaskId: parent.id,
      assigneeId: employee.user.id,
    }),
    201,
  );

  assert.equal(
    (await h.call(employee, "DELETE", `/tasks/${subtask.id}`)).statusCode,
    403,
    "being assigned to a subtask should not grant deletion rights",
  );
  assert.equal(
    (await h.call(admin, "DELETE", `/tasks/${parent.id}`)).statusCode,
    400,
    "the endpoint must not delete parent tasks",
  );

  const deleted = ok(await h.call(admin, "DELETE", `/tasks/${subtask.id}`));
  assert.deepEqual(deleted, { id: subtask.id, parentTaskId: parent.id });
  assert.equal(await h.prisma.task.count({ where: { id: subtask.id } }), 0);

  const remainingParent = ok(await h.call(admin, "GET", `/tasks/${parent.id}`));
  assert.equal(remainingParent.id, parent.id);
  assert.deepEqual(remainingParent.subtasks, []);
  assert.equal(remainingParent._count.subtasks, 0);
  assert.ok(remainingParent.history.some((entry) => entry.actionType === "SUBTASK_DELETED"));

  const audit = await h.prisma.auditLog.findFirst({
    where: { actionType: "SUBTASK_DELETED", entityId: subtask.id },
  });
  assert.equal(audit.actorId, admin.user.id);
  assert.equal(audit.beforeData.parentTaskId, parent.id);
  assert.equal(audit.beforeData.title, subtask.title);

  assert.equal(
    await h.prisma.notification.count({
      where: { relatedEntityType: "TASK", relatedEntityId: subtask.id },
    }),
    0,
    "notifications pointing at the deleted subtask must be removed",
  );
  assert.equal(
    (await h.call(admin, "DELETE", `/tasks/${subtask.id}`)).statusCode,
    404,
  );
});

test("a user can delete a subtask they created under an assigned parent task", async () => {
  const { admin, employee } = h.users;
  const parent = ok(
    await h.call(admin, "POST", "/tasks", {
      title: "Shared parent for employee-created subtask",
      assigneeId: employee.user.id,
    }),
    201,
  );
  const subtask = ok(
    await h.call(employee, "POST", "/tasks", {
      title: "Employee mistake",
      parentTaskId: parent.id,
    }),
    201,
  );

  ok(await h.call(employee, "DELETE", `/tasks/${subtask.id}`));
  assert.equal(await h.prisma.task.count({ where: { id: subtask.id } }), 0);
  assert.equal(await h.prisma.task.count({ where: { id: parent.id } }), 1);
});
