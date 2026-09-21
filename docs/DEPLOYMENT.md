# Deployment

This document covers the production deployment used by the `prod` branch.

## Architecture

Production runs as a single-host Docker Compose stack:

- `postgres`: PostgreSQL 17 with a persistent named volume.
- `api`: Fastify + Prisma. Prisma migrations run before the API starts.
- `web`: production React build served by Nginx. Nginx proxies `/api` and `/socket.io` to the API.
- `cloudflared`: optional remotely managed Cloudflare Tunnel profile.
- `files_data`: persistent private storage for Drive files and attachments.

Only Nginx is bound to the host, and only on `127.0.0.1:8080` by default. PostgreSQL and the API do not publish host ports.

## Server prerequisites

The intended Windows host uses WSL2 with Ubuntu, systemd, Git, Docker Engine, and the Docker Compose plugin.

Keep the production clone in the Linux filesystem, for example:

```bash
cd ~/apps/internal-collaboration-app
git switch prod
```

Do not install Node.js, PostgreSQL, or Nginx separately on the host.

## Configure production environment

Create the untracked production environment file:

```bash
cp .env.production.example .env.production
nano .env.production
```

At minimum, replace:

- `POSTGRES_PASSWORD`
- `APP_ORIGIN`
- `JWT_ACCESS_SECRET`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

Useful secret generators:

```bash
openssl rand -hex 24
openssl rand -hex 48
```

Use a URL-safe PostgreSQL password because Compose inserts it into `DATABASE_URL`.

## Start and test without Cloudflare

Build and start PostgreSQL, API, and Nginx:

```bash
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

Check status:

```bash
docker compose --env-file .env.production -f compose.production.yml ps
```

Test Nginx locally on the server:

```bash
curl http://127.0.0.1:8080/healthz
```

View logs when needed:

```bash
docker compose --env-file .env.production -f compose.production.yml logs -f --tail=200
```

## Create the first administrator

After the API is healthy, run the seed once:

```bash
docker compose --env-file .env.production -f compose.production.yml exec api npm run db:seed
```

With `SEED_DEMO=false`, an empty production database receives the system roles, permissions, IT department, and the single administrator configured in `.env.production`. Existing user/content data is preserved on later seed runs.

## Cloudflare Tunnel

Create a remotely managed Cloudflare Tunnel in Cloudflare and configure the public hostname, for example:

```text
https://collab.example.com
```

The tunnel origin service must be:

```text
http://web:80
```

This works because `cloudflared` and `web` share the Docker `edge` network.

Copy the tunnel token into:

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJ...
```

Make sure `APP_ORIGIN` exactly matches the public HTTPS origin and keep `COOKIE_SECURE=true`.

Start the tunnel profile:

```bash
docker compose --env-file .env.production -f compose.production.yml --profile tunnel up -d
```

Cloudflare Tunnel makes an outbound connection, so no router port-forwarding is required.

## Updating production

From the production clone:

```bash
git pull --ff-only origin prod
docker compose --env-file .env.production -f compose.production.yml up -d --build
```

Prisma migration deployment runs automatically before the API starts.

## Useful operations

Service status:

```bash
docker compose --env-file .env.production -f compose.production.yml ps
```

API logs:

```bash
docker compose --env-file .env.production -f compose.production.yml logs -f api
```

Nginx logs:

```bash
docker compose --env-file .env.production -f compose.production.yml logs -f web
```

Cloudflare logs:

```bash
docker compose --env-file .env.production -f compose.production.yml --profile tunnel logs -f cloudflared
```

Stop containers without deleting persistent data:

```bash
docker compose --env-file .env.production -f compose.production.yml down
```

Never use `down -v` on production unless you intentionally want to delete Docker volumes.

## Database backup

Create a backup directory and dump PostgreSQL:

```bash
mkdir -p backups
docker compose --env-file .env.production -f compose.production.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "backups/collaboration-$(date +%Y%m%d-%H%M%S).sql"
```

The `files_data` volume must also be backed up because database metadata alone does not contain uploaded file bytes.

## Windows / WSL restart note

Docker containers use `restart: unless-stopped`, so they restart when Docker starts. A Windows host still needs WSL/Ubuntu to be started automatically after a Windows reboot. Configure that separately before treating this machine as an unattended 24/7 server.

## Local development

Local development remains separate from this production stack. Continue using the development workflow documented in the root README on the `dev` branch.
