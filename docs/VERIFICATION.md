# Verification report — 0.2.0

Completed on 16 September 2026 against the delivered source and lockfiles.

## Passed

- **12 API/unit/integration tests** using Node's test runner.
- **4 React component interaction tests** using Vitest, Testing Library, and jsdom.
- API and worker Prisma client generation with the final dependency overrides.
- Prisma CLI schema validation, plus API/worker schema WASM checks: 28 models, 14 enums.
- API JavaScript syntax check: 30 source files; worker syntax check.
- React/Vite production build after the React Router update.
- All three Compose YAML files parsed; API/worker schemas match exactly.
- Manifest/lockfile versions, dependencies, and Node engines match; npm resolution URLs use the public registry.
- Seed rerun preserves an edited user name, password hash, assigned roles, and user/task/message counts.

## API and real-time coverage

The integration harness applies both committed SQL migrations to an isolated PGlite PostgreSQL engine and runs the real Fastify API, Prisma queries, authentication, and local file storage. Live Socket.IO tests connect over a local WebSocket listener. Redis presence calls use a small test double.

Covered behaviors include:

- Token generation, password verification, task access rules, and actual login.
- Unauthorized task reads and task-event recipients.
- Foreign attachment IDs rejected in tasks, messages, and approvals; Unicode file download.
- Drive inheritance, viewer/editor rules, owner-only sharing, revoke, trash/restore, cycle prevention, and no administrator bypass for private files.
- Required/typed approval fields, sequential reviewer permissions, simultaneous/stale decisions, corrections/resubmission, preserved review rounds, and finalized-request edit rejection.
- Removed conversation members losing message and attachment access.
- Logout, account deactivation, password change, refresh replay, and socket revocation.
- Non-members unable to join chat rooms or send typing events; removed members excluded from new messages.
- Local-storage readiness and executable, empty, and oversized upload rejection.

## Component coverage

The component tests exercise the real React pages with mocked API responses: folder creation and list refresh, new-conversation selection and message destination, employee task assignee restrictions, and typed approval submission. Dialog open/close and scrolling are shimmed for jsdom. These are component tests, not browser end-to-end or visual tests.

## Remaining verification

Docker was unavailable in this environment. Containers, native PostgreSQL `prisma migrate deploy`, real Redis/BullMQ jobs, HTTPS/reverse proxies, S3/MinIO compatibility, storage migration, and backup/restore procedures were **not executed here**. The SQL migrations were applied by the test harness; that is not a substitute for testing Prisma's migration-history/baseline procedure on a native PostgreSQL staging copy.

The browser could not reach the local preview (`ERR_BLOCKED_BY_CLIENT`), so there is no completed real-browser visual, responsive-layout, or accessibility verification. Check the supplied screens in desktop/mobile browsers on your development host before the pilot.

The PGlite/Prisma tests emit a pg concurrent-query deprecation warning. No tests failed, but evaluate it before any future pg major upgrade. No load, penetration, malware-scanning, container-image, or disaster-recovery certification is claimed. See `DEPENDENCIES.md` for the completed production npm dependency audit and remaining optional S3 SDK findings.

## Reproduce

After installing the committed dependencies and generating Prisma clients as described in the README:

```sh
npm test
npm run check
```

Tests create disposable databases and file directories and do not connect to organization data. Run Docker and upgrade/restore acceptance checks on a separate staging installation using `DEPLOYMENT.md`.
