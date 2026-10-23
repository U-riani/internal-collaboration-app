import { nativePushConfigured, sendNativePush } from "./fcm.js";
import { targetUrl } from "../routes/notifications.js";

const running = new WeakSet();
const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 40;

function activeDeviceWhere() {
  return { user: { status: "ACTIVE" }, session: {
    revokedAt: null, expiresAt: { gt: new Date() },
  } };
}

export async function queueNativePushNotification(app, notification) {
  if (!nativePushConfigured() || !notification?.id || !notification?.userId) return;
  try {
    const devices = await app.prisma.nativePushDevice.findMany({
      where: { userId: notification.userId, ...activeDeviceWhere() },
      select: { id: true, createdAt: true },
    });
    const rows = devices.filter((d) => d.createdAt <= notification.createdAt)
      .map((d) => ({ deviceId: d.id, notificationId: notification.id,
        eventKey: notification.id + ":" + new Date(notification.createdAt).getTime() }));
    if (!rows.length) return;
    await app.prisma.nativePushDelivery.createMany({ data: rows, skipDuplicates: true });
    void processNativePushDeliveries(app);
  } catch (err) {
    app.log?.warn?.({ err }, "Could not queue Android push");
  }
}

async function recover(app) {
  const devices = await app.prisma.nativePushDevice.findMany({
    where: activeDeviceWhere(), select: { id: true, userId: true, createdAt: true },
  });
  if (!devices.length) return;
  const notifications = await app.prisma.notification.findMany({
    where: { userId: { in: [...new Set(devices.map((d) => d.userId))] },
      createdAt: { gte: new Date(Date.now() - 86400000) }, isRead: false },
    select: { id: true, userId: true, createdAt: true },
    orderBy: { createdAt: "desc" }, take: 500,
  });
  const jobs = notifications.flatMap((n) => devices
    .filter((d) => d.userId === n.userId && d.createdAt <= n.createdAt)
    .map((d) => ({
      deviceId: d.id, notificationId: n.id,
      eventKey: n.id + ":" + new Date(n.createdAt).getTime(),
    })));
  if (jobs.length) await app.prisma.nativePushDelivery.createMany({
    data: jobs, skipDuplicates: true,
  });
}

async function deliver(app, job) {
  if (!job.device || !job.notification ||
      job.device.user?.status !== "ACTIVE" ||
      job.device.session?.revokedAt ||
      !job.device.session || job.device.session.expiresAt <= new Date() ||
      job.notification.isRead || job.notification.userId !== job.device.userId) {
    await app.prisma.nativePushDelivery.updateMany({
      where: { id: job.id }, data: { deliveredAt: new Date(), leaseUntil: null },
    });
    return;
  }
  try {
    const url = await targetUrl(app, job.notification, job.notification.userId)
      .catch(() => "/notifications");
    const result = await sendNativePush(job.device, job.notification, url);
    if (result.ok) {
      await app.prisma.nativePushDelivery.updateMany({
        where: { id: job.id }, data: { deliveredAt: new Date(), leaseUntil: null },
      });
    } else if (result.invalid) {
      // Cascades remove pending delivery rows for this now-invalid token.
      await app.prisma.nativePushDevice.deleteMany({ where: { id: job.device.id } });
    } else {
      throw new Error("FCM rejected: " + (result.status || "unknown") +
        " " + (result.error || ""));
    }
  } catch (err) {
    const attempts = job.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await app.prisma.nativePushDelivery.updateMany({
      where: { id: job.id },
      data: { attempts, leaseUntil: null, failedAt: failed ? new Date() : null,
        nextAttemptAt: new Date(Date.now() + Math.min(600000, 5000 * 2 ** attempts)),
        lastError: String(err.message || "FCM delivery failed").slice(0, 500) },
    });
    app.log?.warn?.({ err, notificationId: job.notificationId }, "Android push delivery failed");
  }
}

export async function processNativePushDeliveries(app) {
  if (!nativePushConfigured() || running.has(app)) return;
  running.add(app);
  try {
    const now = new Date();
    const jobs = await app.prisma.nativePushDelivery.findMany({
      where: { deliveredAt: null, failedAt: null, nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      take: BATCH_SIZE, orderBy: { createdAt: "asc" },
      include: { notification: true, device: { include: { user: true, session: true } } },
    });
    for (const job of jobs) {
      const claimed = await app.prisma.nativePushDelivery.updateMany({
        where: { id: job.id, deliveredAt: null, failedAt: null,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        data: { leaseUntil: new Date(Date.now() + 45000) },
      });
      if (claimed.count === 1) await deliver(app, job);
    }
  } catch (err) {
    app.log?.warn?.({ err }, "Android push worker failed");
  } finally {
    running.delete(app);
  }
}

export function startNativePushWorker(app, intervalMs = 10000) {
  if (!nativePushConfigured()) {
    app.log?.info?.("Android Push disabled until FCM credentials are mounted");
    return () => {};
  }
  let tick = 0;
  const timer = setInterval(() => {
    void (async () => {
      if (++tick % 60 === 1) {
        await recover(app).catch((err) => app.log?.warn?.({ err }, "FCM recovery failed"));
        await app.prisma.nativePushDelivery.deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - 7 * 86400000) },
            OR: [{ deliveredAt: { not: null } }, { failedAt: { not: null } }] },
        }).catch((err) => app.log?.warn?.({ err }, "FCM cleanup failed"));
      }
      await processNativePushDeliveries(app);
    })();
  }, intervalMs);
  timer.unref?.();
  void processNativePushDeliveries(app);
  return () => clearInterval(timer);
}
