import { deliverWebPush, webPushConfigured } from "./web-push.js";
import { targetUrl } from "../routes/notifications.js";

export async function sendPushForNotification(app, notification) {
  if (!webPushConfigured() || !notification?.userId) return;
  const subscriptions = await app.prisma.pushSubscription.findMany({
    where: {
      userId: notification.userId,
      session: { revokedAt: null, expiresAt: { gt: new Date() } },
      user: { status: "ACTIVE" },
    },
  });
  if (!subscriptions.length) return;

  const url = (await targetUrl(app, notification, notification.userId)) ||
    "/notifications";
  const payload = {
    id: notification.id,
    title: String(notification.title || "GTEX Collaboration").slice(0, 160),
    body: String(notification.body || "").slice(0, 500),
    url,
    tag: `collab:${notification.id}`,
  };

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      const result = await deliverWebPush(subscription, payload);
      if (result.status === 404 || result.status === 410) {
        await app.prisma.pushSubscription.deleteMany({
          where: { id: subscription.id, userId: notification.userId },
        });
      } else if (!result.ok && !result.skipped) {
        app.log?.warn?.(
          { status: result.status, subscriptionId: subscription.id },
          "Web Push delivery rejected",
        );
      }
    } catch (error) {
      app.log?.warn?.(
        { err: error, subscriptionId: subscription.id },
        "Web Push delivery failed",
      );
    }
  }));
}

// Delivery is best-effort and never holds up a successful notification write.
export function queuePushNotification(app, notification) {
  if (!webPushConfigured()) return;
  void sendPushForNotification(app, notification).catch((error) => {
    app.log?.warn?.({ err: error }, "Web Push dispatch failed");
  });
}
