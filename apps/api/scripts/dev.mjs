import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const { Client } = pg;
const exec = promisify(execFile);
const apiRoot = path.resolve(import.meta.dirname, "..");
const localRoot = path.join(apiRoot, ".local");
const filesRoot = path.join(localRoot, "files");

await mkdir(filesRoot, { recursive: true });

const configuredStoragePath = process.env.STORAGE_LOCAL_PATH?.trim();
const storageLocalPath =
  !configuredStoragePath ||
  configuredStoragePath === "./apps/api/.local/files"
    ? filesRoot
    : path.resolve(apiRoot, configuredStoragePath);

Object.assign(process.env, {
  NODE_ENV: "development",
  API_PORT: process.env.API_PORT || "3000",
  APP_ORIGIN: process.env.APP_ORIGIN || "http://localhost:5173",
  TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS || "0",
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ||
    "local-development-secret-change-before-production-123456",
  COOKIE_SECURE: process.env.COOKIE_SECURE || "false",
  STORAGE_DRIVER: process.env.STORAGE_DRIVER || "local",
  STORAGE_LOCAL_PATH: storageLocalPath,
  MINIO_ROOT_USER: process.env.MINIO_ROOT_USER || "local",
  MINIO_ROOT_PASSWORD:
    process.env.MINIO_ROOT_PASSWORD || "local-development-only",
  SEED_DEMO: process.env.SEED_DEMO || "true",
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || "Admin123!",
  SEED_MANAGER_EMAIL: process.env.SEED_MANAGER_EMAIL || "manager@example.com",
  SEED_MANAGER_PASSWORD: process.env.SEED_MANAGER_PASSWORD || "Manager123!",
  SEED_EMPLOYEE_EMAIL: process.env.SEED_EMPLOYEE_EMAIL || "employee@example.com",
  SEED_EMPLOYEE_PASSWORD:
    process.env.SEED_EMPLOYEE_PASSWORD || "Employee123!",
});

function requirePostgresUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value || value.includes("change_me")) {
    throw new Error(
      "DATABASE_URL must point to a real PostgreSQL database. Update .env before starting the backend.",
    );
  }

  const url = new URL(value);
  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use the postgresql:// or postgres:// scheme.");
  }
  return value;
}

async function verifyPostgres(connectionString) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query("SELECT version() AS version");
    const version = result.rows[0]?.version || "";
    if (!version.startsWith("PostgreSQL")) {
      throw new Error(
        `DATABASE_URL is not connected to PostgreSQL (server reported: ${version || "unknown"}).`,
      );
    }
    console.log(`[database] connected to ${version.split(",")[0]}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function runPrisma(command) {
  await exec(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...command],
    {
      cwd: apiRoot,
      env: process.env,
    },
  );
}

async function prepareDatabase() {
  const connectionString = requirePostgresUrl();
  await verifyPostgres(connectionString);

  console.log("[database] generating Prisma client");
  await runPrisma(["generate"]);

  console.log("[database] applying PostgreSQL migrations");
  await runPrisma(["migrate", "deploy"]);

  if (process.env.DEV_AUTO_SEED !== "false") {
    console.log("[database] seeding development data");
    await exec(process.execPath, ["prisma/seed.js"], {
      cwd: apiRoot,
      env: process.env,
    });
  }
}

try {
  await prepareDatabase();

  const { buildApp } = await import("../src/app.js");
  const { env } = await import("../src/config/env.js");
  const { startDeadlineNotificationScheduler } = await import(
    "../src/lib/deadline-notifications.js"
  );

  const app = await buildApp();
  const stopDeadlineScheduler = startDeadlineNotificationScheduler(
    app.prisma,
    app.log,
  );
  app.addHook("onClose", async () => stopDeadlineScheduler());

  await app.listen({ host: "127.0.0.1", port: env.API_PORT });
  console.log(`Backend:  http://localhost:${env.API_PORT}`);
  console.log(`API docs: http://localhost:${env.API_PORT}/docs`);
  console.log("Database: PostgreSQL");

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };

  process.once("SIGINT", () => shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => shutdown().finally(() => process.exit(0)));
} catch (error) {
  console.error(error);
  process.exit(1);
}
