# Development and deployment notes

## Local development

This branch does not require Docker.

Requirements:

- Node.js 24+
- npm

Install and start:

```bash
npm install
npm run install:all
npm run setup
npm run dev
```

Services:

- React/Vite frontend: `http://localhost:5173`
- Fastify backend: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`

The backend development launcher starts a persistent embedded PGlite database and applies every Prisma SQL migration that has not yet been applied. Uploaded files are stored locally under `apps/api/.local/files`.

No local PostgreSQL, Redis, MinIO, Nginx, or Docker daemon is required.

## Resetting the local environment

Stop the application and delete:

```text
apps/api/.local/
```

Then run `npm run dev` again. The development database and demo content will be recreated.

## External PostgreSQL / production-style backend start

`npm --prefix apps/api start` starts only the Fastify backend and expects its environment to contain a valid `DATABASE_URL` and secure secrets.

Before using that mode:

1. Configure an external PostgreSQL database.
2. Set a unique `JWT_ACCESS_SECRET`.
3. Disable demo seeding and replace all demo credentials.
4. Set `APP_ORIGIN` to the real frontend origin.
5. Set `COOKIE_SECURE=true` when HTTPS is used.
6. Choose local or S3-compatible file storage deliberately.
7. Apply the Prisma migrations before serving traffic.

The in-process presence implementation and integrated deadline scheduler are intentionally suitable for the current single-backend-instance architecture. If the application is later horizontally scaled, distributed presence and background job coordination should be introduced again as infrastructure services.
