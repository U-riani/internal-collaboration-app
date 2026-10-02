import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { parse } from "../lib/validation.js";
import { requirePermission } from "../lib/authz.js";
import { HttpError } from "../lib/http-error.js";
import {
  driveAccess,
  driveInclude,
  driveTree,
  ensureDriveSpaces,
  publicDrive,
  requireDrive,
  requireDriveSpace,
} from "../lib/drive-access.js";
import { audit } from "../lib/audit.js";

const SHEET_MIME = "application/vnd.gtex.univer-sheet+json";

const name = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (value) => !/[\x00-\x1f/\\]/.test(value) && ![".", ".."].includes(value),
    "Use a name without slashes or control characters",
  );

const createSchema = z.object({
  name,
  spaceId: z.uuid().optional(),
  parentId: z.uuid().nullable().default(null),
});

const saveSchema = z.object({
  snapshot: z.unknown(),
  version: z.number().int().min(1),
});

function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new HttpError(
      400,
      "INVALID_SHEET_SNAPSHOT",
      "Spreadsheet snapshot must be an object",
    );
  }
}

async function loadSheetRow(db, driveItemId) {
  const rows = await db.$queryRaw`
    SELECT "driveItemId", "snapshot", "version", "createdAt", "updatedAt"
    FROM "DriveSheet"
    WHERE "driveItemId" = ${driveItemId}::uuid
    LIMIT 1
  `;
  return rows[0] || null;
}

export default async function driveSheetRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", async (request) =>
    requirePermission(request.authUser, "drive.use"),
  );

  app.get("/by-file/:fileId", async (request) => {
    const params = parse(z.object({ fileId: z.uuid() }), request.params);
    const rows = await app.prisma.$queryRaw`
      SELECT ds."driveItemId"
      FROM "DriveSheet" ds
      INNER JOIN "DriveItem" di ON di."id" = ds."driveItemId"
      WHERE di."fileId" = ${params.fileId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row)
      throw new HttpError(404, "SHEET_NOT_FOUND", "This file is not a spreadsheet");

    const tree = await driveTree(app.prisma);
    const item = tree.get(row.driveItemId);
    requireDrive(request.authUser, item, tree);

    return {
      success: true,
      data: { driveItemId: row.driveItemId },
    };
  });

  app.post("/", async (request, reply) => {
    const input = parse(createSchema, request.body);

    const item = await app.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(779332)`;
      const defaults = await ensureDriveSpaces(tx, request.authUser);
      const tree = await driveTree(tx);
      const parent = input.parentId ? tree.get(input.parentId) : null;
      let space;

      if (input.parentId) {
        requireDrive(request.authUser, parent, tree, "EDITOR");
        if (parent.kind !== "FOLDER")
          throw new HttpError(400, "NOT_FOLDER", "Select a folder");
        if (input.spaceId && input.spaceId !== parent.spaceId)
          throw new HttpError(
            400,
            "DRIVE_SPACE_MISMATCH",
            "Folder is in another space",
          );
        space = parent.space;
      } else {
        space = input.spaceId
          ? await tx.driveSpace.findUnique({
              where: { id: input.spaceId },
              include: {
                members: {
                  select: {
                    userId: true,
                    role: true,
                    user: {
                      select: { id: true, displayName: true, status: true },
                    },
                  },
                },
              },
            })
          : defaults.personal;
        if (!space)
          throw new HttpError(
            404,
            "DRIVE_SPACE_NOT_FOUND",
            "Drive space was not found",
          );
        requireDriveSpace(request.authUser, space, "EDITOR");
      }

      const virtualFile = await tx.fileObject.create({
        data: {
          originalName: `${input.name}.univer.json`,
          objectKey: `drive-sheets/${crypto.randomUUID()}.univer.json`,
          bucket: "virtual",
          mimeType: SHEET_MIME,
          sizeBytes: 0,
          uploadedById: request.authUser.id,
          scanStatus: "CLEAN",
        },
      });

      const created = await tx.driveItem.create({
        data: {
          name: input.name,
          parentId: input.parentId,
          fileId: virtualFile.id,
          spaceId: space.id,
          ownerId:
            space.type === "PERSONAL"
              ? space.ownerUserId
              : request.authUser.id,
          kind: "FILE",
          permissionMode: space.type === "PERSONAL" ? "CUSTOM" : "INHERIT",
        },
        include: driveInclude,
      });

      await tx.$executeRaw`
        INSERT INTO "DriveSheet" ("driveItemId", "snapshot", "version", "createdAt", "updatedAt")
        VALUES (${created.id}::uuid, '{}'::jsonb, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      return created;
    });

    await audit(app, request, {
      actionType: "DRIVE_SHEET_CREATED",
      entityType: "DRIVE_ITEM",
      entityId: item.id,
      metadata: { spaceId: item.spaceId },
    });

    const tree = await driveTree(app.prisma);
    const created = tree.get(item.id);
    reply.code(201);
    return {
      success: true,
      data: publicDrive(
        created,
        driveAccess(request.authUser, created, tree),
      ),
    };
  });

  app.get("/:id", async (request) => {
    const params = parse(z.object({ id: z.uuid() }), request.params);
    const tree = await driveTree(app.prisma);
    const item = tree.get(params.id);
    const access = requireDrive(request.authUser, item, tree);
    const sheet = await loadSheetRow(app.prisma, params.id);
    if (!sheet)
      throw new HttpError(404, "SHEET_NOT_FOUND", "Spreadsheet was not found");

    return {
      success: true,
      data: {
        id: item.id,
        name: item.name,
        access,
        snapshot: sheet.snapshot,
        version: sheet.version,
        updatedAt: sheet.updatedAt,
        owner: item.owner,
        space: {
          id: item.space.id,
          name: item.space.name,
          type: item.space.type,
        },
      },
    };
  });

  app.put(
    "/:id",
    { bodyLimit: env.MAX_SHEET_SNAPSHOT_MB * 1024 * 1024 },
    async (request) => {
      const params = parse(z.object({ id: z.uuid() }), request.params);
      const input = parse(saveSchema, request.body);
      assertSnapshot(input.snapshot);

      const tree = await driveTree(app.prisma);
      const item = tree.get(params.id);
      requireDrive(request.authUser, item, tree, "EDITOR");

      const existing = await loadSheetRow(app.prisma, params.id);
      if (!existing)
        throw new HttpError(404, "SHEET_NOT_FOUND", "Spreadsheet was not found");

      const snapshotJson = JSON.stringify(input.snapshot);
      const rows = await app.prisma.$queryRaw`
        UPDATE "DriveSheet"
        SET
          "snapshot" = ${snapshotJson}::jsonb,
          "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "driveItemId" = ${params.id}::uuid
          AND "version" = ${input.version}
        RETURNING "version", "updatedAt"
      `;

      if (!rows.length) {
        throw new HttpError(
          409,
          "SHEET_VERSION_CONFLICT",
          "This spreadsheet was changed by someone else. Reload it before continuing",
        );
      }

      await audit(app, request, {
        actionType: "DRIVE_SHEET_SAVED",
        entityType: "DRIVE_ITEM",
        entityId: params.id,
        metadata: { version: rows[0].version },
      });

      return {
        success: true,
        data: {
          version: rows[0].version,
          updatedAt: rows[0].updatedAt,
        },
      };
    },
  );
}
