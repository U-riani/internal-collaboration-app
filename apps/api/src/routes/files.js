import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import {
  fileAccessInclude,
  canAccessFile,
  hasLinks,
} from "../lib/file-access.js";
import { hasPermission } from "../lib/authz.js";

const blockedExtensions = new Set([
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".ps1",
  ".sh",
  ".msi",
  ".scr",
  ".com",
  ".jar",
]);
export default async function fileRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.post(
    "/",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
    if (
      !["drive.use", "messages.send", "tasks.create", "approvals.submit"].some(
        (permission) => hasPermission(request.authUser, permission),
      )
    )
      throw new HttpError(
        403,
        "UPLOAD_DENIED",
        "Your role cannot upload files",
      );
    const part = await request.file();
    if (!part) throw new HttpError(400, "FILE_REQUIRED", "Choose a file");
    const originalName =
      path
        .basename(part.filename.replaceAll("\\", "/"))
        .normalize("NFC")
        .replace(/[\x00-\x1f\x7f]/g, "")
        .slice(0, 200) || "file";
    if (blockedExtensions.has(path.extname(originalName).toLowerCase()))
      throw new HttpError(
        400,
        "FILE_TYPE_NOT_ALLOWED",
        "Executable files are not allowed",
      );
    const folder = await mkdtemp(path.join(os.tmpdir(), "collab-upload-"));
    const temp = path.join(folder, "upload");
    const hash = crypto.createHash("sha256");
    try {
      await pipeline(
        part.file,
        new Transform({
          transform(chunk, encoding, callback) {
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(temp),
      );
      if (part.file.truncated)
        throw new HttpError(
          413,
          "FILE_TOO_LARGE",
          `Files must be smaller than ${env.MAX_UPLOAD_SIZE_MB} MB`,
        );
      const { size } = await stat(temp);
      if (!size) throw new HttpError(400, "FILE_EMPTY", "The file is empty");
      const objectKey = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
      await app.minio.fPutObject(
        env.MINIO_BUCKET_ATTACHMENTS,
        objectKey,
        temp,
        { "Content-Type": "application/octet-stream" },
      );
      let file;
      try {
        file = await app.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${request.authUser.id}))`;
          const usage = await tx.fileObject.aggregate({
            where: { uploadedById: request.authUser.id },
            _sum: { sizeBytes: true },
          });
          if (
            (usage._sum.sizeBytes || 0) + size >
            env.STORAGE_QUOTA_MB * 1024 * 1024
          )
            throw new HttpError(
              413,
              "STORAGE_QUOTA_EXCEEDED",
              "Your storage quota has been reached",
            );
          return tx.fileObject.create({
            data: {
              originalName,
              objectKey,
              bucket: env.MINIO_BUCKET_ATTACHMENTS,
              mimeType: part.mimetype || "application/octet-stream",
              sizeBytes: size,
              checksum: hash.digest("hex"),
              uploadedById: request.authUser.id,
              scanStatus: "PENDING",
            },
          });
        });
      } catch (error) {
        await app.minio
          .removeObject(env.MINIO_BUCKET_ATTACHMENTS, objectKey)
          .catch(() => {});
        throw error;
      }
      reply.code(201);
      return {
        success: true,
        data: {
          id: file.id,
          originalName,
          sizeBytes: size,
          mimeType: file.mimeType,
        },
      };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
    },
  );
  async function getFile(request) {
    const file = await app.prisma.fileObject.findUnique({
      where: { id: request.params.id },
      include: fileAccessInclude,
    });
    if (!file || file.deletedAt)
      throw new HttpError(404, "FILE_NOT_FOUND", "File was not found");
    if (!(await canAccessFile(app, request.authUser, file)))
      throw new HttpError(
        403,
        "FILE_ACCESS_DENIED",
        "You cannot access this file",
      );
    return file;
  }
  app.get("/:id", async (request) => {
    const file = await getFile(request);
    return {
      success: true,
      data: {
        id: file.id,
        originalName: file.originalName,
        sizeBytes: file.sizeBytes,
        mimeType: file.mimeType,
      },
    };
  });
  app.get("/:id/download", async (request, reply) => {
    const file = await getFile(request);
    const stream = await app.minio.getObject(file.bucket, file.objectKey);
    return reply
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header(
        "content-disposition",
        `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.originalName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
      )
      .type("application/octet-stream")
      .send(stream);
  });
  app.delete("/:id", async (request) => {
    const file = await getFile(request);
    if (file.uploadedById !== request.authUser.id || hasLinks(file))
      throw new HttpError(
        403,
        "FILE_IN_USE",
        "Remove a shared file through its Drive folder or owning item",
      );
    await app.prisma.fileObject.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });
    return { success: true, data: null };
  });
}
