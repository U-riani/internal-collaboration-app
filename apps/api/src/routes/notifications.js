import { z } from "zod";
import { parse } from "../lib/validation.js";
import { HttpError } from "../lib/http-error.js";

export default async function notificationRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    const query = parse(
      z.object({ unreadOnly: z.enum(["true", "false"]).optional() }),
      request.query,
    );
    const data = await app.prisma.notification.findMany({
      where: {
        userId: request.authUser.id,
        isRead: query.unreadOnly === "true" ? false : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const unreadCount = await app.prisma.notification.count({
      where: { userId: request.authUser.id, isRead: false },
    });
    return { success: true, data, meta: { unreadCount } };
  });

  app.post("/:id/read", async (request) => {
    const notification = await app.prisma.notification.findFirst({
      where: { id: request.params.id, userId: request.authUser.id },
    });
    if (!notification)
      throw new HttpError(
        404,
        "NOTIFICATION_NOT_FOUND",
        "Notification was not found",
      );
    const data = await app.prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true, data };
  });

  app.post("/read-all", async (request) => {
    await app.prisma.notification.updateMany({
      where: { userId: request.authUser.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true, data: null };
  });
}
