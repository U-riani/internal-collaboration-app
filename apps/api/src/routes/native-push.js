import { z } from "zod";
import { parse } from "../lib/validation.js";
import { HttpError } from "../lib/http-error.js";
import { nativePushConfigured } from "../lib/fcm.js";
import { queueNativePushNotification } from "../lib/native-push.js";

const deviceSchema = z.object({
  token: z.string().trim().min(20).max(4096).regex(/^[A-Za-z0-9:_-]+$/),
  platform: z.literal("ANDROID"),
}).strict();

export default async function nativePushRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/config", async () => ({
    success: true,
    data: { enabled: nativePushConfigured() },
  }));

  app.post("/devices", async (request) => {
    const { token, platform } = parse(deviceSchema, request.body);
    const previous = await app.prisma.nativePushDevice.findUnique({
      where: { token }, include: { session: true },
    });
    if (previous && previous.userId !== request.authUser.id &&
      previous.session && !previous.session.revokedAt &&
      previous.session.expiresAt > new Date()) {
      throw new HttpError(409, "FCM_DEVICE_IN_USE",
        "This device belongs to another active session. Sign out first.");
    }
    const device = await app.prisma.nativePushDevice.upsert({
      where: { token },
      create: { token, platform, userId: request.authUser.id, sessionId: request.user.sid },
      update: { platform, userId: request.authUser.id, sessionId: request.user.sid },
    });
    // Recover the current unread inbox after an offline registration.
    if (nativePushConfigured()) {
      const unread = await app.prisma.notification.findMany({
        where: { userId: request.authUser.id, isRead: false, createdAt: { gte: device.createdAt } },
        take: 100, orderBy: { createdAt: "desc" },
      });
      for (const notification of unread) await queueNativePushNotification(app, notification);
    }
    return { success: true, data: { registered: true } };
  });

  app.delete("/devices", async (request) => {
    const { token } = parse(z.object({ token: deviceSchema.shape.token }).strict(), request.body);
    await app.prisma.nativePushDevice.deleteMany({
      where: { token, userId: request.authUser.id, sessionId: request.user.sid },
    });
    return { success: true, data: { registered: false } };
  });
}
