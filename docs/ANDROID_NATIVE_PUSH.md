
# Android native push (FCM) — production runbook

This is **separate from** the working browser Web Push/VAPID pipeline. Existing Web Push and Socket.IO continue unchanged.

## Firebase project
- Project ID: `gtex-collaboration`; project number: `87275112337`
- Android applicationId: `ge.gtexshop.collaboration`
- HTTP v1 API is enabled and a service account with the Firebase Cloud Messaging API Admin role exists.
- Never commit or send a service account private key. `google-services.json` is Android client configuration, not server credentials.

## Activate the production sender (WSL / Docker Compose)
1. Copy the Google Cloud service account **private JSON key** directly to the Linux server, e.g. `/home/user/apps/internal-collaboration-app/.secrets/fcm-service-account.json` (outside Git).
2. Set owner-only permissions: `chmod 600 .secrets/fcm-service-account.json` and `chmod 700 .secrets`. Ensure the Docker engine can read it for the bind mount.
3. In `.env.production` add:
   ```env
   FCM_PROJECT_ID=gtex-collaboration
   FCM_SERVICE_ACCOUNT_HOST_PATH=/home/user/apps/internal-collaboration-app/.secrets/fcm-service-account.json
   ```
   Use the actual **absolute WSL host path**. Do not put the key contents in the env file.
4. Back up the database, then deploy the updated prod branch with the **opt-in** FCM Compose overlay:
   ```sh
   docker compose --env-file .env.production -f compose.production.yml -f compose.fcm.yml --profile tunnel up -d --build
   ```
5. The `compose.fcm.yml` overlay adds the read-only credentials mount. Do not use this overlay until the key exists. The ordinary Compose file remains unchanged and safe without FCM. The API Dockerfile runs as `node` (UID 1000), so ensure it can read the JSON, for example chown the host key to UID 1000 and chmod 600.
6. Authenticate and GET `/api/v1/mobile-push/config`; verify `data.enabled: true`. Inspect API logs for FCM failures. The API performs schema migrations at startup as in the existing deployment flow.

## API (JWT required)
- `GET /api/v1/mobile-push/config` => `{ success:true, data:{ enabled:boolean } }`
- `POST /api/v1/mobile-push/devices` => `{ token:string, platform:"ANDROID" }`
- `DELETE /api/v1/mobile-push/devices` => `{ token:string }`

Registrations are tied to the currently authenticated server session and cannot be claimed by another active account. Logout revokes the server session; the mobile client best-effort unregisters its token then deletes the local token to prevent shared-phone leaks. Android devices need Google Play services.

## Deliveries
Each persisted in-app Notification is queued separately for eligible Android devices with a unique event key. A worker retries temporary FCM failures (max six attempts), checks active users/sessions and unread state, removes invalid tokens, and reconciles missed unread notifications from the previous 24 hours. Service-account OAuth uses built-in Node crypto/fetch and no extra npm dependencies.

- A successful FCM HTTP response confirms provider acceptance **not** device display.
- Notification payload includes `notificationId` and target URL; Flutter uses the existing NotificationsScreen routing for direct navigation.
- Background/terminated Android notifications are rendered by the Android OS. Foreground uses the existing Socket.IO/in-app flow to avoid duplicate banners.
- Android force-stop prevents delivery until the user relaunches the app.
- Test on a physical Android phone: allow notifications, sign in, switch to background, message from another user, tap notification, then test terminated/cold start and logout/account switch.
