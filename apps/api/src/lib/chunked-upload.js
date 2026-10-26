import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "./http-error.js";
import { hasPermission } from "./authz.js";

// Each request stays well below Cloudflare's proxied request-body ceiling.
// FileObject.sizeBytes is still an Int, so each completed file must fit it.
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_ACTIVE_PER_USER = 3;
const blockedExtensions = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".msi", ".scr", ".com", ".jar",
]);
const startSchema = z.object({
  name: z.string().min(1).max(1024),
  sizeBytes: z.number().int().positive().safe(),
  mimeType: z.string().max(255).default("application/octet-stream"),
});

function requireUploader(user) {
  if (!["drive.use", "messages.send", "tasks.create", "approvals.submit"].some(
    (permission) => hasPermission(user, permission),
  )) throw new HttpError(403, "UPLOAD_DENIED", "Your role cannot upload files");
}

function sanitizeFilename(name) {
  return path.basename(name.replaceAll("\\", "/"))
    .normalize("NFC")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 200) || "file";
}

export default async function registerChunkedUploads(app) {
  const sessions = new Map();

  async function cleanup(upload) {
    sessions.delete(upload.id);
    await rm(upload.folder, { recursive: true, force: true });
  }

  function findUpload(request) {
    const upload = sessions.get(request.params.uploadId);
    if (!upload || upload.ownerId !== request.authUser.id)
      throw new HttpError(404, "UPLOAD_NOT_FOUND", "Upload has expired or is unavailable");
    if (Date.now() - upload.touchedAt > SESSION_TTL_MS) {
      if (!upload.busy) void cleanup(upload).catch(() => {});
      throw new HttpError(410, "UPLOAD_EXPIRED", "Upload expired; select the file again");
    }
    return upload;
  }

  const sweep = setInterval(() => {
    for (const upload of sessions.values()) {
      if (!upload.busy && Date.now() - upload.touchedAt > SESSION_TTL_MS)
        void cleanup(upload).catch((error) => app.log.warn({ err: error }, "Upload cleanup failed"));
    }
  }, 5 * 60 * 1000);
  sweep.unref?.();
  app.addHook("onClose", async () => {
    clearInterval(sweep);
    await Promise.allSettled([...sessions.values()].map((upload) => cleanup(upload)));
  });

  app.post("/uploads", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    requireUploader(request.authUser);
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "INVALID_UPLOAD", "Provide a valid file name and size");
    const { name, sizeBytes, mimeType } = parsed.data;
    const limitBytes = Math.floor(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024);
    if (sizeBytes > limitBytes || sizeBytes > 2147483647)
      throw new HttpError(413, "FILE_TOO_LARGE", `Maximum file size is ${env.MAX_UPLOAD_SIZE_MB} MB`);
    const originalName = sanitizeFilename(name);
    if (blockedExtensions.has(path.extname(originalName).toLowerCase()))
      throw new HttpError(400, "FILE_TYPE_NOT_ALLOWED", "Executable files are not allowed");
    if ([...sessions.values()].filter((upload) => upload.ownerId === request.authUser.id).length >= MAX_ACTIVE_PER_USER)
      throw new HttpError(429, "UPLOAD_BUSY", "Finish or cancel another upload first");
    const folder = await mkdtemp(path.join(os.tmpdir(), "collab-chunk-"));
    const upload = {
      id: crypto.randomUUID(),
      ownerId: request.authUser.id,
      originalName, sizeBytes, mimeType,
      folder, temp: path.join(folder, "upload"),
      receivedBytes: 0, nextIndex: 0, touchedAt: Date.now(), busy: false,
    };
    sessions.set(upload.id, upload);
    reply.code(201);
    return { success: true, data: { uploadId: upload.id, chunkSize: UPLOAD_CHUNK_BYTES } };
  });

  app.post("/uploads/:uploadId/chunks/:index", {
    config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
  }, async (request) => {
    const upload = findUpload(request);
    if (upload.busy) throw new HttpError(409, "UPLOAD_BUSY", "Another chunk is being processed");
    const index = Number(request.params.index);
    if (!Number.isInteger(index) || index !== upload.nextIndex)
      throw new HttpError(409, "CHUNK_OUT_OF_ORDER", "Upload chunks in sequence");
    upload.busy = true;
    upload.touchedAt = Date.now();
    try {
      const part = await request.file();
      if (!part) throw new HttpError(400, "CHUNK_REQUIRED", "Choose a file chunk");
      const expected = Math.min(UPLOAD_CHUNK_BYTES, upload.sizeBytes - upload.receivedBytes);
      if (expected <= 0) throw new HttpError(400, "CHUNK_UNEXPECTED", "All chunks were already received");
      let received = 0;
      await pipeline(
        part.file,
        new Transform({
          transform(chunk, _encoding, callback) {
            received += chunk.length;
            if (received > expected)
              callback(new HttpError(413, "CHUNK_TOO_LARGE", "Chunk exceeds the expected size"));
            else callback(null, chunk);
          },
        }),
        createWriteStream(upload.temp, { flags: "a" }),
      );
      if (part.file.truncated || received !== expected)
        throw new HttpError(400, "CHUNK_INCOMPLETE", "Chunk is incomplete; restart the upload");
      upload.receivedBytes += received;
      upload.nextIndex++;
      upload.touchedAt = Date.now();
      return { success: true, data: { receivedBytes: upload.receivedBytes } };
    } catch (error) {
      // A partial append must never be mistaken for a completed chunk.
      await cleanup(upload);
      throw error;
    } finally {
      upload.busy = false;
    }
  });

  app.post("/uploads/:uploadId/complete", async (request, reply) => {
    const upload = findUpload(request);
    if (upload.busy) throw new HttpError(409, "UPLOAD_BUSY", "Upload is still in progress");
    if (upload.receivedBytes !== upload.sizeBytes)
      throw new HttpError(400, "UPLOAD_INCOMPLETE", "Some chunks have not arrived");
    upload.busy = true;
    try {
      const hash = crypto.createHash("sha256");
      for await (const chunk of createReadStream(upload.temp)) hash.update(chunk);
      const objectKey = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
      await app.minio.fPutObject(
        env.MINIO_BUCKET_ATTACHMENTS,
        objectKey,
        upload.temp,
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
          if ((usage._sum.sizeBytes || 0) + upload.sizeBytes > env.STORAGE_QUOTA_MB * 1024 * 1024)
            throw new HttpError(413, "STORAGE_QUOTA_EXCEEDED", "Your storage quota has been reached");
          return tx.fileObject.create({
            data: {
              originalName: upload.originalName,
              objectKey,
              bucket: env.MINIO_BUCKET_ATTACHMENTS,
              mimeType: upload.mimeType,
              sizeBytes: upload.sizeBytes,
              checksum: hash.digest("hex"),
              uploadedById: request.authUser.id,
              scanStatus: "PENDING",
            },
          });
        });
      } catch (error) {
        await app.minio.removeObject(env.MINIO_BUCKET_ATTACHMENTS, objectKey).catch(() => {});
        throw error;
      }
      reply.code(201);
      return {
        success: true,
        data: { id: file.id, originalName: file.originalName, sizeBytes: file.sizeBytes, mimeType: file.mimeType },
      };
    } finally {
      await cleanup(upload);
    }
  });

  app.delete("/uploads/:uploadId", async (request) => {
    const upload = findUpload(request);
    if (upload.busy) throw new HttpError(409, "UPLOAD_BUSY", "Upload is still in progress");
    await cleanup(upload);
    return { success: true, data: null };
  });
}
