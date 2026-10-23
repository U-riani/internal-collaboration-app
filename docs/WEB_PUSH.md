# Web Push Notifications — diagnostics and deployment

Branch: `prod-notification-sound`. **Web React/Vite only**, not Flutter.

## What is supported

- Windows desktop: Chrome, Edge and other compatible browsers
- Android: compatible browsers over HTTPS
- iOS/iPadOS 16.4+: **installed Home Screen web app only**
  (Safari → Share → Add to Home Screen → open the new icon)
- Push for new messages/reactions, task assignments/comments/deadlines,
  approvals, and system events created through the shared notification helper.
- Each user must grant permission separately **for each browser/device**.
- Background sounds are controlled by the browser/operating system.
  Web Audio's four custom sounds apply to foreground real-time events.

The service worker always shows a notification for a delivered push, including
when a tab is focused. This is intentional: WebKit can revoke subscriptions
when push events are silently consumed. Foreground notifications might
therefore appear both inside the app and as an OS notification.

## Installation

1. Pull the branch into a Git clone:
   `git fetch origin && git switch prod-notification-sound && git pull --ff-only`
2. Install Node >=22.19.0 and the project dependencies:
   `npm.cmd install`, then `npm.cmd run install:all`.
3. Generate real keys, **once per environment**:
   `node apps/api/scripts/generate-vapid-keys.mjs`
4. Put the values in **the running backend's environment**:
   ```dotenv
   PUSH_VAPID_PUBLIC_KEY=<generated public key>
   PUSH_VAPID_PRIVATE_KEY=<generated private key>
   PUSH_VAPID_SUBJECT=mailto:your-real-contact@example.com
   ```
   For local `npm.cmd run dev`, use the repository root `.env`. For
   production Docker Compose, put them in the backend's `.env.production`.
   Never commit or share the private key. Keep one keypair between restarts.
   After changing keys, restart the backend.
5. Set `DATABASE_URL` to a **development database**, never production, for
   local testing. The local dev command generates the Prisma client and
   deploys migrations automatically, including the `PushSubscription`
   and `PushDelivery` tables.
6. Run `npm.cmd run dev`. Backend should listen at
   `http://localhost:3000`, frontend at `http://localhost:5173`.
   Vite uses a strict port to catch old processes already occupying 5173.

Production API Docker entry point applies migrations automatically; inspect
server deployment procedures and run with appropriate database backups.

## Windows / Chrome verification

1. Ensure **both** the frontend and backend are running.
   A previous `npm ci` failure can leave `pg` or Prisma dependencies
   missing and prevent the API from starting. Fix that first.
2. Open `http://localhost:5173` (localhost is a secure browser context).
3. Log in and go to **My Account → Web push notifications**.
4. Confirm:
   - Browser support: **Supported**
   - Backend VAPID: **Valid**
   - Permission: **granted** (after enabling)
   - Browser subscription: **Present**
   - Current account/session: **Linked**
5. Click **Send test notification**. It sends a real push to the current
   browser via the upstream push gateway, even while the tab is visible.
   The UI displays the actual gateway HTTP status.
6. If gateway accepts it (typically HTTP 201/202), check the Windows
   system notification center and Chrome/site notification permissions.
   Gateway acceptance does **not** prove OS display.
7. Close the website tab, but leave the browser running; send a message
   from another account using a separate browser profile. The recipient's
   browser should show a Windows notification. Click it to open the
   related content.
8. Test with Chrome fully closed separately: background delivery depends on
   the browser/OS background settings and cannot be guaranteed.

For Android and iPhone use the HTTPS deployment, not an HTTP LAN address.
Use a separate testing origin rather than replacing your production site.

## Server diagnostics

- `GET /api/v1/push/config` (authenticated) returns `enabled` and the
  **public** VAPID key. `enabled:false` means keys are missing, malformed,
  mismatched, or subject is invalid.
- `POST /api/v1/push/status` with the current browser endpoint checks the
  associated user/session and most recent durable delivery attempt.
- `POST /api/v1/push/test` sends a test to **the current user's current
  session**, with a rate limit of 3/minute. Test gateway errors are shown in
  My Account, including 401/403 (check VAPID) and 404/410 (expired endpoint).
- Backend logs include `Web Push delivery failed`,
  `Push recovery failed`, and `Web Push diagnostic delivery failed`.

When users return to the website with permission already granted, the app
attempts to renew a missing, expired, or key-mismatched browser subscription
without another permission prompt. The service worker also signals active
tabs on `pushsubscriptionchange`. Some browsers require a user gesture to
renew: in that case disable and re-enable push in My Account. Subscriptions
cannot be silently re-registered with the authenticated API while all
application tabs are closed.

The backend stores a per-browser durable PostgreSQL delivery queue. It
retries temporary failures with exponential backoff up to 6 attempts, uses
atomic leases to avoid duplicate concurrent workers, reconciles missed
unread notifications from the past 24 hours, and removes expired endpoints
when their push service responds 404 or 410. Delivery is best-effort, and
accepted pushes can still be suppressed by device-level notification
settings. Delivery attempts and errors are retained for 7 days.

## Verification commands

```powershell
git branch --show-current
Test-Path .\apps\web\public\push-sw.js
Test-Path .\apps\api\src\lib\push-notifications.js
npm.cmd --prefix apps/api run db:generate
npm.cmd --prefix apps/api test
npm.cmd --prefix apps/web test
npm.cmd --prefix apps/web run build
```

API integration tests require access to a local PostgreSQL database and will
create/drop isolated test schemas. Never run tests against production data.
