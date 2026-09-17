import { z } from "zod";
import { parse } from "../lib/validation.js";
import { HttpError } from "../lib/http-error.js";

const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
const prioritySchema = z.object({ priority: z.enum(priorities) });

async function requireNotification(app, userId, id) {
  const notification = await app.prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!notification)
    throw new HttpError(
      404,
      "NOTIFICATION_NOT_FOUND",
      "Notification was not found",
    );
  return notification;
}

async function currentPriorities(app, userId, notificationIds) {
  if (!notificationIds.length) return new Map();
  const logs = await app.prisma.auditLog.findMany({
    where: {
      actorId: userId,
      actionType: "NOTIFICATION_PRIORITY_SET",
      entityType: "NOTIFICATION",
      entityId: { in: notificationIds },
    },
    select: { entityId: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });
  const result = new Map();
  for (const log of logs) {
    if (result.has(log.entityId)) continue;
    const value = log.metadata?.priority;
    if (priorities.includes(value)) result.set(log.entityId, value);
  }
  return result;
}

async function resolveMessageId(app, notification, userId) {
  const id = notification.relatedEntityId;
  if (!id) return null;
  if (notification.relatedEntityType === "MESSAGE") return id;
  if (
    notification.type !== "MESSAGE" ||
    notification.relatedEntityType !== "CONVERSATION"
  )
    return null;

  const senderName = notification.title.startsWith("New message from ")
    ? notification.title.slice("New message from ".length)
    : null;
  const message = await app.prisma.message.findFirst({
    where: {
      conversationId: id,
      createdAt: { lte: notification.createdAt },
      senderId: { not: userId },
      ...(notification.body
        ? { content: { startsWith: notification.body } }
        : {}),
      ...(senderName ? { sender: { displayName: senderName } } : {}),
      conversation: {
        members: { some: { userId, leftAt: null } },
      },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  return message?.id || null;
}

async function targetUrl(app, notification, userId) {
  const id = notification.relatedEntityId;
  if (!id) return null;
  if (notification.relatedEntityType === "TASK")
    return `/tasks/${encodeURIComponent(id)}`;
  if (notification.relatedEntityType === "APPROVAL_REQUEST")
    return `/approvals/${encodeURIComponent(id)}`;

  const messageId = await resolveMessageId(app, notification, userId);
  if (messageId) return `/chat/message/${encodeURIComponent(messageId)}`;
  if (notification.relatedEntityType === "CONVERSATION") return "/chat";
  return null;
}

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
    const priorityById = await currentPriorities(
      app,
      request.authUser.id,
      data.map((item) => item.id),
    );
    const enriched = await Promise.all(
      data.map(async (item) => ({
        ...item,
        priority: priorityById.get(item.id) || "NORMAL",
        targetUrl: await targetUrl(app, item, request.authUser.id),
      })),
    );
    const unreadCount = await app.prisma.notification.count({
      where: { userId: request.authUser.id, isRead: false },
    });
    return { success: true, data: enriched, meta: { unreadCount } };
  });

  app.get("/messages/:id", async (request) => {
    const message = await app.prisma.message.findFirst({
      where: {
        id: request.params.id,
        conversation: {
          members: {
            some: { userId: request.authUser.id, leftAt: null },
          },
        },
      },
      include: {
        sender: { select: { id: true, displayName: true, email: true } },
        conversation: { select: { id: true, name: true, type: true } },
        replyToMessage: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, displayName: true } },
          },
        },
        attachments: { include: { file: true } },
      },
    });
    if (!message)
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    return { success: true, data: message };
  });

  app.post("/:id/read", async (request) => {
    const notification = await requireNotification(
      app,
      request.authUser.id,
      request.params.id,
    );
    const data = await app.prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true, readAt: new Date() },
    });
    app.io?.to(`user:${request.authUser.id}`).emit("notification:updated", data);
    return { success: true, data };
  });

  app.post("/:id/unread", async (request) => {
    const notification = await requireNotification(
      app,
      request.authUser.id,
      request.params.id,
    );
    const data = await app.prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: false, readAt: null },
    });
    app.io?.to(`user:${request.authUser.id}`).emit("notification:updated", data);
    return { success: true, data };
  });

  app.patch("/:id/priority", async (request) => {
    const { priority } = parse(prioritySchema, request.body);
    const notification = await requireNotification(
      app,
      request.authUser.id,
      request.params.id,
    );
    await app.prisma.auditLog.create({
      data: {
        actorId: request.authUser.id,
        actionType: "NOTIFICATION_PRIORITY_SET",
        entityType: "NOTIFICATION",
        entityId: notification.id,
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        metadata: { priority },
      },
    });
    const data = { ...notification, priority };
    app.io?.to(`user:${request.authUser.id}`).emit("notification:updated", data);
    return { success: true, data };
  });

  app.post("/read-all", async (request) => {
    await app.prisma.notification.updateMany({
      where: { userId: request.authUser.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    app.io
      ?.to(`user:${request.authUser.id}`)
      .emit("notification:updated", { allRead: true });
    return { success: true, data: null };
  });
}
