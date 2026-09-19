import { HttpError } from "./http-error.js";
import { hasPermission } from "./authz.js";

const ACCESS_RANK = { VIEWER: 1, EDITOR: 2, MANAGER: 3, OWNER: 4 };

function stronger(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return ACCESS_RANK[right] > ACCESS_RANK[left] ? right : left;
}

function grantMatches(user, grant) {
  return (
    grant.userId === user.id ||
    (user.departmentId && grant.departmentId === user.departmentId)
  );
}

export const spaceInclude = {
  members: {
    select: {
      userId: true,
      role: true,
      user: { select: { id: true, displayName: true, status: true } },
    },
  },
};

export const driveInclude = {
  grants: true,
  owner: { select: { id: true, displayName: true } },
  file: {
    select: { id: true, originalName: true, sizeBytes: true, mimeType: true },
  },
  space: { include: spaceInclude },
};

export async function ensureDriveSpaces(db, user) {
  const [personal, global] = await Promise.all([
    db.driveSpace.upsert({
      where: { key: `personal:${user.id}` },
      update: { name: "Personal" },
      create: {
        key: `personal:${user.id}`,
        name: "Personal",
        type: "PERSONAL",
        ownerUserId: user.id,
        createdById: user.id,
      },
      include: spaceInclude,
    }),
    db.driveSpace.upsert({
      where: { key: "global" },
      update: { name: "Global" },
      create: { key: "global", name: "Global", type: "GLOBAL" },
      include: spaceInclude,
    }),
  ]);
  return { personal, global };
}

export async function driveTree(db) {
  const items = await db.driveItem.findMany({
    include: driveInclude,
    orderBy: [{ kind: "desc" }, { name: "asc" }],
  });
  return new Map(items.map((item) => [item.id, item]));
}

export function driveSpaceAccess(user, space) {
  if (!space) return null;
  if (space.type === "PERSONAL")
    return space.ownerUserId === user.id ? "OWNER" : null;

  const membership = space.members?.find((member) => member.userId === user.id);
  if (space.type === "GLOBAL") {
    let access = "VIEWER";
    if (hasPermission(user, "drive.global.manage")) access = "MANAGER";
    return stronger(access, membership?.role || null);
  }
  return membership?.role || null;
}

export function requireDriveSpace(user, space, level = "VIEWER") {
  const access = driveSpaceAccess(user, space);
  if (!access || ACCESS_RANK[access] < ACCESS_RANK[level]) {
    throw new HttpError(
      403,
      "DRIVE_SPACE_ACCESS_DENIED",
      "You do not have permission for this Drive space",
    );
  }
  return access;
}

// Personal spaces use explicit grants. New grants are item-only unless the
// owner deliberately chooses DESCENDANTS. Shared spaces inherit their
// workspace role until a CUSTOM item breaks inheritance.
export function driveAccess(user, item, tree, { allowTrash = false } = {}) {
  if (!item) return null;

  const path = [];
  let node = item;
  const visited = new Set();
  while (node) {
    if (visited.has(node.id) || visited.size >= 100) return null;
    visited.add(node.id);
    if (node.deletedAt && !allowTrash) return null;
    path.unshift(node);
    if (!node.parentId) break;
    const parent = tree.get(node.parentId);
    if (!parent || parent.spaceId !== item.spaceId) return null;
    node = parent;
  }

  const space = item.space;
  if (space.type === "PERSONAL") {
    if (space.ownerUserId === user.id) return "OWNER";
    let access = null;
    for (let index = 0; index < path.length; index += 1) {
      const current = path[index];
      const isTarget = index === path.length - 1;
      for (const grant of current.grants ?? []) {
        if (!grantMatches(user, grant)) continue;
        if (isTarget || grant.scope === "DESCENDANTS")
          access = stronger(access, grant.access);
      }
    }
    return access;
  }

  const managerAccess = driveSpaceAccess(user, space);
  if (managerAccess === "MANAGER") return "MANAGER";

  let inherited = managerAccess;
  let currentAccess = inherited;
  for (const current of path) {
    if (current.permissionMode === "CUSTOM") inherited = null;
    currentAccess = inherited;
    let descendantGrant = null;
    for (const grant of current.grants ?? []) {
      if (!grantMatches(user, grant)) continue;
      currentAccess = stronger(currentAccess, grant.access);
      if (grant.scope === "DESCENDANTS")
        descendantGrant = stronger(descendantGrant, grant.access);
    }
    inherited = stronger(inherited, descendantGrant);
  }
  return currentAccess;
}

export function requireDrive(user, item, tree, level = "VIEWER", options) {
  if (!item)
    throw new HttpError(404, "DRIVE_NOT_FOUND", "File or folder was not found");
  const access = driveAccess(user, item, tree, options);
  if (!access || ACCESS_RANK[access] < ACCESS_RANK[level]) {
    throw new HttpError(
      403,
      "DRIVE_ACCESS_DENIED",
      "You do not have permission for this file or folder",
    );
  }
  return access;
}

export function isDescendant(tree, candidateId, itemId) {
  const seen = new Set();
  while (candidateId) {
    if (candidateId === itemId || seen.has(candidateId) || seen.size >= 100)
      return true;
    seen.add(candidateId);
    candidateId = tree.get(candidateId)?.parentId;
  }
  return false;
}

export function publicSpace(user, space) {
  return {
    id: space.id,
    key: space.key,
    name: space.name,
    type: space.type,
    ownerUserId: space.ownerUserId,
    access: driveSpaceAccess(user, space),
  };
}

export function publicDrive(item, access) {
  const { grants, space, ...safe } = item;
  return {
    ...safe,
    access,
    shared: space.type !== "PERSONAL" || grants.length > 0,
    space: {
      id: space.id,
      name: space.name,
      type: space.type,
      ownerUserId: space.ownerUserId,
    },
  };
}
