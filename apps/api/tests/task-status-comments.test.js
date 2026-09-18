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

test("assignee can change status and task comments notify other stakeholders", async () => {
  const { admin, manager, employee } = h.users;

  const task = ok(
    await h.call(admin, "POST", "/tasks", {
      title: "Status and comment notification test",
      assigneeId: employee.user.id,
      participantIds: [manager.user.id],
    }),
    201,
  );

  const updated = ok(
    await h.call(employee, "PATCH", `/tasks/${task.id}`, {
      status: "IN_PROGRESS",
    }),
  );
  assert.equal(updated.status, "IN_PROGRESS");

  const comment = ok(
    await h.call(employee, "POST", `/tasks/${task.id}/comments`, {
      content: "I started working on this task.",
    }),
    201,
  );
  assert.equal(comment.author.id, employee.user.id);

  const notifications = await h.prisma.notification.findMany({
    where: {
      type: "TASK_COMMENT",
      relatedEntityType: "TASK",
      relatedEntityId: task.id,
    },
    orderBy: { userId: "asc" },
  });

  const recipientIds = notifications.map((notification) => notification.userId);
  assert.deepEqual(
    recipientIds.sort(),
    [admin.user.id, manager.user.id].sort(),
  );
  assert.ok(!recipientIds.includes(employee.user.id));
  assert.equal(notifications.length, 2);
  assert.ok(
    notifications.every(
      (notification) =>
        notification.title ===
        'New comment on "Status and comment notification test"',
    ),
  );

  const adminInbox = ok(await h.call(admin, "GET", "/notifications"));
  const linked = adminInbox.find(
    (notification) =>
      notification.type === "TASK_COMMENT" &&
      notification.relatedEntityId === task.id,
  );
  assert.equal(linked.targetUrl, `/tasks?task=${task.id}`);
});
