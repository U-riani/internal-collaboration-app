# Deployment and upgrades

Use Node.js 24 and Docker Compose v2. This release targets one API instance and one worker. Docker execution was not available during artifact verification; test these procedures on a staging host with a restored backup before changing an existing installation.

## Fresh installation

Follow the README. `node scripts/setup.mjs` creates `.env` with unique database, JWT, storage, and administrator secrets. It leaves an existing configuration untouched. The default Compose stack includes PostgreSQL 17, Redis, API, worker, and web; no separate file-storage server is required.

Useful commands:

```sh
docker compose ps
docker compose logs --tail=100 api worker
docker compose exec api node -e "fetch('http://127.0.0.1:3000/health/ready').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
docker compose stop
docker compose start
```

`docker compose down` removes containers/network but preserves named volumes. **Do not use `down -v` on an installation whose data you want to retain.** Keep the Compose project name consistent: changing the directory/project name can select new empty volumes and make existing data appear missing.

## Hosting for your organization

The web port binds to `127.0.0.1:8080` by default. For a shared installation, place your HTTPS reverse proxy on the same host, forwarding the whole site and WebSocket upgrades to this port. Set `APP_ORIGIN` to the exact HTTPS origin and `COOKIE_SECURE=true`; recreate the API container after changing environment variables. A simple single-server HTTP test on a trusted LAN can use `WEB_BIND=0.0.0.0`, the correct `APP_ORIGIN`, and firewall restrictions, but use HTTPS for normal organization access.

`TRUST_PROXY_HOPS=1` trusts the bundled Nginx proxy. Keep the API port private. If an additional proxy fronts Nginx, configure that proxy to sanitize forwarded client-IP headers and deliberately adjust the trust setting for the known proxy chain. Use 0 for direct host-side API development. This affects per-client rate limiting and audit IP addresses.

Keep unique credentials, disable demo seeding, and retain an encrypted copy of `.env`. Store backups outside the application host. Configure storage capacity monitoring, application error logs, health checks, and an organization-specific retention policy. The app itself does not provide automatic backups, malware scanning, MFA, or immutable audit storage.

If `MAX_UPLOAD_SIZE_MB` exceeds 100, also increase `client_max_body_size` in `apps/web/nginx.conf` and any outer proxy; allow for multipart overhead. Quota is `STORAGE_QUOTA_MB` per uploader, including attachments, unlinked uploads, and trash. There is no automatic trash purge.

Before a broader pilot, test two different accounts for each role in `PERMISSIONS.md`, concurrent approval decisions, restore from backup, and your real workload. Update/pin container image digests according to your release process.

## Upgrading the original archive

The uploaded version started with `prisma db push` and stored files in MinIO. This version adds migration history and defaults **new installations** to local storage. Existing objects are not automatically copied between storage drivers.

1. Retain the current `.env`, all database/Redis/MinIO volumes, current container images, and the old code. Record the existing Compose project name. Back up PostgreSQL and the MinIO data together while writes are paused. Do this before replacing containers. Never delete volumes as part of an upgrade.
2. Install this source into the same Compose project, or use the original project name with `docker compose -p YOUR_EXISTING_PROJECT` on **every** command below. Copy your existing `.env`; do not replace database passwords or storage credentials. Preserve `DATABASE_URL` and `REDIS_URL` using the Docker service hostnames. Add/update:

   ```dotenv
   STORAGE_DRIVER=s3
   MINIO_ENDPOINT=minio
   MINIO_PORT=9000
   MINIO_USE_SSL=false
   TRUST_PROXY_HOPS=1
   STORAGE_QUOTA_MB=2048
   SEED_DEMO=false
   ```

   Keep the old bucket name. Set `LEGACY_MINIO_IMAGE` to the exact image/tag or digest used by your existing MinIO installation. The overlay's `latest` fallback exists for archive compatibility; it is not a tested storage-server upgrade. Do not change storage-server versions during the application/database migration.
3. Use the legacy storage overlay consistently. Stop old application writes, build the new application images, and leave existing storage/database services running:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.legacy-storage.yml stop web api worker
   docker compose -f docker-compose.yml -f docker-compose.legacy-storage.yml build api web worker
   docker compose -f docker-compose.yml -f docker-compose.legacy-storage.yml up -d --pull never postgres redis minio
   ```

4. Inspect database migration status:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.legacy-storage.yml run --rm --no-deps api npx prisma migrate status
   ```

   **Only if the database contains the original archive's schema and has no applied migration history**, mark the original schema as already applied:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.legacy-storage.yml run --rm --no-deps api npx prisma migrate resolve --applied 202609160001_initial
   ```

   Baselining records history; it does not create missing tables. Do not run it on an empty database, a schema changed beyond the original archive, or an installation with different migration history. Compare the live schema with the initial migration and reconcile differences first. A fresh database applies both migrations normally and does not need this step.
5. Apply the additive migration before opening the application:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.legacy-storage.yml run --rm --no-deps api npx prisma migrate deploy
   docker compose -f docker-compose.yml -f docker-compose.legacy-storage.yml up -d --pull never
   ```

   Startup synchronizes preset permissions but does not reset existing passwords, roles assigned to users, departments, tasks, messages, or approval content. Old access tokens require a new sign-in because tokens now carry a session ID.
6. Verify sign-in, existing conversations/tasks/approvals, and downloads of old attachments. Upload a new file, share/revoke a folder, and test an approval using a restored staging copy first. Keep the backup until the upgraded installation has been accepted.

For rollback, keep writes paused and restore the matching old application, PostgreSQL backup, and storage snapshot together. There is no automatic down migration; do not blindly run old code against a modified database.

## Storage backends

Fresh Compose installations use `STORAGE_DRIVER=local` and `/data/files` mounted from the `files_data` volume. Never expose this directory through a static route. Back up both it and PostgreSQL, since files use opaque object keys stored in the database.

To keep or configure S3-compatible storage, set `STORAGE_DRIVER=s3`, the endpoint hostname, port, SSL flag, access credentials (the existing `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` variable names are retained), and `MINIO_BUCKET_ATTACHMENTS`. The application needs private-bucket object read/write/delete and bucket-existence access; bucket creation is attempted only if the bucket does not exist. Do not publish the bucket. Prefer scoped credentials for an existing bucket. Validate your provider before use; S3 was not exercised in this verification environment.

Changing `STORAGE_DRIVER` alone does not migrate stored bytes. Preserve each object's bucket/key when copying data, verify checksums/downloads, and keep a rollback copy. For an existing MinIO installation, the supplied `docker-compose.legacy-storage.yml` retains `minio_data` and the service name.

## Backups and restore

These commands avoid binary shell redirection, so they can be used from PowerShell as well as a Unix terminal. They assume the default database/user names; substitute yours if different. Create a fresh `backups` directory and use unique filenames for each run. Retain `.env` separately in protected storage.

For the default **local file backend**, pause all external/API clients and stop web/worker writes. Do not run other administrative clients while the snapshot is made:

```sh
mkdir backups
docker compose stop web worker
docker compose exec -T postgres pg_dump -U collaboration -d collaboration -Fc -f /tmp/collaboration.dump
docker compose cp postgres:/tmp/collaboration.dump backups/collaboration.dump
docker compose exec -T api tar -czf /tmp/files.tar.gz -C /data/files .
docker compose cp api:/tmp/files.tar.gz backups/files.tar.gz
docker compose start worker web
```

Check the exit status of each command; if backup fails, resume the services you paused and investigate. Verify archive sizes and copy successful backups off-host with access restricted to administrators. For **S3/MinIO**, snapshot/version/back up that bucket or volume with its supported tooling while writes are paused; the local-files archive is not a backup of S3 objects. Use both Compose files for legacy commands.

Prove recovery in a **separate, empty staging project**, never by experimenting on live volumes:

1. Restore the saved environment configuration into that project, keeping its database credentials. Use a distinct project name and web port. Build its API/web/worker images.
2. Start PostgreSQL and Redis only. Copy the database backup into PostgreSQL and restore it:

   ```sh
   docker compose up -d postgres redis
   docker compose cp backups/collaboration.dump postgres:/tmp/collaboration.dump
   docker compose exec -T postgres pg_restore -U collaboration -d collaboration --no-owner --exit-on-error /tmp/collaboration.dump
   ```

   This command assumes an empty database; it deliberately does not erase an existing one. If relations already exist, stop and choose the intended empty recovery project.
3. For local files, restore into the empty file volume with a one-off maintenance container, without starting the API:

   ```sh
   docker compose run -d --name workspace-file-restore --no-deps --entrypoint sleep api 3600
   docker cp backups/files.tar.gz workspace-file-restore:/tmp/files.tar.gz
   docker exec workspace-file-restore sh -c "mkdir -p /data/files && tar -xzf /tmp/files.tar.gz -C /data/files"
   docker rm -f workspace-file-restore
   ```

   The named maintenance container shares the current project's API file volume. Choose another unique container name if that name is already in use. Restore S3/MinIO through its own supported tooling instead when that is your configured backend.
4. Start the complete application and verify user counts, task/message history, approval state, file downloads, and permission boundaries. Restoring PostgreSQL also restores the migration history. Redis queues are not the authoritative source of app content; deadline jobs will be recreated by the worker.

## Troubleshooting

- `P3005` / database not empty: an original `db push` installation needs the checked baseline procedure above.
- Empty user list after an upgrade: check the Compose project name and volume selection before creating/resetting data.
- Existing file downloads fail: confirm storage driver, bucket, endpoint, and retained volume match the old installation.
- Cookies do not work: match `APP_ORIGIN` to the browser origin; `COOKIE_SECURE=true` requires HTTPS.
- `prisma` migration/client errors: use the committed lockfiles, Node 24, and `npm run db:generate` after installing dependencies.
- Native database/socket tests cannot bind locally in a restricted environment: run them on a development machine; do not point tests at organization data.
