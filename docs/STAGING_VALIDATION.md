# collab-production — isolated Staging validation

Do not point staging to the live PostgreSQL DB or mount production volumes.

## Isolated setup

compose.staging.yml has a separate Compose project, private network,
PostgreSQL volume and file volume. It has NO Cloudflare Tunnel service.
Only 127.0.0.1:18080 is exposed on the host.

1. Copy: `cp .env.staging.example .env.staging`.
2. Replace ALL sample DB, JWT, storage and administrator credentials. Never
   copy production credentials, VAPID keys or FCM service accounts.
3. Validate and start on a suitable development host (not Production):
   ```bash
   docker compose --env-file .env.staging -f compose.staging.yml config --quiet
   docker compose --env-file .env.staging -f compose.staging.yml up -d --build
   docker compose --env-file .env.staging -f compose.staging.yml ps
   docker compose --env-file .env.staging -f compose.staging.yml logs --tail=80 api
   ```
4. Once the containers and isolated database are verified, initialize one
   Staging admin with the staging-only seed credentials (SEED_DEMO=false):
   ```bash
   docker compose --env-file .env.staging -f compose.staging.yml exec api npm run db:seed
   ```
5. Open http://localhost:18080. The API automatically runs Prisma db:deploy.

HTTP localhost staging is **not** a public HTTPS browser push test.
VAPID and FCM credentials are intentionally blank. Test provider delivery
later with distinct Staging keys and a distinct HTTPS origin.

## Acceptance checklist

- [ ] Health/readiness, migration history on fresh PostgreSQL 17
- [ ] Login/logout, JWT refresh rotation, session expiration, password change
- [ ] Android mobile refresh/exchange and user access control
- [ ] Messages: groups, DM, replies, reactions, pin and Socket.IO authorization
- [ ] Notifications: realtime, read state, correct deep links and priority
- [ ] Tasks: statuses, groups, comments, attachments and permissions
- [ ] Approvals: workflows, request types, bases, access control
- [ ] Drive: Personal/Shared/Shared With Me/Trash, sharing and restore
- [ ] Univer: spreadsheet import/export and permission enforcement
- [ ] Upload: multiple, >16MiB, >100MiB, chunk retry and byte integrity
- [ ] Four themes, modals, responsive behavior
- [ ] Web Push / Android FCM only with staging-only keys and HTTPS
- [ ] Backup/restore/rollback rehearsals against staging-only volumes

## Known issues / unverified risks

1. Drive `uploadFileWithProgress()` currently posts the entire file to
   `/files` without chunking. Large files can fail behind a proxy.
2. Group creation/member addition emits `conversation:updated`, but doesn't
   generate a group-invitation Inbox notification (pre-existing gap).
3. CI cannot prove real browsers, actual external FCM/Web Push services,
   Cloudflare ingress or large-upload behavior.
4. The full Backend CI suite appears long-running. Use the categorized
   `backend-regression.yml` matrix with bounded concurrency to isolate it.

To stop Staging only:
```bash
docker compose --env-file .env.staging -f compose.staging.yml down
```
Never casually use `down -v`, and never substitute Production compose/env.
