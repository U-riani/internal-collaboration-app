import { deliverWebPush, webPushConfigured } from "./web-push.js";
import { targetUrl } from "../routes/notifications.js";

const running = new WeakSet();
const MAX_ATTEMPTS = 6;
const CLAIM_DURATION_MS = 45_000;
const BATCH_SIZE = 40;

function eventKey(notification) {
  return `${notification.id}:${new Date(notification.createdAt).getTime()}`;
}

function eligibleSubscriptions() {
  return {
    session: { revokedAt: null, expiresAt: { gt: new Date() } },
    user: { status: "ACTIVE" },
  };
}

async function storeDeliveries(app, notifications, subscriptions) {
  if (!notifications.length || !subscriptions.length) return 0;
  const byUser = new Map();
  for (const subscription of subscriptions) {
    const list = byUser.get(subscription.userId) || [];
    list.push(subscription);
    byUser.set(subscription.userId, list);
  }
  const data = [];
  for (const notification of notifications) {
    for (const subscription of byUser.get(notification.userId) || []) {
      // Do not send notifications that predate a user's explicit opt-in.
      if (subscription.createdAt > notification.createdAt) continue;
      data.push({
        subscriptionId: subscription.id,
        notificationId: notification.id,
        eventKey: eventKey(notification),
      });
    }
  }
  if (!data.length) return 0;
  const result = await app.prisma.pushDelivery.createMany({
    data,
    skipDuplicates: true,
  });
  return result.count;
}

export async function enqueuePushNotification(app, notification) {
  if (!webPushConfigured() || !notification?.userId || !notification.id) return;
  try {
    const subscriptions = await app.prisma.pushSubscription.findMany({
      where: { userId: notification.userId, ...eligibleSubscriptions() },
      select: { id: true, userId: true, createdAt: true },
    });
    await storeDeliveries(app, [notification], subscriptions);
    // Delivery runs after the database queue is durable, and does not block
    // the user's message/task/approval request.
    void processPushDeliveries(app);
  } catch (error) {
    app.log?.warn?.({ err: error }, "Could not queue Web Push delivery");
  }
}

export async function recoverMissingPushDeliveries(app) {
  if (!webPushConfigured()) return 0;
  const subscriptions = await app.prisma.pushSubscription.findMany({
    where: eligibleSubscriptions(),
    select: { id: true, userId: true, createdAt: true },
  });
  if (!subscriptions.length) return 0;
  const notifications = await app.prisma.notification.findMany({
    where: {
      userId: { in: [...new Set(subscriptions.map((s) => s.userId))] },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      isRead: false,
    },
    select: { id: true, userId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return storeDeliveries(app, notifications, subscriptions);
}

async function payloadForNotification(app, notification) {
  let url = "/notifications";
  try {
    url = (await targetUrl(app, notification, notification.userId)) || url;
  } catch (error) {
    app.log?.debug?.({ err: error, notificationId: notification.id },
      "Push deep link could not be resolved");
  }
  return {
    id: notification.id,
    title: String(notification.title || "GTEX Collaboration").slice(0, 160),
    body: String(notification.body || "").slice(0, 500),
    url,
    // A repeated reaction notification gets a new timestamp/event key.
    tag: `collab:${eventKey(notification)}`,
  };
}

async function deliverClaimedJob(app, job) {
  const subscription = job.subscription;
  const notification = job.notification;
  if (!subscription || !notification ||
      subscription.userId !== notification.userId ||
      subscription.user?.status !== "ACTIVE" ||
      !subscription.session || subscription.session.revokedAt ||
      subscription.session?.expiresAt <= new Date()) {
    await app.prisma.pushDelivery.updateMany({
      where: { id: job.id },
      data: { failedAt: new Date(), leaseUntil: null, lastError: "Session unavailable" },
    });
    return;
  }

  if (notification.isRead) {
    await app.prisma.pushDelivery.updateMany({
      where: { id: job.id },
      data: { deliveredAt: new Date(), leaseUntil: null, lastError: "Already read" },
    });
    return;
  }

  try {
    // Prisma stores p256dh/auth as flat columns. Web Push encryption MUST
    // receive the nested PushSubscription JSON structure expected by browsers.
    const result = await deliverWebPush({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }, await payloadForNotification(app, notification));

    if (result.ok) {
      await app.prisma.pushDelivery.updateMany({
        where: { id: job.id },
        data: { deliveredAt: new Date(), leaseUntil: null, lastError: null },
      });
      return;
    }
    if (result.status === 404 || result.status === 410) {
      await app.prisma.pushSubscription.deleteMany({
        where: { id: subscription.id },
      });
      return;
    }
    throw new Error(`Push gateway returned HTTP ${result.status || "unknown"}`);
  } catch (error) {
    const exhausted = job.attempts + 1 >= MAX_ATTEMPTS;
    const delayMs = Math.min(15_000 * (2 ** job.attempts), 30 * 60 * 1000);
    await app.prisma.pushDelivery.updateMany({
      where: { id: job.id },
      data: {
        leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + delayMs),
        failedAt: exhausted ? new Date() : null,
        lastError: String(error?.message || error).slice(0, 500),
      },
    });
    app.log?.warn?.({
      err: error,
      subscriptionId: subscription.id,
      notificationId: notification.id,
      attempt: job.attempts + 1,
      exhausted,
    }, "Web Push delivery failed");
  }
}

export async function processPushDeliveries(app) {
  if (!webPushConfigured() || running.has(app)) return;
  running.add(app);
  try {
    // Multiple API processes may run this worker. Leases are acquired through
    // an atomic conditional update so only one instance sends each job.
    const now = new Date();
    const jobs = await app.prisma.pushDelivery.findMany({
      where: {
        deliveredAt: null,
        failedAt: null,
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      include: {
        subscription: { include: { user: true, session: true } },
        notification: true,
      },
      orderBy: { nextAttemptAt: "asc" },
      take: BATCH_SIZE,
    });
    await Promise.all(jobs.map(async (job) => {
      try {
        const claimed = await app.prisma.pushDelivery.updateMany({
          where: {
            id: job.id,
            attempts: job.attempts,
            deliveredAt: null,
            failedAt: null,
            nextAttemptAt: { lte: now },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
          },
          data: {
            attempts: { increment: 1 },
            leaseUntil: new Date(Date.now() + CLAIM_DURATION_MS),
          },
        });
        if (claimed.count) await deliverClaimedJob(app, job);
      } catch (error) {
        app.log?.warn?.({ err: error, deliveryId: job.id },
          "Push delivery worker error");
      }
    }));
  } catch (error) {
    app.log?.warn?.({ err: error }, "Push delivery worker error");
  } finally {
    running.delete(app);
  }
}

export function startPushDeliveryWorker(app, intervalMs = 10_000) {
  if (!webPushConfigured()) {
    app.log?.warn?.("Web Push disabled: missing or invalid VAPID settings");
    return () => {};
  }
  let stopped = false;
  let recovering = false;
  let lastRecoveryAt = 0;

  async function run() {
    if (stopped) return;
    if (!recovering && Date.now() - lastRecoveryAt >= 60_000) {
      recovering = true;
      lastRecoveryAt = Date.now();
      try {
        await recoverMissingPushDeliveries(app);
        // Keep the persistent retry queue bounded.
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await app.prisma.pushDelivery.deleteMany({
          where: { OR: [
            { deliveredAt: { lt: cutoff } },
            { failedAt: { lt: cutoff } },
          ] },
        });
      } catch (error) {
        app.log?.warn?.({ err: error }, "Push recovery failed");
      } finally {
        recovering = false;
      }
    }
    if (!stopped) await processPushDeliveries(app);
  }

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

// Compatibility for existing notification creation call sites.
export const queuePushNotification = enqueuePushNotification;
