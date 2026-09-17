# Workspace — Internal Collaboration App

Version 0.2.0. A self-hosted, single-organization collaboration app based on your original project: a React frontend, Node.js/Fastify API, PostgreSQL database, and background worker.

## What is included

| Module | Working features |
| --- | --- |
| Drive | Upload/download, nested folders, rename, move, search, sharing with people/departments, viewer/editor access, trash and restore |
| Tasks | Create, assign, deadlines, priorities, list/board views, status updates, participants, comments, attachments, activity history |
| Messages | Direct/group conversations, member management, persistent real-time messages, replies, edit/delete, search, earlier-message pagination, unread counts |
| Approvals | Form builder, sequential reviewers, drafts, submit, approve/reject/request changes, revise/resubmit, attachments, comments, previous review rounds |
| Administration | Employees, departments, reporting managers, preset roles, account deactivation, audit viewer |
| Account | Password sign-in, rotating refresh sessions, password changes and session revocation |
| Overview and inbox | Work summary, notifications, deadline reminders from the worker |

This is a functional foundation for an internal pilot, not full Lark feature parity. See [implementation limits](docs/IMPLEMENTATION_STATUS.md) and [verification results](docs/VERIFICATION.md), including the [dependency review](docs/DEPENDENCIES.md).

## Backend choice

Keep **Node.js with Fastify**. Your source already uses it; keeping one JavaScript stack avoids a backend rewrite and fits the existing Socket.IO chat implementation. Express or FastAPI could implement these features, but neither is necessary to fix this project. The API remains modular so a separate Python service can be introduced later for data processing or ERP integrations.

## Fresh installation

Requirements: **Node.js 24+**, Docker with Compose v2, and access to the npm/container registries. These commands work in a terminal or PowerShell from the extracted project folder:

```sh
node scripts/setup.mjs
docker compose up --build -d
```

Open **http://localhost:8080**. Read `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from your newly created `.env`, then sign in. The setup script generates unique secrets; it never replaces an existing `.env`.

The initial administrator is created only when the database has no users. Use **Administration** to create departments/users and assign reporting managers; use **Approvals → Request types** to define your first workflow. Users can change their password under **My account**.

The API applies committed Prisma migrations on startup. PostgreSQL data and uploaded files live in persistent Docker volumes. The default file backend is private local disk; only authenticated API downloads can read files. Database and Redis ports are not published.

**Already running the original project? Read [the upgrade guide](docs/DEPLOYMENT.md#upgrading-the-original-archive) before starting this version.** Existing databases created with `db push` must be baselined, and existing MinIO files must keep their storage configuration.

### Local demo

For a new, disposable installation only, run this instead of the ordinary setup command:

```sh
node scripts/setup.mjs --demo
docker compose up --build -d
```

| Role | Email | Demo-only password |
| --- | --- | --- |
| Administrator | admin@example.com | Admin123! |
| Manager | manager@example.com | Manager123! |
| Employee | employee@example.com | Employee123! |

Demo mode creates an equipment approval workflow, a department conversation, and a task. It is off by default. Setting `SEED_DEMO=true` later does not add/reset accounts in a populated database. Never use these demo credentials for organization data.

## Local development

Run PostgreSQL 17 and Redis locally, or use the development overlay to publish their ports on loopback:

```sh
node scripts/setup.mjs
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
npm ci
npm run install:all
```

For host-side development, edit `.env`:

- `DATABASE_URL`: use `localhost:5432` with the generated database password.
- `REDIS_URL=redis://localhost:6379`
- `APP_ORIGIN=http://localhost:5173`
- `STORAGE_DRIVER=local`
- `STORAGE_LOCAL_PATH=./data/files` (relative to `apps/api` when using npm scripts).
- `TRUST_PROXY_HOPS=0`

Then:

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Frontend: http://localhost:5173. API: http://localhost:3000. Route browser: http://localhost:3000/docs. The route browser does not yet describe every Zod request body; [API_OVERVIEW.md](docs/API_OVERVIEW.md) contains the request contracts.

Use `npm run db:migrate` to author new development migrations. Use `db:deploy` for an existing deployment; do not use `db:push` as a production upgrade method.

## Verification

```sh
npm test
npm run check
```

Tests use an isolated PGlite PostgreSQL engine, real Prisma queries, local file storage, live Socket.IO connections, and React component tests. They do not require your production database. The worker's Redis/BullMQ runtime and Docker startup require testing on your Docker host. See [VERIFICATION.md](docs/VERIFICATION.md).

## Source layout

- `apps/web/src`: pages, components, session handling, and real-time query updates.
- `apps/api/src/routes`: HTTP endpoints for each module.
- `apps/api/src/lib`: authorization, Drive inheritance, validation, storage, and notifications.
- `apps/api/prisma`: schema, migration history, and non-resetting seed script.
- `apps/api/tests`: permission and workflow regression tests.
- `apps/web/tests`: component interaction tests.
- `apps/worker`: scheduled task deadline notifications.
- `docs`: deployment, permissions, API reference, and limitations.

Start with [DEPLOYMENT.md](docs/DEPLOYMENT.md) for shared-server hosting, upgrades, backups, and S3 storage. See [PERMISSIONS.md](docs/PERMISSIONS.md) before assigning organization roles.
