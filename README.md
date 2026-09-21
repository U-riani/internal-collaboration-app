# Internal Collaboration App

Version 0.2.0. Internal collaboration application with a React/Vite frontend and a Node.js/Fastify backend.

The `dev` branch uses a classic local workflow with a real PostgreSQL database. Docker is optional and is not required by the application itself.

## Development architecture

- **Frontend:** React + Vite + Tailwind, `http://localhost:5173`
- **Backend:** Node.js + Fastify, `http://localhost:3000`
- **Database:** PostgreSQL through Prisma + `@prisma/adapter-pg`
- **Files:** local private storage under `apps/api/.local/files` by default
- **Realtime:** Socket.IO from the backend
- **Presence:** in-process presence store for a single local backend instance
- **Deadline notifications:** scheduled inside the backend process

The frontend Vite proxy forwards `/api` and `/socket.io` requests to the backend during development.

## Features

- Authentication and session refresh
- Role and permission control
- User and department administration
- Direct and group conversations
- Realtime messages, typing events, receipts, and presence
- Tasks and task history
- Deadline notifications
- Approval workflows
- Internal Drive and file uploads/downloads
- Audit and notification screens

## Requirements

- Node.js 22.19+
- npm
- PostgreSQL

Redis and MinIO are not required for the default local development workflow.

## PostgreSQL setup

Create a PostgreSQL database and user. One example is:

```sql
CREATE USER collaboration WITH PASSWORD 'choose_a_password';
CREATE DATABASE collaboration OWNER collaboration;
```

Then configure the root `.env`:

```env
DATABASE_URL=postgresql://collaboration:choose_a_password@127.0.0.1:5432/collaboration?schema=public
```

The database user should own the development database. API integration tests create and remove temporary PostgreSQL schemas inside this database.

## First start

From the project root:

```bash
npm install
npm run install:all
npm run setup
```

If `.env` was just created, update `DATABASE_URL` with your PostgreSQL credentials before starting.

Then run:

```bash
npm run dev
```

Open:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/health/ready`
- API docs: `http://localhost:3000/docs`

The backend development command now:

1. verifies that `DATABASE_URL` points to PostgreSQL;
2. generates Prisma Client;
3. runs `prisma migrate deploy`;
4. seeds demo data when `DEV_AUTO_SEED` is not `false`;
5. starts Fastify.

It does not start or use PGlite.

## Demo accounts

The default local development seed contains:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@example.com` | `Admin123!` |
| Manager | `manager@example.com` | `Manager123!` |
| Employee | `employee@example.com` | `Employee123!` |

These credentials are for local development only.

## Useful commands

```bash
# Run frontend + backend
npm run dev

# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend

# Generate Prisma Client
npm run db:generate

# Create/develop migrations
npm run db:migrate

# Apply committed migrations
npm --prefix apps/api run db:deploy

# Tests (uses PostgreSQL configured in .env)
npm test

# Static checks/build
npm run check

# Production frontend build
npm run build
```

## Local development data

Application records are stored in PostgreSQL.

Local file uploads are stored by default in:

```text
apps/api/.local/files/
```

The old `apps/api/.local/postgres/` PGlite directory is no longer used and can be deleted after moving to PostgreSQL.

To reset application data, reset the PostgreSQL development database and rerun migrations/seeding rather than deleting `apps/api/.local/`.

## Running the backend

Development:

```bash
npm run dev:backend
```

Normal backend start:

```bash
npm --prefix apps/api start
```

Both modes use the PostgreSQL `DATABASE_URL` from the root `.env`.

For production, use production-safe JWT secrets, secure cookies, a production PostgreSQL instance, and the appropriate storage configuration.

## Project structure

```text
apps/
├── api/     # Fastify backend, Prisma schema/migrations, PostgreSQL access
└── web/     # React + Vite + Tailwind frontend

docs/       # Project documentation
scripts/    # Root setup helpers
```
