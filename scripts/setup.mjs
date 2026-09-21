import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const filename = path.join(root, ".env");

try {
  await access(filename);
  console.log("A .env file already exists. It was left unchanged.");
  process.exit(0);
} catch {}

let text = await readFile(path.join(root, ".env.example"), "utf8");
const secret = randomBytes(32).toString("hex");
text = text.replace(
  /^JWT_ACCESS_SECRET=.*$/m,
  `JWT_ACCESS_SECRET=${secret}`,
);

await writeFile(filename, text, { mode: 0o600, flag: "wx" });
console.log("Created .env for local development.");
console.log("PostgreSQL is required. Update DATABASE_URL in .env before starting.");
console.log("Install dependencies: npm install && npm run install:all");
console.log("Start frontend + backend: npm run dev");
console.log("Frontend: http://localhost:5173");
console.log("Backend:  http://localhost:3000");
