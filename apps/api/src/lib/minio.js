import { env } from "../config/env.js";

// Legacy S3-compatible adapter is loaded only when explicitly configured.
// The default local-storage installation never loads the MinIO SDK.
export async function createS3Storage() {
  const { Client } = await import("minio");
  const client = new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ROOT_USER,
    secretKey: env.MINIO_ROOT_PASSWORD,
  });
  const exists = await client.bucketExists(env.MINIO_BUCKET_ATTACHMENTS);
  if (!exists) await client.makeBucket(env.MINIO_BUCKET_ATTACHMENTS);
  return client;
}
