import { z } from "zod";
import { parse } from "../lib/validation.js";
import { HttpError } from "../lib/http-error.js";
import { markRelatedNotificationsRead } from "../lib/notification-read.js";

const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
const prioritySchema = z.object({ priority: z.enum(priorities) });
const relatedReadSchema = z.object({
  entityType: z.enum(["TASK", "APPROVAL_REQUEST", "CONVERSATION"]),
  entityId: z.uuid(),
});

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

async function resolveMessageTarget(app, notification, userId) {
  const id = notification.relatedEntityId;
  if (!id) return null;

  if (notification.relatedEntityType === "MESSAGE") {
    return app.prisma.message.findFirst({
      where: {
        id,
        conversation: {
          members: { some: { userId, leftAt: null } },
        },
      },
      select: { id: true, conversationId: true },
    });
  }

  if (
    notification.type !== "MESSAGE" ||
    notification.relatedEntityType !== "CONVERSATION"
  )
    return null;

  const senderName = notification.title.startsWith("New message from ")
    ? notification.title.slice("New message from ".length)
    : null;
  return app.prisma.message.findFirst({
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
    select: { id: true, conversationId: true },
    orderBy: { createdAt: "desc" },
  });
}

async function targetUrl(app, notification, userId) {
  const id = notification.relatedEntityId;
  if (!id) return null;
  if (notification.relatedEntityType === "TASK")
    return `/tasks?task=${encodeURIComponent(id)}`;
  if (notification.relatedEntityType === "APPROVAL_REQUEST")
    return `/approvals?request=${encodeURIComponent(id)}`;

  const message = await resolveMessageTarget(app, notification, userId);
  if (message)
    return `/chat?conversation=${encodeURIComponent(message.conversationId)}&message=${encodeURIComponent(message.id)}`;
  if (notification.relatedEntityType === "CONVERSATION")
    return `/chat?conversation=${encodeURIComponent(id)}`;
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
    const unreadWhere = {
      userId: request.authUser.id,
      isRead: false,
    };
    const [
      unreadCount,
      unreadMessageCount,
      unreadTaskCount,
      unreadApprovalCount,
    ] = await Promise.all([
      app.prisma.notification.count({ where: unreadWhere }),
      app.prisma.notification.count({
        where: { ...unreadWhere, type: "MESSAGE" },
      }),
      app.prisma.notification.count({
        where: { ...unreadWhere, relatedEntityType: "TASK" },
      }),
      app.prisma.notification.count({
        where: { ...unreadWhere, relatedEntityType: "APPROVAL_REQUEST" },
      }),
    ]);
    return {
      success: true,
      data: enriched,
      meta: {
        unreadCount,
        unreadMessageCount,
        unreadTaskCount,
        unreadApprovalCount,
      },
    };
  });

  app.post("/read-related", async (request) => {
    const input = parse(relatedReadSchema, request.body);
    const count = await markRelatedNotificationsRead(app, {
      userId: request.authUser.id,
      entityType: input.entityType,
      entityId: input.entityId,
    });
    return { success: true, data: { count } };
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
