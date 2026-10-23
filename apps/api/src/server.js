import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startDeadlineNotificationScheduler } from "./lib/deadline-notifications.js";
import { queuePushNotification, startPushDeliveryWorker } from "./lib/push-notifications.js";
import { queueNativePushNotification, startNativePushWorker } from "./lib/native-push.js";

const app = await buildApp();
const stopDeadlineScheduler = startDeadlineNotificationScheduler(
  app.prisma,
  app.log,
  60_000,
  async (notification) => {
    await queuePushNotification(app, notification);
    await queueNativePushNotification(app, notification);
  },
);
const stopPushWorker = startPushDeliveryWorker(app);
const stopNativeWorker = startNativePushWorker(app);
app.addHook("onClose", async () => {
  stopDeadlineScheduler();
  stopPushWorker();
  stopNativeWorker();
});

try {
  await app.listen({ host: "0.0.0.0", port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
