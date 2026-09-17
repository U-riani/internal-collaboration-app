import { randomBytes } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const filename = path.join(root, ".env");
try {
  await access(filename);
  console.log("A .env file already exists. It was left unchanged.");
  process.exit(0);
} catch {}
const demo = process.argv.includes("--demo");
const secret = () => randomBytes(24).toString("hex");
let text = await readFile(path.join(root, ".env.example"), "utf8");
const databasePassword = secret();
const settings = {
  POSTGRES_PASSWORD: databasePassword,
  DATABASE_URL: `postgresql://collaboration:${databasePassword}@postgres:5432/collaboration?schema=public`,
  JWT_ACCESS_SECRET: secret(),
  MINIO_ROOT_PASSWORD: secret(),
  SEED_ADMIN_PASSWORD: demo ? "Admin123!" : secret(),
  SEED_DEMO: String(demo),
  SEED_MANAGER_PASSWORD: demo ? "Manager123!" : secret(),
  SEED_EMPLOYEE_PASSWORD: demo ? "Employee123!" : secret(),
};
for (const [key, value] of Object.entries(settings))
  text = text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
await writeFile(filename, text, { mode: 0o600, flag: "wx" });
console.log(
  "Created .env with fresh secrets. The initial administrator email and password are in that file.",
);
console.log(
  demo
    ? "Demo accounts are enabled for local evaluation only."
    : "Demo accounts are disabled.",
);
console.log("Start: docker compose up --build -d");
