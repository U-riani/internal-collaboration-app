import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: booleanFromString,
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("s3"),
  STORAGE_LOCAL_PATH: z.string().default("./data/files"),
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: booleanFromString,
  MINIO_ROOT_USER: z.string().min(1),
  MINIO_ROOT_PASSWORD: z.string().min(8),
  MINIO_BUCKET_ATTACHMENTS: z.string().default("attachments"),
  // FileObject.sizeBytes is currently a PostgreSQL/Prisma Int, so keep a
  // single stored file below the signed 32-bit byte limit (~2 GiB).
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(2047).default(1024),
  // Spreadsheet snapshots are JSON and are parsed in memory. Keep this
  // separate from streaming file uploads so large Drive files do not force
  // every JSON endpoint to accept multi-gigabyte request bodies.
  MAX_SHEET_SNAPSHOT_MB: z.coerce.number().positive().max(512).default(256),
  STORAGE_QUOTA_MB: z.coerce.number().positive().default(10240),
  LOG_LEVEL: z.string().default("info"),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error(
    "Invalid environment configuration:",
    result.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = result.data;
