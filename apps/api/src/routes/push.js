import { z } from "zod";
import { parse } from "../lib/validation.js";
import { HttpError } from "../lib/http-error.js";
import { env } from "../config/env.js";
import { webPushConfigured } from "../lib/web-push.js";

const endpointSchema = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    // Only accept established browser push gateways, never arbitrary URLs.
    return url.protocol === "https:" &&
      !url.username && !url.password &&
      (!url.port || url.port === "443") &&
      (
        hostname === "fcm.googleapis.com" ||
        hostname === "android.googleapis.com" ||
        hostname === "updates.push.services.mozilla.com" ||
        hostname.endsWith(".push.services.mozilla.com") ||
        hostname === "push.services.mozilla.com" ||
        hostname === "web.push.apple.com" ||
        hostname.endsWith(".push.apple.com") ||
        hostname.endsWith(".notify.windows.com")
      );
  } catch {
    return false;
  }
}, "Unsupported browser push endpoint");

const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]+$/).max(128),
    auth: z.string().regex(/^[A-Za-z0-9_-]+$/).max(64),
  }).strict(),
}).strict();

function checkKeys(subscription) {
  const publicKey = Buffer.from(subscription.keys.p256dh, "base64url");
  const auth = Buffer.from(subscription.keys.auth, "base64url");
  if (publicKey.length !== 65 || publicKey[0] !== 4 || auth.length !== 16)
    throw new HttpError(400, "PUSH_INVALID_KEYS", "Invalid browser push keys");
}

export default async function pushRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/config", async () => ({
    success: true,
    data: {
      enabled: webPushConfigured(),
      publicKey: webPushConfigured() ? env.PUSH_VAPID_PUBLIC_KEY : null,
    },
  }));

  app.post("/subscriptions", async (request) => {
    if (!webPushConfigured())
      throw new HttpError(503, "PUSH_NOT_CONFIGURED", "Web Push is not configured");
    const input = parse(subscriptionSchema, request.body);
    checkKeys(input);
    await app.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: request.authUser.id,
        sessionId: request.user.sid,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: String(request.headers["user-agent"] || "").slice(0, 256),
      },
      update: {
        userId: request.authUser.id,
        sessionId: request.user.sid,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: String(request.headers["user-agent"] || "").slice(0, 256),
      },
    });
    return { success: true, data: { subscribed: true } };
  });

  app.delete("/subscriptions", async (request) => {
    const input = parse(z.object({ endpoint: endpointSchema }).strict(), request.body);
    await app.prisma.pushSubscription.deleteMany({
      where: { endpoint: input.endpoint, userId: request.authUser.id },
    });
    return { success: true, data: { subscribed: false } };
  });
}
