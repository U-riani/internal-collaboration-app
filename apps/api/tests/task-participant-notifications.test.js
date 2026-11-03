import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

const participantNotifications = (h, userId, taskId) =>
  h.prisma.notification.findMany({
    where: {
      userId,
      type: "TASK_UPDATED",
      title: "Added to task",
      relatedEntityType: "TASK",
      relatedEntityId: taskId,
    },
    orderBy: { createdAt: "desc" },
  });

const assignmentNotifications = (h, userId, taskId) =>
  h.prisma.notification.findMany({
    where: {
      userId,
      type: "TASK_ASSIGNED",
      relatedEntityType: "TASK",
      relatedEntityId: taskId,
    },
  });

function ok(response, status = 200) {
  assert.equal(response.statusCode, status, response.body);
  return response.json().data;
}

test("task creation notifies participants once, excluding creator and notified assignee", async () => {
  const h = await harness();
  try {
    const { admin, manager, employee } = h.users;
    const task = ok(
      await h.call(admin, "POST", "/tasks", {
        title: "Release checklist",
        assigneeId: employee.user.id,
        participantIds: [manager.user.id, employee.user.id, admin.user.id],
      }),
      201,
    );

    const managerAlerts = await participantNotifications(h, manager.user.id, task.id);
    assert.equal(managerAlerts.length, 1);
    assert.match(managerAlerts[0].body, /Release checklist/);
    assert.ok(managerAlerts[0].body.includes(admin.user.displayName));
    assert.equal(managerAlerts[0].isRead, false);

    const managerInbox = ok(await h.call(manager, "GET", "/notifications"));
    const linked = managerInbox.find((entry) => entry.id === managerAlerts[0].id);
    assert.equal(linked?.targetUrl, "/tasks?task=" + task.id);

    assert.equal((await participantNotifications(h, employee.user.id, task.id)).length, 0);
    assert.equal((await assignmentNotifications(h, employee.user.id, task.id)).length, 1);
    assert.equal((await participantNotifications(h, admin.user.id, task.id)).length, 0);
  } finally {
    await h.close();
  }
});

test("only newly added participants are notified on task edits and re-addition", async () => {
  const h = await harness();
  try {
    const { admin, manager, employee } = h.users;
    const task = ok(
      await h.call(admin, "POST", "/tasks", {
        title: "Operations follow-up",
        participantIds: [employee.user.id],
      }),
      201,
    );
    const url = "/tasks/" + task.id;
    assert.equal((await participantNotifications(h, employee.user.id, task.id)).length, 1);

    ok(await h.call(admin, "PATCH", url, { title: "Operations follow-up updated" }));
    ok(await h.call(admin, "PATCH", url, { participantIds: [employee.user.id] }));
    assert.equal((await participantNotifications(h, employee.user.id, task.id)).length, 1);
    assert.equal((await participantNotifications(h, manager.user.id, task.id)).length, 0);

    ok(await h.call(admin, "PATCH", url, {
      participantIds: [employee.user.id, manager.user.id],
    }));
    assert.equal((await participantNotifications(h, employee.user.id, task.id)).length, 1);
    const added = await participantNotifications(h, manager.user.id, task.id);
    assert.equal(added.length, 1);
    assert.match(added[0].body, /Operations follow-up updated/);

    ok(await h.call(admin, "PATCH", url, { participantIds: [manager.user.id] }));
    assert.equal((await participantNotifications(h, employee.user.id, task.id)).length, 1);
    assert.equal((await participantNotifications(h, manager.user.id, task.id)).length, 1);

    ok(await h.call(admin, "PATCH", url, {
      participantIds: [employee.user.id, manager.user.id],
    }));
    assert.equal((await participantNotifications(h, employee.user.id, task.id)).length, 2);
    assert.equal((await participantNotifications(h, manager.user.id, task.id)).length, 1);
  } finally {
    await h.close();
  }
});

test("simultaneous task reassignment and participant addition do not double-notify assignee", async () => {
  const h = await harness();
  try {
    const { admin, manager, employee } = h.users;
    const task = ok(
      await h.call(admin, "POST", "/tasks", {
        title: "Review handover",
      }),
      201,
    );

    ok(await h.call(admin, "PATCH", "/tasks/" + task.id, {
      assigneeId: manager.user.id,
      participantIds: [manager.user.id, employee.user.id],
    }));

    assert.equal((await assignmentNotifications(h, manager.user.id, task.id)).length, 1);
    assert.equal((await participantNotifications(h, manager.user.id, task.id)).length, 0);
    assert.equal((await participantNotifications(h, employee.user.id, task.id)).length, 1);
  } finally {
    await h.close();
  }
});
