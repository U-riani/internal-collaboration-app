import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

test("only a GROUP creator can add and remove other members", async () => {
  const h = await harness();
  try {
    const { employee, admin, manager } = h.users;
    // Employee creates the group; System Administrator is only a member.
    const created = await h.call(employee, "POST", "/conversations", {
      type: "GROUP",
      name: "Creator-managed group",
      memberIds: [admin.user.id],
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id;
    const members = `/conversations/${id}/members`;

    const outsiderAdd = await h.call(manager, "POST", members, {
      userId: manager.user.id,
    });
    assert.equal(outsiderAdd.statusCode, 403, outsiderAdd.body);

    const adminAdd = await h.call(admin, "POST", members, {
      userId: manager.user.id,
    });
    assert.equal(adminAdd.statusCode, 403, adminAdd.body);

    const added = await h.call(employee, "POST", members, {
      userId: manager.user.id,
    });
    assert.equal(added.statusCode, 200, added.body);

    const duplicate = await h.call(employee, "POST", members, {
      userId: manager.user.id,
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);

    const listed = await h.call(employee, "GET", "/conversations");
    const group = listed.json().data.find((item) => item.id === id);
    assert.deepEqual(
      new Set(group.members.map((member) => member.userId)),
      new Set([employee.user.id, admin.user.id, manager.user.id]),
    );

    const nonCreatorRemove = await h.call(
      admin, "DELETE", `${members}/${manager.user.id}`,
    );
    assert.equal(nonCreatorRemove.statusCode, 403, nonCreatorRemove.body);

    const ownerRemove = await h.call(
      employee, "DELETE", `${members}/${employee.user.id}`,
    );
    assert.equal(ownerRemove.statusCode, 403, ownerRemove.body);

    const remove = await h.call(
      employee, "DELETE", `${members}/${admin.user.id}`,
    );
    assert.equal(remove.statusCode, 200, remove.body);

    const removedAccess = await h.call(
      admin, "GET", `/conversations/${id}/messages`,
    );
    assert.equal(removedAccess.statusCode, 403, removedAccess.body);

    const removeAgain = await h.call(
      employee, "DELETE", `${members}/${admin.user.id}`,
    );
    assert.equal(removeAgain.statusCode, 404, removeAgain.body);

    const rejoined = await h.call(employee, "POST", members, {
      userId: admin.user.id,
    });
    assert.equal(rejoined.statusCode, 200, rejoined.body);

    const restoredAccess = await h.call(
      admin, "GET", `/conversations/${id}/messages`,
    );
    assert.equal(restoredAccess.statusCode, 200, restoredAccess.body);

    // Existing Leave Group behavior stays accessible to regular members.
    const left = await h.call(
      manager, "DELETE", `${members}/${manager.user.id}`,
    );
    assert.equal(left.statusCode, 200, left.body);

    const direct = await h.call(employee, "POST", "/conversations", {
      type: "DIRECT",
      memberIds: [admin.user.id],
    });
    assert.equal(direct.statusCode, 201, direct.body);
    const directAdd = await h.call(
      employee, "POST",
      `/conversations/${direct.json().data.id}/members`,
      { userId: manager.user.id },
    );
    assert.equal(directAdd.statusCode, 403, directAdd.body);
  } finally {
    await h.close();
  }
});
