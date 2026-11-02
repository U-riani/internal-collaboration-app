import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

const groupNotifications = (h, userId, conversationId) =>
  h.prisma.notification.findMany({
    where: {
      userId,
      type: "GROUP_MEMBER_ADDED",
      relatedEntityType: "CONVERSATION",
      relatedEntityId: conversationId,
    },
    orderBy: { createdAt: "desc" },
  });

test("new groups notify selected members, but not their creator", async () => {
  const h = await harness();
  try {
    const { employee, admin, manager } = h.users;
    const created = await h.call(employee, "POST", "/conversations", {
      type: "GROUP",
      name: "Release planning",
      memberIds: [admin.user.id, manager.user.id, admin.user.id],
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id;

    for (const recipient of [admin, manager]) {
      const records = await groupNotifications(h, recipient.user.id, id);
      assert.equal(records.length, 1, "one notification per invited member");
      assert.equal(records[0].title, "Added to a group");
      assert.match(records[0].body, /Release planning/);
      assert.match(records[0].body, new RegExp(employee.user.displayName));
      assert.equal(records[0].isRead, false);

      const listed = await h.call(recipient, "GET", "/notifications");
      assert.equal(listed.statusCode, 200, listed.body);
      const item = listed.json().data.find((entry) => entry.id === records[0].id);
      assert.equal(item?.targetUrl, `/chat?conversation=${id}`);
      assert.equal(listed.json().meta.unreadMessageCount, 1);
    }
    assert.equal((await groupNotifications(h, employee.user.id, id)).length, 0);

    const read = await h.call(admin, "POST", "/notifications/read-related", {
      entityType: "CONVERSATION",
      entityId: id,
    });
    assert.equal(read.statusCode, 200, read.body);
    assert.equal(read.json().data.count, 1);
    assert.equal((await groupNotifications(h, admin.user.id, id))[0].isRead, true);

    // A non-group conversation should not generate group membership activity.
    const project = await h.call(employee, "POST", "/conversations", {
      type: "PROJECT",
      name: "Another channel",
      memberIds: [admin.user.id],
    });
    assert.equal(project.statusCode, 201, project.body);
    assert.equal((await groupNotifications(h, admin.user.id, project.json().data.id)).length, 0);
  } finally {
    await h.close();
  }
});

test("adding, rejecting duplicates and rejoining an existing group", async () => {
  const h = await harness();
  try {
    const { employee, admin, manager } = h.users;
    const created = await h.call(employee, "POST", "/conversations", {
      type: "GROUP",
      name: "Operations",
      memberIds: [admin.user.id],
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id;
    const membersUrl = `/conversations/${id}/members`;

    const forbidden = await h.call(admin, "POST", membersUrl, {
      userId: manager.user.id,
    });
    assert.equal(forbidden.statusCode, 403, forbidden.body);
    assert.equal((await groupNotifications(h, manager.user.id, id)).length, 0);

    const added = await h.call(employee, "POST", membersUrl, {
      userId: manager.user.id,
    });
    assert.equal(added.statusCode, 200, added.body);
    assert.equal((await groupNotifications(h, manager.user.id, id)).length, 1);
    assert.equal((await groupNotifications(h, admin.user.id, id)).length, 1);
    assert.equal((await groupNotifications(h, employee.user.id, id)).length, 0);

    const duplicate = await h.call(employee, "POST", membersUrl, {
      userId: manager.user.id,
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);
    assert.equal((await groupNotifications(h, manager.user.id, id)).length, 1);

    const removed = await h.call(employee, "DELETE", `${membersUrl}/${manager.user.id}`);
    assert.equal(removed.statusCode, 200, removed.body);
    const removedNotifications = await h.call(manager, "GET", "/notifications");
    assert.equal(removedNotifications.statusCode, 200, removedNotifications.body);
    const oldItem = removedNotifications.json().data.find((item) =>
      item.type === "GROUP_MEMBER_ADDED" && item.relatedEntityId === id);
    assert.equal(oldItem?.targetUrl, null, "removed members cannot deep-link into a group");

    const rejoined = await h.call(employee, "POST", membersUrl, {
      userId: manager.user.id,
    });
    assert.equal(rejoined.statusCode, 200, rejoined.body);
    const records = await groupNotifications(h, manager.user.id, id);
    assert.equal(records.length, 2, "rejoining is a new membership event");
    assert.notEqual(records[0].deduplicationKey, records[1].deduplicationKey);
    const rejoinedNotifications = await h.call(manager, "GET", "/notifications");
    assert.equal(rejoinedNotifications.statusCode, 200, rejoinedNotifications.body);
    const items = rejoinedNotifications.json().data.filter((item) =>
      item.type === "GROUP_MEMBER_ADDED" && item.relatedEntityId === id);
    assert.equal(items.length, 2);
    assert.ok(items.every((item) => item.targetUrl === `/chat?conversation=${id}`));

    const direct = await h.call(employee, "POST", "/conversations", {
      type: "DIRECT",
      memberIds: [manager.user.id],
    });
    assert.equal(direct.statusCode, 201, direct.body);
    assert.equal((await groupNotifications(h, manager.user.id, direct.json().data.id)).length, 0);
  } finally {
    await h.close();
  }
});
