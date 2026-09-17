import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startDeadlineNotificationScheduler } from "./lib/deadline-notifications.js";

const app = await buildApp();
const stopDeadlineScheduler = startDeadlineNotificationScheduler(
  app.prisma,
  app.log,
);
app.addHook("onClose", async () => stopDeadlineScheduler());

try {
  await app.listen({ host: "0.0.0.0", port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
