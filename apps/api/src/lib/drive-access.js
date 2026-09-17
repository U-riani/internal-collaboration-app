import { HttpError } from "./http-error.js";

export const driveInclude = {
  grants: true,
  owner: { select: { id: true, displayName: true } },
  file: {
    select: { id: true, originalName: true, sizeBytes: true, mimeType: true },
  },
};

export async function driveTree(db) {
  const items = await db.driveItem.findMany({
    include: driveInclude,
    orderBy: [{ kind: "desc" }, { name: "asc" }],
  });
  return new Map(items.map((item) => [item.id, item]));
}

// All ancestors must be live. Explicit grants and inherited grants are additive.
export function driveAccess(user, item, tree, { allowTrash = false } = {}) {
  let node = item;
  let access = null;
  const visited = new Set();
  while (node) {
    if (visited.has(node.id) || visited.size >= 100) return null;
    visited.add(node.id);
    if (node.deletedAt && !allowTrash) return null;
    if (node.ownerId === user.id) access = "OWNER";
    for (const grant of node.grants ?? []) {
      if (
        grant.userId === user.id ||
        (user.departmentId && grant.departmentId === user.departmentId)
      ) {
        if (!access || (access === "VIEWER" && grant.access === "EDITOR"))
          access = grant.access;
      }
    }
    if (node.parentId && !tree.has(node.parentId)) return null;
    node = node.parentId ? tree.get(node.parentId) : null;
  }
  return access;
}

export function requireDrive(user, item, tree, level = "VIEWER", options) {
  if (!item)
    throw new HttpError(404, "DRIVE_NOT_FOUND", "File or folder was not found");
  const access = driveAccess(user, item, tree, options);
  if (
    !access ||
    (level === "EDITOR" && access === "VIEWER") ||
    (level === "OWNER" && access !== "OWNER")
  ) {
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

export function publicDrive(item, access) {
  const { grants, ...safe } = item;
  return { ...safe, access, shared: grants.length > 0 };
}
