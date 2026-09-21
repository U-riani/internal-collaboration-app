import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const { Client } = pg;
const exec = promisify(execFile);

function testDatabaseUrl(baseUrl, schema) {
  const url = new URL(baseUrl);
  const options = `-c search_path=${schema}`;
  url.searchParams.set("schema", schema);
  url.searchParams.set("options", options);
  return url.toString();
}

export async function harness() {
  const baseDatabaseUrl = process.env.DATABASE_URL?.trim();
  if (!baseDatabaseUrl)
    throw new Error(
      "DATABASE_URL must point to PostgreSQL before running API tests.",
    );

  const dir = await mkdtemp(path.join(os.tmpdir(), "collab-test-"));
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: baseDatabaseUrl });
  await admin.connect();

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } catch (error) {
    await admin.end().catch(() => {});
    await rm(dir, { recursive: true, force: true });
    throw error;
  }

  const databaseUrl = testDatabaseUrl(baseDatabaseUrl, schema);
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: "test-only-jwt-secret-not-for-production-1234567890",
    MINIO_ROOT_USER: "test",
    MINIO_ROOT_PASSWORD: "test-only-password",
    LOG_LEVEL: "error",
    SEED_DEMO: "true",
    SEED_ADMIN_EMAIL: "admin@example.com",
    SEED_ADMIN_PASSWORD: "Admin123!",
    SEED_MANAGER_EMAIL: "manager@example.com",
    SEED_MANAGER_PASSWORD: "Manager123!",
    SEED_EMPLOYEE_EMAIL: "employee@example.com",
    SEED_EMPLOYEE_PASSWORD: "Employee123!",
    APP_ORIGIN: "http://localhost:5173",
    MAX_UPLOAD_SIZE_MB: "2",
  });

  const apiRoot = path.resolve(import.meta.dirname, "../..");
  try {
    await exec(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        cwd: apiRoot,
        env: process.env,
      },
    );
    await exec(process.execPath, ["prisma/seed.js"], {
      cwd: apiRoot,
      env: process.env,
    });
  } catch (error) {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }

  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const { localStorage } = await import("../../src/lib/local-storage.js");
  const storage = localStorage(path.join(dir, "files"));
  const cache = new Map();
  const redis = {
    async set(key, value) {
      cache.set(key, value);
    },
    async del(key) {
      cache.delete(key);
    },
    async ping() {
      return "PONG";
    },
  };
  const { buildApp } = await import("../../src/app.js");
  const app = await buildApp({ prisma, minio: storage, redis });

  async function login(email, password) {
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password },
    });
    if (result.statusCode !== 200) throw new Error(result.body);
    return {
      ...result.json().data,
      cookie: result.headers["set-cookie"].split(";")[0],
    };
  }

  let users;
  try {
    users = {
      admin: await login("admin@example.com", "Admin123!"),
      manager: await login("manager@example.com", "Manager123!"),
      employee: await login("employee@example.com", "Employee123!"),
    };
  } catch (error) {
    await app.close();
    await prisma.$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }

  const call = (actor, method, url, payload) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: actor ? { authorization: `Bearer ${actor.accessToken}` } : {},
      ...(payload === undefined ? {} : { payload }),
    });

  async function upload(
    actor,
    name = "report.txt",
    content = "Internal report",
  ) {
    const boundary = "collab-test-boundary";
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/files",
      headers: {
        authorization: `Bearer ${actor.accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`,
      ),
    });
    return result;
  }

  async function close() {
    await app.close();
    await prisma.$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
  }

  return { app, prisma, users, call, upload, login, close };
}
