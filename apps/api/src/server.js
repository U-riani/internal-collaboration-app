import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startDeadlineNotificationScheduler } from "./lib/deadline-notifications.js";
import { queuePushNotification, startPushDeliveryWorker } from "./lib/push-notifications.js";

const app = await buildApp();
const stopDeadlineScheduler = startDeadlineNotificationScheduler(
  app.prisma,
  app.log,
  60_000,
  (notification) => queuePushNotification(app, notification),
);
const stopPushWorker = startPushDeliveryWorker(app);
app.addHook("onClose", async () => {
  stopDeadlineScheduler();
  stopPushWorker();
});

try {
  await app.listen({ host: "0.0.0.0", port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
