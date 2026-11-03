import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { env } from "../config/env.js";
import { publicUser, userWithAccess } from "../lib/authz.js";
import { audit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";
import { parse } from "../lib/validation.js";

// Keep profile pictures small even when other workspace attachments have no
// practical size limit. Never trust the filename or the supplied MIME alone.
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const types = new Set(["image/jpeg", "image/png", "image/webp"]);

async function detectImageType(filename) {
  const handle = await open(filename, "r");
  try {
    const bytes = Buffer.alloc(32);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      return { mime: "image/jpeg", extension: "jpg" };
    if (
      bytesRead >= 24 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString("ascii", 12, 16) === "IHDR" &&
      bytes.readUInt32BE(16) > 0 &&
      bytes.readUInt32BE(20) > 0
    )
      return { mime: "image/png", extension: "png" };
    if (
      bytesRead >= 16 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))
    )
      return { mime: "image/webp", extension: "webp" };
    return null;
  } finally {
    await handle.close();
  }
}

function avatarAuditData(user) {
  return { hasAvatar: Boolean(user?.avatarObjectKey) };
}

async function removeStoredAvatar(app, key) {
  if (!key) return;
  try {
    await app.minio.removeObject(env.MINIO_BUCKET_ATTACHMENTS, key);
  } catch (error) {
    // Once DB changes have committed, a failed object cleanup must not cause
    // a false error in the UI; it can be retried by an administrator.
    app.log.warn({ error, key }, "Could not remove an obsolete avatar object");
  }
}

export default async function userAvatarRoutes(app) {
  // One authenticated, lightweight lookup avoids probing every colleague's
  // missing photo URL (and filling DevTools with expected 404 responses).
  app.get("/avatars", async (request, reply) => {
    const users = await app.prisma.user.findMany({
      where: {
        avatarObjectKey: { not: null },
        avatarMimeType: { in: [...types] },
      },
      select: { id: true, avatarUpdatedAt: true },
    });
    reply.header("cache-control", "private, no-store");
    return {
      success: true,
      data: Object.fromEntries(users.map((user) => [
        user.id,
        "/api/v1/users/" + user.id + "/avatar?v=" + (user.avatarUpdatedAt?.getTime() ?? 0),
      ])),
    };
  });

  app.get("/:id/avatar", async (request, reply) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const user = await app.prisma.user.findUnique({
      where: { id },
      select: { avatarObjectKey: true, avatarMimeType: true },
    });
    if (!user?.avatarObjectKey || !types.has(user.avatarMimeType))
      throw new HttpError(404, "AVATAR_NOT_FOUND", "Profile photo was not found");

    const image = await app.minio.getObject(
      env.MINIO_BUCKET_ATTACHMENTS,
      user.avatarObjectKey,
    );
    return reply
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("content-disposition", "inline")
      .type(user.avatarMimeType)
      .send(image);
  });

  app.post(
    "/me/avatar",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const part = await request.file({ limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });
      if (!part) throw new HttpError(400, "AVATAR_REQUIRED", "Choose a profile photo");
      if (part.fieldname !== "file" || !types.has(part.mimetype?.toLowerCase())) {
        part.file.resume();
        throw new HttpError(415, "AVATAR_TYPE_UNSUPPORTED", "Choose a JPG, PNG or WebP image");
      }

      const folder = await mkdtemp(path.join(os.tmpdir(), "collab-avatar-"));
      const temporaryFile = path.join(folder, "image");
      let newObjectKey;
      try {
        try {
          await pipeline(part.file, createWriteStream(temporaryFile));
        } catch (error) {
          if (error.code === "FST_REQ_FILE_TOO_LARGE")
            throw new HttpError(413, "AVATAR_TOO_LARGE", "Profile photos must be 5 MB or smaller");
          throw error;
        }
        if (part.file.truncated)
          throw new HttpError(413, "AVATAR_TOO_LARGE", "Profile photos must be 5 MB or smaller");

        const { size } = await stat(temporaryFile);
        if (!size) throw new HttpError(400, "AVATAR_EMPTY", "The photo is empty");
        if (size > MAX_AVATAR_BYTES)
          throw new HttpError(413, "AVATAR_TOO_LARGE", "Profile photos must be 5 MB or smaller");

        const actualType = await detectImageType(temporaryFile);
        if (!actualType || actualType.mime !== part.mimetype.toLowerCase())
          throw new HttpError(415, "AVATAR_INVALID_IMAGE", "The file is not a valid JPG, PNG or WebP image");

        newObjectKey =
          "avatars/" + request.authUser.id + "/" + crypto.randomUUID() + "." + actualType.extension;
        await app.minio.fPutObject(
          env.MINIO_BUCKET_ATTACHMENTS,
          newObjectKey,
          temporaryFile,
          { "Content-Type": actualType.mime },
        );

        let previous;
        let updated;
        try {
          ({ previous, updated } = await app.prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${request.authUser.id}))`;
            const previousUser = await tx.user.findUnique({
              where: { id: request.authUser.id },
              select: { avatarObjectKey: true, avatarMimeType: true },
            });
            const nextUser = await tx.user.update({
              where: { id: request.authUser.id },
              data: {
                avatarObjectKey: newObjectKey,
                avatarMimeType: actualType.mime,
                avatarUpdatedAt: new Date(),
              },
              include: userWithAccess,
            });
            return { previous: previousUser, updated: nextUser };
          }));
        } catch (error) {
          await removeStoredAvatar(app, newObjectKey);
          throw error;
        }

        await audit(app, request, {
          actionType: previous?.avatarObjectKey ? "USER_AVATAR_CHANGED" : "USER_AVATAR_UPLOADED",
          entityType: "USER",
          entityId: updated.id,
          beforeData: avatarAuditData(previous),
          afterData: avatarAuditData(updated),
        });
        await removeStoredAvatar(app, previous?.avatarObjectKey);
        reply.code(201);
        return { success: true, data: publicUser(updated) };
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  );

  app.delete("/me/avatar", async (request) => {
    const { previous, updated } = await app.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${request.authUser.id}))`;
      const previousUser = await tx.user.findUnique({
        where: { id: request.authUser.id },
        select: { avatarObjectKey: true, avatarMimeType: true },
      });
      const nextUser = await tx.user.update({
        where: { id: request.authUser.id },
        data: {
          avatarObjectKey: null,
          avatarMimeType: null,
          avatarUpdatedAt: null,
        },
        include: userWithAccess,
      });
      return { previous: previousUser, updated: nextUser };
    });

    if (previous?.avatarObjectKey) {
      await audit(app, request, {
        actionType: "USER_AVATAR_REMOVED",
        entityType: "USER",
        entityId: updated.id,
        beforeData: avatarAuditData(previous),
        afterData: avatarAuditData(updated),
      });
      await removeStoredAvatar(app, previous.avatarObjectKey);
    }
    return { success: true, data: publicUser(updated) };
  });
}
