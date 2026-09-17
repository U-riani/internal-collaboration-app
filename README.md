# Internal Collaboration App

Version 0.2.0. Internal collaboration application with a React/Vite frontend and a Node.js/Fastify backend.

The `dev` branch is optimized for a **classic local development workflow**. Docker is not required.

## Development architecture

- **Frontend:** React + Vite + Tailwind, `http://localhost:5173`
- **Backend:** Node.js + Fastify, `http://localhost:3000`
- **Database:** persistent embedded PGlite database started by the backend development command
- **Files:** local private storage under `apps/api/.local/files`
- **Realtime:** Socket.IO from the backend
- **Presence:** in-process presence store for a single local backend instance
- **Deadline notifications:** scheduled inside the backend process

The frontend keeps the existing Vite proxy, so `/api` and `/socket.io` requests are forwarded to the backend during development.

## Features

- Authentication and session refresh
- Role and permission control
- User and department administration
- Direct and group conversations
- Realtime messages, typing events, and presence
- Tasks and task history
- Deadline notifications
- Approval workflows
- Internal Drive and file uploads/downloads
- Audit and notification screens

## Requirements

- Node.js 22.19+
- npm

No Docker Desktop, local PostgreSQL server, Redis server, or MinIO server is required for development.

## First start

From the project root:

```bash
npm install
npm run install:all
npm run setup
npm run dev
```

Open:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/health/ready`
- API docs: `http://localhost:3000/docs`

`npm run setup` creates a local `.env` if one does not already exist. The app can also start in development without running setup because safe local defaults are provided by the development launcher.

The backend development launcher automatically generates Prisma Client before seeding the local database, so a separate `prisma generate` step is normally not required.

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

# Generate Prisma Client manually if needed
npm run db:generate

# Tests
npm test

# Static checks/build
npm run check

# Production frontend build
npm run build
```

## Local development data

The backend stores development data in:

```text
apps/api/.local/
├── postgres/   # embedded persistent database
└── files/      # uploaded files
```

This directory is ignored by Git.

To reset only your local development data, stop the app and delete `apps/api/.local/`. The next `npm run dev` recreates the database, applies the Prisma SQL migrations, generates Prisma Client, and seeds the local demo data.

## Running the backend with an external PostgreSQL database

The normal backend start command still supports an external PostgreSQL database:

```bash
npm --prefix apps/api start
```

For that mode, set a valid `DATABASE_URL` and production-safe secrets in `.env`. Local development does not use the example `DATABASE_URL`; it replaces it with the embedded database connection at startup.

## Project structure

```text
apps/
├── api/     # Fastify backend, Prisma schema/migrations, local dev database launcher
└── web/     # React + Vite + Tailwind frontend

docs/       # Project documentation
scripts/    # Root setup helpers
```

The previous Docker Compose files, Dockerfiles, Nginx container config, Redis worker, and MinIO development requirement were removed from the development branch. User-facing UI and application routes remain in their existing locations.
