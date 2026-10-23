import { z } from "zod";
import { parse } from "../lib/validation.js";
import { HttpError } from "../lib/http-error.js";
import { env } from "../config/env.js";
import { deliverWebPush, webPushConfigured } from "../lib/web-push.js";

const endpointSchema = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    // Never allow untrusted destination hosts: the API sends network requests
    // to the supplied push endpoint.
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

const endpointBody = z.object({ endpoint: endpointSchema }).strict();
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

function requireConfigured() {
  if (!webPushConfigured())
    throw new HttpError(503, "PUSH_NOT_CONFIGURED",
      "Web Push is not configured: generate valid matching VAPID keys and restart the API");
}

export default async function pushRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/config", async () => ({
    success: true,
    data: {
      enabled: webPushConfigured(),
      publicKey: webPushConfigured() ? env.PUSH_VAPID_PUBLIC_KEY : null,
      message: webPushConfigured()
        ? null
        : "Missing or invalid VAPID keypair or subject in the backend environment",
    },
  }));

  app.post("/subscriptions", async (request) => {
    requireConfigured();
    const input = parse(subscriptionSchema, request.body);
    checkKeys(input);

    const existing = await app.prisma.pushSubscription.findUnique({
      where: { endpoint: input.endpoint },
      include: { session: true },
    });
    // Another currently authenticated user may own a subscription on a
    // shared browser. Never silently reassign it to a different user.
    if (existing && existing.userId !== request.authUser.id &&
        existing.session && !existing.session.revokedAt &&
        existing.session.expiresAt > new Date()) {
      throw new HttpError(409, "PUSH_ENDPOINT_IN_USE",
        "This browser subscription belongs to another signed-in account. Sign out of that account before enabling push.");
    }

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

  app.post("/status", async (request) => {
    const { endpoint } = parse(endpointBody, request.body);
    const subscription = await app.prisma.pushSubscription.findFirst({
      where: { endpoint, userId: request.authUser.id },
      select: { id: true, sessionId: true },
    });
    const latest = subscription
      ? await app.prisma.pushDelivery.findFirst({
          where: { subscriptionId: subscription.id },
          orderBy: { createdAt: "desc" },
          select: {
            attempts: true, deliveredAt: true, failedAt: true,
            lastError: true, createdAt: true,
          },
        })
      : null;
    return {
      success: true,
      data: {
        configured: webPushConfigured(),
        linked: Boolean(subscription),
        currentSession: subscription?.sessionId === request.user.sid,
        lastDelivery: latest,
      },
    };
  });

  app.post("/test", {
    config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
  }, async (request) => {
    requireConfigured();
    const { endpoint } = parse(endpointBody, request.body);
    const subscription = await app.prisma.pushSubscription.findFirst({
      where: {
        endpoint,
        userId: request.authUser.id,
        sessionId: request.user.sid,
      },
    });
    if (!subscription) throw new HttpError(409, "PUSH_NOT_SUBSCRIBED",
      "This browser is not registered to your current login. Disable and re-enable push notifications.");

    let result;
    try {
      result = await deliverWebPush({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, {
        title: "GTEX Collaboration · Push test",
        body: "Your browser can receive notifications when the website is closed.",
        url: "/notifications",
        tag: `collab:test:${Date.now()}`,
      });
    } catch (error) {
      app.log?.warn?.({ err: error }, "Web Push diagnostic delivery failed");
      throw new HttpError(502, "PUSH_NETWORK_ERROR",
        "Unable to contact the browser push service. Check API network access and server logs.");
    }
    if (result.status === 404 || result.status === 410) {
      await app.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
      throw new HttpError(409, "PUSH_SUBSCRIPTION_EXPIRED",
        "The browser subscription expired. Disable and re-enable push notifications.");
    }
    if (!result.ok)
      throw new HttpError(502, "PUSH_GATEWAY_REJECTED",
        `Push gateway returned HTTP ${result.status}. Check VAPID keys and browser subscription.`);
    return {
      success: true,
      data: {
        gatewayAccepted: true,
        status: result.status,
        message: "Push gateway accepted the notification. Verify it appears in your device's notification center.",
      },
    };
  });

  app.delete("/subscriptions", async (request) => {
    const { endpoint } = parse(endpointBody, request.body);
    await app.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: request.authUser.id },
    });
    return { success: true, data: { subscribed: false } };
  });
}
