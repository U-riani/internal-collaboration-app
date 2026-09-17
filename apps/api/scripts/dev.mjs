import { execFile } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const exec = promisify(execFile);
const apiRoot = path.resolve(import.meta.dirname, "..");
const localRoot = path.join(apiRoot, ".local");
const databaseRoot = path.join(localRoot, "postgres");
const filesRoot = path.join(localRoot, "files");

await mkdir(localRoot, { recursive: true });
await mkdir(filesRoot, { recursive: true });

async function reservePort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const { port } = reservation.address();
  await new Promise((resolve) => reservation.close(resolve));
  return port;
}

async function applyMigrations(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS "_local_dev_migrations" (
      "name" TEXT PRIMARY KEY,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedResult = await db.query(
    'SELECT "name" FROM "_local_dev_migrations" ORDER BY "name"',
  );
  const applied = new Set(appliedResult.rows.map((row) => row.name));
  const migrationsRoot = path.join(apiRoot, "prisma", "migrations");
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const migrations = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    if (applied.has(migration)) continue;
    const sql = await readFile(
      path.join(migrationsRoot, migration, "migration.sql"),
      "utf8",
    );
    console.log(`[database] applying ${migration}`);
    await db.exec(sql);
    await db.query(
      'INSERT INTO "_local_dev_migrations" ("name") VALUES ($1)',
      [migration],
    );
  }
}

async function generatePrismaClient() {
  console.log("[database] generating Prisma client");
  await exec(
    process.execPath,
    ["node_modules/prisma/build/index.js", "generate"],
    {
      cwd: apiRoot,
      env: process.env,
    },
  );
}

async function seedDatabase() {
  if (process.env.DEV_AUTO_SEED === "false") return;
  await exec(process.execPath, ["prisma/seed.js"], {
    cwd: apiRoot,
    env: process.env,
  });
}

const port = await reservePort();
const db = await PGlite.create(databaseRoot);
await applyMigrations(db);
const pg = new PGLiteSocketServer({
  db,
  port,
  host: "127.0.0.1",
  maxConnections: 20,
});
await pg.start();

Object.assign(process.env, {
  NODE_ENV: "development",
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
  API_PORT: "3000",
  APP_ORIGIN: "http://localhost:5173",
  TRUST_PROXY_HOPS: "0",
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ||
    "local-development-secret-change-before-production-123456",
  COOKIE_SECURE: "false",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_PATH: filesRoot,
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

try {
  await generatePrismaClient();
  await seedDatabase();
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
  console.log(`Local DB: ${databaseRoot}`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await pg.stop();
    await db.close();
  };

  process.once("SIGINT", () => shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => shutdown().finally(() => process.exit(0)));
} catch (error) {
  await pg.stop().catch(() => {});
  await db.close().catch(() => {});
  console.error(error);
  process.exit(1);
}
