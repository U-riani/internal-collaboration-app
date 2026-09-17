import { z } from "zod";
import { parse } from "../lib/validation.js";
import { requirePermission } from "../lib/authz.js";
import { HttpError } from "../lib/http-error.js";
import {
  driveTree,
  driveAccess,
  requireDrive,
  isDescendant,
  publicDrive,
  driveInclude,
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
  fileId: z.uuid().optional(),
});

export default async function driveRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", async (request) =>
    requirePermission(request.authUser, "drive.use"),
  );
  const mutate = (fn) =>
    app.prisma.$transaction(async (tx) => {
      // Serialize tree mutations so concurrent moves cannot introduce a cycle.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(779331)`;
      return fn(tx, await driveTree(tx));
    });
  async function record(request, action, id) {
    await audit(app, request, {
      actionType: action,
      entityType: "DRIVE_ITEM",
      entityId: id,
    });
  }

  app.get("/", async (request) => {
    const q = parse(
      z.object({
        parentId: z.uuid().optional(),
        view: z.enum(["mine", "shared", "trash"]).default("mine"),
        q: z.string().max(200).default(""),
      }),
      request.query,
    );
    const tree = await driveTree(app.prisma);
    const user = request.authUser;
    const folder = q.parentId ? tree.get(q.parentId) : null;
    if (q.parentId) {
      requireDrive(user, folder, tree);
      if (folder.kind !== "FOLDER")
        throw new HttpError(400, "NOT_FOLDER", "Open a folder");
    }
    const data = [];
    for (const item of tree.values()) {
      const access = driveAccess(user, item, tree);
      let visible;
      if (q.view === "trash")
        visible = item.ownerId === user.id && Boolean(item.deletedAt);
      else if (q.q)
        visible =
          access &&
          item.name.toLocaleLowerCase().includes(q.q.toLocaleLowerCase()) &&
          (q.view === "mine"
            ? item.ownerId === user.id
            : item.ownerId !== user.id);
      else if (q.parentId) visible = access && item.parentId === q.parentId;
      else if (q.view === "shared")
        visible =
          access &&
          item.ownerId !== user.id &&
          (!item.parentId || !driveAccess(user, tree.get(item.parentId), tree));
      else visible = access && item.ownerId === user.id && !item.parentId;
      if (visible) data.push(publicDrive(item, access || "OWNER"));
    }
    const breadcrumbs = [];
    let node = folder;
    const seen = new Set();
    while (node && !seen.has(node.id) && driveAccess(user, node, tree)) {
      seen.add(node.id);
      breadcrumbs.unshift({ id: node.id, name: node.name });
      node = tree.get(node.parentId);
    }
    return {
      success: true,
      data,
      meta: {
        breadcrumbs,
        folder: folder
          ? publicDrive(folder, driveAccess(user, folder, tree))
          : null,
        usedBytes: [...tree.values()]
          .filter((x) => x.ownerId === user.id)
          .reduce((sum, x) => sum + (x.file?.sizeBytes || 0), 0),
      },
    };
  });

  app.post("/", async (request, reply) => {
    const input = parse(createSchema, request.body);
    const item = await mutate(async (tx, tree) => {
      const parent = input.parentId ? tree.get(input.parentId) : null;
      if (input.parentId) {
        requireDrive(request.authUser, parent, tree, "EDITOR");
        if (parent.kind !== "FOLDER")
          throw new HttpError(400, "NOT_FOLDER", "Select a folder");
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
          ...input,
          ownerId: parent?.ownerId ?? request.authUser.id,
          kind: input.fileId ? "FILE" : "FOLDER",
        },
        include: driveInclude,
      });
    });
    await record(request, "DRIVE_CREATED", item.id);
    reply.code(201);
    return {
      success: true,
      data: publicDrive(
        item,
        item.ownerId === request.authUser.id ? "OWNER" : "EDITOR",
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
      requireDrive(
        request.authUser,
        item,
        tree,
        input.parentId !== undefined ? "OWNER" : "EDITOR",
      );
      if (input.parentId) {
        const parent = tree.get(input.parentId);
        requireDrive(request.authUser, parent, tree, "OWNER");
        if (
          parent.kind !== "FOLDER" ||
          parent.ownerId !== item.ownerId ||
          isDescendant(tree, parent.id, item.id)
        )
          throw new HttpError(
            400,
            "INVALID_MOVE",
            "Choose a folder you own outside this item",
          );
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
      requireDrive(request.authUser, item, tree, "OWNER");
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
      requireDrive(request.authUser, item, tree, "OWNER", { allowTrash: true });
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
    requireDrive(request.authUser, tree.get(request.params.id), tree, "OWNER");
    const data = await app.prisma.driveGrant.findMany({
      where: { itemId: request.params.id },
      include: {
        user: { select: { id: true, displayName: true } },
        department: { select: { id: true, name: true } },
      },
    });
    return { success: true, data };
  });

  app.post("/:id/shares", async (request) => {
    const input = parse(
      z
        .object({
          userId: z.uuid().optional(),
          departmentId: z.uuid().optional(),
          access: z.enum(["VIEWER", "EDITOR"]),
        })
        .refine(
          (x) => Boolean(x.userId) !== Boolean(x.departmentId),
          "Choose one person or department",
        ),
      request.body,
    );
    await mutate(async (tx, tree) => {
      const item = tree.get(request.params.id);
      requireDrive(request.authUser, item, tree, "OWNER");
      if (input.userId === item.ownerId)
        throw new HttpError(
          400,
          "ALREADY_OWNER",
          "The owner already has full access",
        );
      if (
        input.userId &&
        !(await tx.user.findFirst({
          where: { id: input.userId, status: "ACTIVE" },
        }))
      )
        throw new HttpError(400, "USER_NOT_FOUND", "Choose an active user");
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
        update: { access: input.access },
      });
    });
    await record(request, "DRIVE_SHARED", request.params.id);
    return { success: true, data: null };
  });

  app.delete("/:id/shares/:grantId", async (request) => {
    await mutate(async (tx, tree) => {
      requireDrive(
        request.authUser,
        tree.get(request.params.id),
        tree,
        "OWNER",
      );
      await tx.driveGrant.deleteMany({
        where: { id: request.params.grantId, itemId: request.params.id },
      });
    });
    await record(request, "DRIVE_SHARE_REVOKED", request.params.id);
    return { success: true, data: null };
  });
}
