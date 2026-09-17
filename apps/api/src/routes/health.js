import { env } from "../config/env.js";
export default async function healthRoutes(app) {
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      await app.redis.ping();
      const storage = app.minio.health
        ? await app.minio.health()
        : await app.minio.bucketExists(env.MINIO_BUCKET_ATTACHMENTS);
      if (!storage) throw new Error("Storage unavailable");
      return {
        status: "ready",
        dependencies: { postgres: true, redis: true, storage: true },
      };
    } catch {
      reply.code(503);
      return { status: "not_ready" };
    }
  });
}
