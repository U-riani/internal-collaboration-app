# Application description

The application is a single-organization internal collaboration system with a React/Vite frontend and a Node.js/Fastify backend.

The browser communicates with the backend through REST endpoints and Socket.IO. Prisma manages the PostgreSQL-compatible data model. In local development the backend starts a persistent embedded PGlite database, so a separate PostgreSQL installation is not required. Files use private local disk storage by default, while the existing S3-compatible storage implementation remains available for future external deployments.

The backend provides authentication, role/permission checks, organization administration, Drive, tasks, approvals, notifications, conversations, and realtime messaging. Presence is maintained in-process for the current single-backend-instance development architecture. Task-deadline notification scanning also runs inside the backend process, replacing the previous Redis/BullMQ worker for local development.
