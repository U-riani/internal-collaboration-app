# Project description

Workspace is a self-hosted internal collaboration application for one organization, expanded from the uploaded React/Fastify project. It covers Drive, tasks, direct/group messages, sequential approvals, and role/resource permissions.

The browser calls a modular Node.js/Fastify API. PostgreSQL stores application records, file metadata, sessions, and permissions. Private disk storage is the fresh-install default; an existing S3-compatible backend remains supported. Socket.IO sends live events after server-side authorization. Redis supports presence and BullMQ; the worker creates deadline notifications.

The backend remains JavaScript with Fastify because it is already the project's working foundation. Rewriting in Express or Python would add migration work without being necessary for the requested modules.

This is a foundation for an internal pilot. See the README for setup, `PERMISSIONS.md` for access rules, and `IMPLEMENTATION_STATUS.md` for precise limits and unfinished areas.
