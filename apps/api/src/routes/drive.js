import crypto from "node:crypto";
import { z } from "zod";
import { parse } from "../lib/validation.js";
import { hasPermission, requirePermission } from "../lib/authz.js";
import { HttpError } from "../lib/http-error.js";
import {
  driveTree,
  driveAccess,
  driveSpaceAccess,
  requireDrive,
  requireDriveSpace,
  ensureDriveSpaces,
  isDescendant,
  publicDrive,
  publicSpace,
  driveInclude,
  spaceInclude,
} from "../lib/drive-access.js";
import { requireOwnUploads } from "../lib/file-access.js";
import { audit } from "../lib/audit.js";

const name = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (s) => !/[\x00-\x1f/\\]/.test(s) && ![".", ".."].includes(s),
    "Use a name without slashes or control characters",
  );

const createSchema = z.object({
  name,
  parentId: z.uuid().nullable().default(null),
  spaceId: z.uuid().optional(),
  fileId: z.uuid().optional(),
});

const grantSchema = z
  .object({
    userId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
    access: z.enum(["VIEWER", "EDITOR"]),
    scope: z.enum(["ITEM_ONLY", "DESCENDANTS"]).default("ITEM_ONLY"),
  })
  .refine(
    (value) => Boolean(value.userId) !== Boolean(value.departmentId),
    "Choose one person or department",
  );

const memberSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["VIEWER", "EDITOR", "MANAGER"]),
});

export default async function driveRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", async (request) =>
    requirePermission(request.authUser, "drive.use"),
  );

  const mutate = (fn) =>
    app.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(779331)`;
      return fn(tx, await driveTree(tx));
    });

  async function record(request, action, id, metadata) {
    await audit(app, request, {
      actionType: action,
      entityType: "DRIVE_ITEM",
      entityId: id,
      metadata,
    });
  }

  async function loadSpace(db, id) {
    return db.driveSpace.findUnique({
      where: { id },
      include: spaceInclude,
    });
  }

  async function manageItem(user, item, tree) {
    if (!item)
      throw new HttpError(404, "DRIVE_NOT_FOUND", "File or folder was not found");
    return item.space.type === "PERSONAL"
      ? requireDrive(user, item, tree, "OWNER")
      : requireDrive(user, item, tree, "MANAGER");
  }

  app.get("/spaces", async (request) => {
    const user = request.authUser;
    await ensureDriveSpaces(app.prisma, user);
    const spaces = await app.prisma.driveSpace.findMany({
      where: {
        OR: [
          { type: "GLOBAL" },
          { ownerUserId: user.id },
          { type: "GROUP", members: { some: { userId: user.id } } },
        ],
      },
      include: spaceInclude,
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    return {
      success: true,
      data: spaces.map((space) => publicSpace(user, space)),
      meta: {
        canCreateGroups: hasPermission(user, "drive.groups.create"),
        canManageGlobal: hasPermission(user, "drive.global.manage"),
      },
    };
  });

  app.post("/spaces", async (request, reply) => {
    requirePermission(request.authUser, "drive.groups.create");
    const input = parse(
      z.object({
        name,
        memberIds: z.array(z.uuid()).max(500).default([]),
      }),
      request.body,
    );
    const memberIds = [
      ...new Set(input.memberIds.filter((id) => id !== request.authUser.id)),
    ];
    if (memberIds.length) {
      const count = await app.prisma.user.count({
        where: { id: { in: memberIds }, status: "ACTIVE" },
      });
      if (count !== memberIds.length)
        throw new HttpError(400, "USER_NOT_FOUND", "Choose active users");
    }
    const space = await app.prisma.driveSpace.create({
      data: {
        key: `group:${crypto.randomUUID()}`,
        name: input.name,
        type: "GROUP",
        createdById: request.authUser.id,
        members: {
          create: [
            { userId: request.authUser.id, role: "MANAGER" },
            ...memberIds.map((userId) => ({ userId, role: "VIEWER" })),
          ],
        },
      },
      include: spaceInclude,
    });
    await audit(app, request, {
      actionType: "DRIVE_SPACE_CREATED",
      entityType: "DRIVE_SPACE",
      entityId: space.id,
    });
    reply.code(201);
    return { success: true, data: publicSpace(request.authUser, space) };
  });

  app.get("/spaces/:id/members", async (request) => {
    const space = await loadSpace(app.prisma, request.params.id);
    if (!space)
      throw new HttpError(404, "DRIVE_SPACE_NOT_FOUND", "Drive space was not found");
    requireDriveSpace(request.authUser, space, "MANAGER");
    return {
      success: true,
      data: space.members.map((member) => ({
        userId: member.userId,
        role: member.role,
        user: member.user,
      })),
      meta: { type: space.type, name: space.name },
    };
  });

  app.put("/spaces/:id/members", async (request) => {
    const input = parse(
      z.object({ members: z.array(memberSchema).max(1000) }),
      request.body,
    );
    const space = await loadSpace(app.prisma, request.params.id);
    if (!space)
      throw new HttpError(404, "DRIVE_SPACE_NOT_FOUND", "Drive space was not found");
    if (space.type === "PERSONAL")
      throw new HttpError(
        400,
        "PERSONAL_SPACE_MEMBERS",
        "Personal spaces use item sharing instead of members",
      );
    requireDriveSpace(request.authUser, space, "MANAGER");

    const ids = input.members.map((member) => member.userId);
    if (ids.length !== new Set(ids).size)
      throw new HttpError(400, "DUPLICATE_MEMBERS", "A user can appear only once");
    if (space.type === "GROUP" && !input.members.some((m) => m.role === "MANAGER"))
      throw new HttpError(
        400,
        "GROUP_MANAGER_REQUIRED",
        "A group space must keep at least one manager",
      );
    if (ids.length) {
      const count = await app.prisma.user.count({
        where: { id: { in: ids }, status: "ACTIVE" },
      });
      if (count !== ids.length)
        throw new HttpError(400, "USER_NOT_FOUND", "Choose active users");
    }

    await app.prisma.$transaction(async (tx) => {
      await tx.driveSpaceMember.deleteMany({ where: { spaceId: space.id } });
      if (input.members.length)
        await tx.driveSpaceMember.createMany({
          data: input.members.map((member) => ({
            spaceId: space.id,
            ...member,
          })),
        });
    });
    await audit(app, request, {
      actionType: "DRIVE_SPACE_MEMBERS_UPDATED",
      entityType: "DRIVE_SPACE",
      entityId: space.id,
    });
    return { success: true, data: null };
  });

  app.get("/", async (request) => {
    const q = parse(
      z.object({
        parentId: z.uuid().optional(),
        spaceId: z.uuid().optional(),
        view: z
          .enum(["personal", "shared", "shared-with-me", "trash", "mine"])
          .default("personal"),
        q: z.string().max(200).default(""),
      }),
      request.query,
    );

    const user = request.authUser;
    const defaults = await ensureDriveSpaces(app.prisma, user);
    const tree = await driveTree(app.prisma);
    const folder = q.parentId ? tree.get(q.parentId) : null;
    if (q.parentId) {
      requireDrive(user, folder, tree);
      if (folder.kind !== "FOLDER")
        throw new HttpError(400, "NOT_FOLDER", "Open a folder");
    }

    const sharedWithMe = ["shared", "shared-with-me"].includes(q.view);
    const trash = q.view === "trash";
    let space = folder?.space || null;

    if (!sharedWithMe && !trash && !space) {
      space = q.spaceId ? await loadSpace(app.prisma, q.spaceId) : defaults.personal;
      if (!space)
        throw new HttpError(404, "DRIVE_SPACE_NOT_FOUND", "Drive space was not found");
      requireDriveSpace(user, space);
    }

    if (folder && q.spaceId && folder.spaceId !== q.spaceId)
      throw new HttpError(400, "DRIVE_SPACE_MISMATCH", "Folder is in another space");

    const search = q.q.toLocaleLowerCase();
    const data = [];
    for (const item of tree.values()) {
      const access = driveAccess(user, item, tree);
      let visible = false;

      if (trash) {
        visible =
          item.space.type === "PERSONAL" &&
          item.space.ownerUserId === user.id &&
          Boolean(item.deletedAt);
      } else if (sharedWithMe) {
        const personalShare =
          item.space.type === "PERSONAL" &&
          item.space.ownerUserId !== user.id &&
          Boolean(access);
        if (q.q) {
          visible =
            personalShare &&
            item.name.toLocaleLowerCase().includes(search);
        } else if (q.parentId) {
          visible = personalShare && item.parentId === q.parentId;
        } else {
          const parentAccess = item.parentId
            ? driveAccess(user, tree.get(item.parentId), tree)
            : null;
          visible = personalShare && (!item.parentId || !parentAccess);
        }
      } else if (q.q) {
        visible =
          item.spaceId === space.id &&
          Boolean(access) &&
          item.name.toLocaleLowerCase().includes(search);
      } else if (q.parentId) {
        visible = item.spaceId === space.id && Boolean(access) && item.parentId === q.parentId;
      } else {
        visible =
          item.spaceId === space.id &&
          Boolean(access) &&
          !item.parentId;
      }

      if (visible) data.push(publicDrive(item, access || "OWNER"));
    }

    const breadcrumbs = [];
    let node = folder;
    const seen = new Set();
    while (node && !seen.has(node.id) && driveAccess(user, node, tree)) {
      seen.add(node.id);
      breadcrumbs.unshift({ id: node.id, name: node.name });
      node = node.parentId ? tree.get(node.parentId) : null;
    }

    return {
      success: true,
      data,
      meta: {
        breadcrumbs,
        folder: folder
          ? publicDrive(folder, driveAccess(user, folder, tree))
          : null,
        space: space ? publicSpace(user, space) : null,
        usedBytes: [...tree.values()]
          .filter(
            (item) =>
              item.space.type === "PERSONAL" &&
              item.space.ownerUserId === user.id,
          )
          .reduce((sum, item) => sum + (item.file?.sizeBytes || 0), 0),
      },
    };
  });

  app.post("/", async (request, reply) => {
    const input = parse(createSchema, request.body);
    const item = await mutate(async (tx, tree) => {
      const defaults = await ensureDriveSpaces(tx, request.authUser);
      const parent = input.parentId ? tree.get(input.parentId) : null;
      let space;

      if (input.parentId) {
        requireDrive(request.authUser, parent, tree, "EDITOR");
        if (parent.kind !== "FOLDER")
          throw new HttpError(400, "NOT_FOLDER", "Select a folder");
        if (input.spaceId && input.spaceId !== parent.spaceId)
          throw new HttpError(400, "DRIVE_SPACE_MISMATCH", "Folder is in another space");
        space = parent.space;
      } else {
        space = input.spaceId ? await loadSpace(tx, input.spaceId) : defaults.personal;
        if (!space)
          throw new HttpError(404, "DRIVE_SPACE_NOT_FOUND", "Drive space was not found");
        requireDriveSpace(request.authUser, space, "EDITOR");
      }

      if (input.fileId)
        await requireOwnUploads(
          { prisma: tx },
          request.authUser,
          [input.fileId],
          { unlinked: true },
        );

      return tx.driveItem.create({
        data: {
          name: input.name,
          parentId: input.parentId,
          fileId: input.fileId,
          spaceId: space.id,
          ownerId:
            space.type === "PERSONAL"
              ? space.ownerUserId
              : request.authUser.id,
          kind: input.fileId ? "FILE" : "FOLDER",
          permissionMode: space.type === "PERSONAL" ? "CUSTOM" : "INHERIT",
        },
        include: driveInclude,
      });
    });

    await record(request, "DRIVE_CREATED", item.id, { spaceId: item.spaceId });
    const currentTree = await driveTree(app.prisma);
    const created = currentTree.get(item.id);
    reply.code(201);
    return {
      success: true,
      data: publicDrive(
        created,
        driveAccess(request.authUser, created, currentTree),
      ),
    };
  });

  app.patch("/:id", async (request) => {
    const input = parse(
      z
        .object({
          name: name.optional(),
          parentId: z.uuid().nullable().optional(),
        })
        .strict(),
      request.body,
    );

    const item = await mutate(async (tx, tree) => {
      const item = tree.get(request.params.id);
      if (!item)
        throw new HttpError(404, "DRIVE_NOT_FOUND", "File or folder was not found");

      if (input.parentId !== undefined) {
        requireDrive(
          request.authUser,
          item,
          tree,
          item.space.type === "PERSONAL" ? "OWNER" : "EDITOR",
        );
        if (input.parentId) {
          const parent = tree.get(input.parentId);
          requireDrive(request.authUser, parent, tree, "EDITOR");
          if (
            parent.kind !== "FOLDER" ||
            parent.spaceId !== item.spaceId ||
            isDescendant(tree, parent.id, item.id)
          )
            throw new HttpError(
              400,
              "INVALID_MOVE",
              "Choose a folder in the same Drive space outside this item",
            );
        }
      } else {
        requireDrive(request.authUser, item, tree, "EDITOR");
      }

      return tx.driveItem.update({
        where: { id: item.id },
        data: input,
        include: driveInclude,
      });
    });

    await record(request, "DRIVE_UPDATED", item.id);
    return { success: true, data: { id: item.id } };
  });

  app.delete("/:id", async (request) => {
    await mutate(async (tx, tree) => {
      const item = tree.get(request.params.id);
      if (!item)
        throw new HttpError(404, "DRIVE_NOT_FOUND", "File or folder was not found");
      requireDrive(
        request.authUser,
        item,
        tree,
        item.space.type === "PERSONAL" ? "OWNER" : "MANAGER",
      );
      await tx.driveItem.update({
        where: { id: item.id },
        data: { deletedAt: new Date() },
      });
    });
    await record(request, "DRIVE_TRASHED", request.params.id);
    return { success: true, data: null };
  });

  app.post("/:id/restore", async (request) => {
    await mutate(async (tx, tree) => {
      const item = tree.get(request.params.id);
      if (!item)
        throw new HttpError(404, "DRIVE_NOT_FOUND", "File or folder was not found");
      requireDrive(
        request.authUser,
        item,
        tree,
        item.space.type === "PERSONAL" ? "OWNER" : "MANAGER",
        { allowTrash: true },
      );
      if (
        item.parentId &&
        !driveAccess(request.authUser, tree.get(item.parentId), tree)
      )
        throw new HttpError(
          409,
          "RESTORE_PARENT_FIRST",
          "Restore the parent folder first",
        );
      await tx.driveItem.update({
        where: { id: item.id },
        data: { deletedAt: null },
      });
    });
    await record(request, "DRIVE_RESTORED", request.params.id);
    return { success: true, data: null };
  });

  app.get("/:id/shares", async (request) => {
    const tree = await driveTree(app.prisma);
    const item = tree.get(request.params.id);
    await manageItem(request.authUser, item, tree);
    const data = await app.prisma.driveGrant.findMany({
      where: { itemId: request.params.id },
      include: {
        user: { select: { id: true, displayName: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      success: true,
      data,
      meta: {
        permissionMode: item.permissionMode,
        spaceType: item.space.type,
      },
    };
  });

  app.post("/:id/shares", async (request) => {
    const input = parse(grantSchema, request.body);
    await mutate(async (tx, tree) => {
      const item = tree.get(request.params.id);
      await manageItem(request.authUser, item, tree);
      if (input.userId === item.space.ownerUserId)
        throw new HttpError(
          400,
          "ALREADY_OWNER",
          "The personal-space owner already has full access",
        );
      if (input.userId) {
        const user = await tx.user.findFirst({
          where: { id: input.userId, status: "ACTIVE" },
        });
        if (!user)
          throw new HttpError(400, "USER_NOT_FOUND", "Choose an active user");
      }
      const where = input.userId
        ? { itemId_userId: { itemId: item.id, userId: input.userId } }
        : {
            itemId_departmentId: {
              itemId: item.id,
              departmentId: input.departmentId,
            },
          };
      await tx.driveGrant.upsert({
        where,
        create: { itemId: item.id, ...input },
        update: { access: input.access, scope: input.scope },
      });
    });
    await record(request, "DRIVE_SHARED", request.params.id);
    return { success: true, data: null };
  });

  app.put("/:id/shares", async (request) => {
    const input = parse(
      z.object({
        permissionMode: z.enum(["INHERIT", "CUSTOM"]).optional(),
        grants: z.array(grantSchema).max(2000),
      }),
      request.body,
    );

    await mutate(async (tx, tree) => {
      const item = tree.get(request.params.id);
      await manageItem(request.authUser, item, tree);

      const targets = input.grants.map((grant) =>
        grant.userId ? `u:${grant.userId}` : `d:${grant.departmentId}`,
      );
      if (targets.length !== new Set(targets).size)
        throw new HttpError(
          400,
          "DUPLICATE_SHARES",
          "A recipient can appear only once",
        );

      const userIds = input.grants
        .map((grant) => grant.userId)
        .filter(Boolean);
      if (userIds.length) {
        const count = await tx.user.count({
          where: { id: { in: userIds }, status: "ACTIVE" },
        });
        if (count !== userIds.length)
          throw new HttpError(400, "USER_NOT_FOUND", "Choose active users");
      }

      if (
        item.space.type === "PERSONAL" &&
        input.grants.some((grant) => grant.userId === item.space.ownerUserId)
      )
        throw new HttpError(
          400,
          "ALREADY_OWNER",
          "The personal-space owner already has full access",
        );

      await tx.driveGrant.deleteMany({ where: { itemId: item.id } });
      if (input.grants.length)
        await tx.driveGrant.createMany({
          data: input.grants.map((grant) => ({
            itemId: item.id,
            ...grant,
          })),
        });

      if (input.permissionMode && item.space.type !== "PERSONAL")
        await tx.driveItem.update({
          where: { id: item.id },
          data: { permissionMode: input.permissionMode },
        });
    });

    await record(request, "DRIVE_SHARES_REPLACED", request.params.id);
    return { success: true, data: null };
  });

  app.delete("/:id/shares/:grantId", async (request) => {
    await mutate(async (tx, tree) => {
      const item = tree.get(request.params.id);
      await manageItem(request.authUser, item, tree);
      await tx.driveGrant.deleteMany({
        where: { id: request.params.grantId, itemId: request.params.id },
      });
    });
    await record(request, "DRIVE_SHARE_REVOKED", request.params.id);
    return { success: true, data: null };
  });
}
