import test from "node:test";
import assert from "node:assert/strict";
import { driveAccess, requireDrive } from "../src/lib/drive-access.js";

function item({ id, parentId = null, permissionMode = "INHERIT", grants = [], space }) {
  return {
    id,
    spaceId: space.id,
    parentId,
    deletedAt: null,
    permissionMode,
    grants,
    space,
  };
}

test("custom group folders isolate members and pass access to descendants", () => {
  const space = {
    id: "shops",
    type: "GROUP",
    ownerUserId: null,
    members: [
      { userId: "admin", role: "MANAGER" },
      { userId: "user-a", role: "VIEWER" },
      { userId: "user-b", role: "VIEWER" },
    ],
  };

  const documents = item({ id: "documents", space });
  const cityMall = item({
    id: "penti-city-mall",
    parentId: documents.id,
    permissionMode: "CUSTOM",
    grants: [
      {
        userId: "user-a",
        departmentId: null,
        access: "EDITOR_DELETE",
        scope: "DESCENDANTS",
      },
    ],
    space,
  });
  const cityMallFile = item({
    id: "city-file",
    parentId: cityMall.id,
    space,
  });
  const pekini = item({
    id: "penti-pekini",
    parentId: documents.id,
    permissionMode: "CUSTOM",
    grants: [
      {
        userId: "user-b",
        departmentId: null,
        access: "EDITOR",
        scope: "DESCENDANTS",
      },
    ],
    space,
  });
  const pekiniFile = item({
    id: "pekini-file",
    parentId: pekini.id,
    space,
  });

  const tree = new Map(
    [documents, cityMall, cityMallFile, pekini, pekiniFile].map((entry) => [
      entry.id,
      entry,
    ]),
  );

  const userA = { id: "user-a", departmentId: null };
  const userB = { id: "user-b", departmentId: null };
  const admin = { id: "admin", departmentId: null };

  assert.equal(driveAccess(userA, documents, tree), "VIEWER");
  assert.equal(driveAccess(userA, cityMall, tree), "EDITOR_DELETE");
  assert.equal(driveAccess(userA, cityMallFile, tree), "EDITOR_DELETE");
  assert.equal(driveAccess(userA, pekini, tree), null);
  assert.equal(driveAccess(userA, pekiniFile, tree), null);

  assert.equal(driveAccess(userB, documents, tree), "VIEWER");
  assert.equal(driveAccess(userB, pekini, tree), "EDITOR");
  assert.equal(driveAccess(userB, pekiniFile, tree), "EDITOR");
  assert.equal(driveAccess(userB, cityMall, tree), null);
  assert.equal(driveAccess(userB, cityMallFile, tree), null);

  assert.equal(driveAccess(admin, cityMall, tree), "MANAGER");
  assert.equal(driveAccess(admin, pekini, tree), "MANAGER");

  assert.equal(
    requireDrive(userA, cityMallFile, tree, "EDITOR_DELETE"),
    "EDITOR_DELETE",
  );
  assert.throws(
    () => requireDrive(userB, pekiniFile, tree, "EDITOR_DELETE"),
    (error) => error?.statusCode === 403,
  );
  assert.equal(
    requireDrive(admin, cityMallFile, tree, "EDITOR_DELETE"),
    "MANAGER",
  );
});
