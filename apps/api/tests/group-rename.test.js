import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

test("group renaming is validated, member-only, and limited to GROUP", async () => {
  const h = await harness();
  try {
    const groupResult = await h.call(h.users.employee, "POST", "/conversations", {
      type: "GROUP",
      name: "Original group",
      memberIds: [h.users.admin.user.id],
    });
    assert.equal(groupResult.statusCode, 201, groupResult.body);
    const groupId = groupResult.json().data.id;
    const path = `/conversations/${groupId}`;

    const outsider = await h.call(h.users.manager, "PATCH", path, {
      name: "Should not change",
    });
    assert.equal(outsider.statusCode, 403, outsider.body);

    const invalid = await h.call(h.users.admin, "PATCH", path, {
      name: " ",
    });
    assert.equal(invalid.statusCode, 400, invalid.body);

    // A current member, not only the owner, can rename a GROUP.
    const renamed = await h.call(h.users.admin, "PATCH", path, {
      name: "  Updated group  ",
    });
    assert.equal(renamed.statusCode, 200, renamed.body);
    assert.equal(renamed.json().data.name, "Updated group");

    const list = await h.call(h.users.employee, "GET", "/conversations");
    assert.equal(list.statusCode, 200, list.body);
    assert.equal(
      list.json().data.find((conversation) => conversation.id === groupId)?.name,
      "Updated group",
    );

    const same = await h.call(h.users.employee, "PATCH", path, {
      name: "Updated group",
    });
    assert.equal(same.statusCode, 200, same.body);

    const direct = await h.call(h.users.employee, "POST", "/conversations", {
      type: "DIRECT",
      memberIds: [h.users.admin.user.id],
    });
    assert.equal(direct.statusCode, 201, direct.body);
    const directRename = await h.call(
      h.users.employee,
      "PATCH",
      `/conversations/${direct.json().data.id}`,
      { name: "No direct renaming" },
    );
    assert.equal(directRename.statusCode, 400, directRename.body);
  } finally {
    await h.close();
  }
});
