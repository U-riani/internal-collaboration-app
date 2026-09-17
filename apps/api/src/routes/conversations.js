import { requireOwnUploads } from "../lib/file-access.js";
import { z } from "zod";
import { parse } from "../lib/validation.js";
import { hasPermission, hasRole } from "../lib/authz.js";
import { HttpError } from "../lib/http-error.js";
import { createNotification } from "../lib/notifications.js";

const createSchema = z.object({
  type: z.enum(["DIRECT", "GROUP", "DEPARTMENT", "PROJECT", "ANNOUNCEMENT"]),
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  departmentId: z.uuid().nullable().optional(),
  memberIds: z.array(z.uuid()).default([]),
});

const messageSchema = z
  .object({
    content: z.string().trim().max(20000),
    replyToMessageId: z.uuid().nullable().optional(),
    attachmentIds: z.array(z.uuid()).max(10).default([]),
  })
  .refine(
    (x) => x.content.length || x.attachmentIds.length,
    "Write a message or attach a file",
  );

const editSchema = z.object({ content: z.string().trim().min(1).max(20000) });

const conversationInclude = {
  members: {
    where: { leftAt: null },
    include: {
      user: {
        select: { id: true, displayName: true, email: true, lastSeenAt: true },
      },
    },
  },
  messages: {
    where: { deletedAt: null },
    take: 1,
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { id: true, displayName: true } } },
  },
};

const messageInclude = {
  sender: { select: { id: true, displayName: true, email: true } },
  replyToMessage: {
    select: {
      id: true,
      content: true,
      sender: { select: { id: true, displayName: true } },
    },
  },
  attachments: { include: { file: true } },
};

async function requireMembership(app, conversationId, userId) {
  const membership = await app.prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership || membership.leftAt)
    throw new HttpError(
      403,
      "CONVERSATION_MEMBER_REQUIRED",
      "Conversation membership is required",
    );
  return membership;
}

function openedFromLinkedMessage(request) {
  const referer = request.headers.referer;
  if (!referer) return false;
  try {
    return new URL(referer).searchParams.has("message");
  } catch {
    return false;
  }
}

export default async function conversationRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/conversations", async (request) => {
    const data = await app.prisma.conversation.findMany({
      where: {
        members: { some: { userId: request.authUser.id, leftAt: null } },
        isArchived: false,
      },
      include: conversationInclude,
      orderBy: { updatedAt: "desc" },
    });
    const enriched = await Promise.all(
      data.map(async (conversation) => {
        const unreadCount = await app.prisma.notification.count({
          where: {
            userId: request.authUser.id,
            isRead: false,
            type: "MESSAGE",
            relatedEntityType: "CONVERSATION",
            relatedEntityId: conversation.id,
          },
        });
        return { ...conversation, unreadCount };
      }),
    );
    return { success: true, data: enriched };
  });

  app.post("/conversations", async (request, reply) => {
    if (!hasPermission(request.authUser, "conversations.create"))
      throw new HttpError(
        403,
        "PERMISSION_DENIED",
        "You cannot create conversations",
      );
    const input = parse(createSchema, request.body);
    let memberIds = [...new Set([request.authUser.id, ...input.memberIds])];
    const activeCount = await app.prisma.user.count({
      where: { id: { in: memberIds }, status: "ACTIVE" },
    });
    if (activeCount !== memberIds.length)
      throw new HttpError(
        400,
        "INVALID_MEMBERS",
        "Select active organization members",
      );
    if (
      input.type !== "DIRECT" &&
      !["GROUP", "PROJECT"].includes(input.type) &&
      !hasRole(request.authUser, "SYSTEM_ADMIN") &&
      !hasRole(request.authUser, "MANAGER")
    )
      throw new HttpError(
        403,
        "CHANNEL_CREATE_DENIED",
        "A manager must create department or announcement channels",
      );
    if (input.type === "DIRECT") {
      if (memberIds.length !== 2)
        throw new HttpError(
          400,
          "DIRECT_CONVERSATION_MEMBERS",
          "Direct conversation requires exactly two members",
        );
      const directKey = [...memberIds].sort().join(":");
      const existing = await app.prisma.conversation.findUnique({
        where: { directKey },
        include: conversationInclude,
      });
      if (existing) return { success: true, data: existing };
      const conversation = await app.prisma.conversation.create({
        data: {
          type: "DIRECT",
          directKey,
          ownerId: request.authUser.id,
          members: {
            create: memberIds.map((userId) => ({
              userId,
              role: userId === request.authUser.id ? "OWNER" : "MEMBER",
            })),
          },
        },
        include: conversationInclude,
      });
      memberIds.forEach((userId) =>
        app.io
          ?.in(`user:${userId}`)
          .socketsJoin(`conversation:${conversation.id}`),
      );
      app.io
        ?.to(memberIds.map((id) => `user:${id}`))
        .emit("conversation:updated", { id: conversation.id });
      reply.status(201);
      return { success: true, data: conversation };
    }
    if (!input.name)
      throw new HttpError(
        400,
        "CONVERSATION_NAME_REQUIRED",
        "A name is required for this conversation type",
      );
    const conversation = await app.prisma.conversation.create({
      data: {
        type: input.type,
        name: input.name,
        description: input.description,
        departmentId: input.departmentId,
        ownerId: request.authUser.id,
        members: {
          create: memberIds.map((userId) => ({
            userId,
            role: userId === request.authUser.id ? "OWNER" : "MEMBER",
          })),
        },
      },
      include: conversationInclude,
    });
    memberIds.forEach((userId) =>
      app.io
        ?.in(`user:${userId}`)
        .socketsJoin(`conversation:${conversation.id}`),
    );
    app.io
      ?.to(memberIds.map((id) => `user:${id}`))
      .emit("conversation:updated", { id: conversation.id });
    reply.status(201);
    return { success: true, data: conversation };
  });

  app.get("/conversations/:id/messages", async (request) => {
    await requireMembership(app, request.params.id, request.authUser.id);
    const query = parse(
      z.object({
        cursor: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      request.query,
    );
    const data = await app.prisma.message.findMany({
      where: { conversationId: request.params.id },
      include: messageInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const nextCursor = data.length === query.limit ? data.at(-1)?.id : null;
    return { success: true, data: data.reverse(), meta: { nextCursor } };
  });

  app.post("/conversations/:id/messages", async (request, reply) => {
    const membership = await requireMembership(
      app,
      request.params.id,
      request.authUser.id,
    );
    const conversation = await app.prisma.conversation.findUnique({
      where: { id: request.params.id },
    });
    if (
      conversation.isArchived ||
      (conversation.type === "ANNOUNCEMENT" && membership.role === "MEMBER")
    )
      throw new HttpError(
        403,
        "POST_DENIED",
        "You cannot post to this conversation",
      );
    if (!hasPermission(request.authUser, "messages.send"))
      throw new HttpError(403, "PERMISSION_DENIED", "You cannot send messages");
    const input = parse(messageSchema, request.body);
    await requireOwnUploads(app, request.authUser, input.attachmentIds);
    if (input.replyToMessageId) {
      const replyTarget = await app.prisma.message.findUnique({
        where: { id: input.replyToMessageId },
      });
      if (!replyTarget || replyTarget.conversationId !== request.params.id)
        throw new HttpError(
          400,
          "MESSAGE_REPLY_INVALID",
          "Reply target is not in this conversation",
        );
    }
    const message = await app.prisma.message.create({
      data: {
        conversationId: request.params.id,
        senderId: request.authUser.id,
        content: input.content,
        replyToMessageId: input.replyToMessageId,
        attachments: {
          create: input.attachmentIds.map((fileId) => ({ fileId })),
        },
      },
      include: messageInclude,
    });
    await app.prisma.conversation.update({
      where: { id: request.params.id },
      data: { updatedAt: new Date() },
    });
    app.io
      ?.to(`conversation:${request.params.id}`)
      .emit("message:created", message);

    const members = await app.prisma.conversationMember.findMany({
      where: {
        conversationId: request.params.id,
        leftAt: null,
        userId: { not: request.authUser.id },
      },
      select: { userId: true },
    });
    await Promise.all(
      members.map(({ userId }) =>
        createNotification(app, {
          userId,
          type: "MESSAGE",
          title: `New message from ${request.authUser.displayName}`,
          body: input.content.slice(0, 180),
          relatedEntityType: "CONVERSATION",
          relatedEntityId: request.params.id,
        }),
      ),
    );
    reply.status(201);
    return { success: true, data: message };
  });

  app.patch("/messages/:id", async (request) => {
    const input = parse(editSchema, request.body);
    const message = await app.prisma.message.findUnique({
      where: { id: request.params.id },
    });
    if (!message || message.deletedAt)
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    await requireMembership(app, message.conversationId, request.authUser.id);
    if (message.senderId !== request.authUser.id) {
      throw new HttpError(
        403,
        "MESSAGE_EDIT_DENIED",
        "You cannot edit this message",
      );
    }
    if (Date.now() - message.createdAt.getTime() > 15 * 60 * 1000) {
      throw new HttpError(
        409,
        "MESSAGE_EDIT_WINDOW_EXPIRED",
        "The 15-minute edit window has expired",
      );
    }
    const updated = await app.prisma.message.update({
      where: { id: message.id },
      data: { content: input.content, editedAt: new Date() },
      include: messageInclude,
    });
    app.io
      ?.to(`conversation:${message.conversationId}`)
      .emit("message:updated", updated);
    return { success: true, data: updated };
  });

  app.delete("/messages/:id", async (request) => {
    const message = await app.prisma.message.findUnique({
      where: { id: request.params.id },
    });
    if (!message || message.deletedAt)
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    await requireMembership(app, message.conversationId, request.authUser.id);
    if (message.senderId !== request.authUser.id) {
      throw new HttpError(
        403,
        "MESSAGE_DELETE_DENIED",
        "You cannot delete this message",
      );
    }
    const updated = await app.prisma.message.update({
      where: { id: message.id },
      data: { content: "", deletedAt: new Date() },
      include: messageInclude,
    });
    app.io
      ?.to(`conversation:${message.conversationId}`)
      .emit("message:deleted", {
        id: message.id,
        conversationId: message.conversationId,
      });
    return { success: true, data: updated };
  });

  app.post("/conversations/:id/read", async (request) => {
    const input = parse(z.object({ messageId: z.uuid() }), request.body);
    await requireMembership(app, request.params.id, request.authUser.id);
    const message = await app.prisma.message.findUnique({
      where: { id: input.messageId },
    });
    if (!message || message.conversationId !== request.params.id)
      throw new HttpError(
        400,
        "MESSAGE_NOT_IN_CONVERSATION",
        "Message is not in this conversation",
      );
    const readAt = new Date();
    const notificationRead = openedFromLinkedMessage(request)
      ? Promise.resolve({ count: 0 })
      : app.prisma.notification.updateMany({
          where: {
            userId: request.authUser.id,
            isRead: false,
            type: "MESSAGE",
            relatedEntityType: "CONVERSATION",
            relatedEntityId: request.params.id,
          },
          data: { isRead: true, readAt },
        });
    const [, notificationUpdate] = await Promise.all([
      app.prisma.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: request.params.id,
            userId: request.authUser.id,
          },
        },
        data: { lastReadMessageId: input.messageId },
      }),
      notificationRead,
    ]);
    app.io
      ?.to(`conversation:${request.params.id}`)
      .emit("conversation:read-updated", {
        conversationId: request.params.id,
        userId: request.authUser.id,
        messageId: input.messageId,
      });
    if (notificationUpdate.count)
      app.io?.to(`user:${request.authUser.id}`).emit("notification:updated", {
        conversationId: request.params.id,
        messagesRead: notificationUpdate.count,
      });
    return { success: true, data: null };
  });

  app.post("/conversations/:id/members", async (request) => {
    const membership = await requireMembership(
      app,
      request.params.id,
      request.authUser.id,
    );
    const input = parse(z.object({ userId: z.uuid() }), request.body);
    const conversation = await app.prisma.conversation.findUnique({
      where: { id: request.params.id },
    });
    if (conversation.type === "DIRECT" || membership.role !== "OWNER")
      throw new HttpError(
        403,
        "GROUP_OWNER_REQUIRED",
        "Only the group owner can add members",
      );
    if (
      !(await app.prisma.user.findFirst({
        where: { id: input.userId, status: "ACTIVE" },
      }))
    )
      throw new HttpError(400, "INVALID_MEMBER", "Choose an active user");
    await app.prisma.conversationMember.upsert({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId: input.userId,
        },
      },
      create: { conversationId: conversation.id, userId: input.userId },
      update: { leftAt: null },
    });
    app.io
      ?.in(`user:${input.userId}`)
      .socketsJoin(`conversation:${conversation.id}`);
    app.io
      ?.to(`conversation:${conversation.id}`)
      .emit("conversation:updated", { id: conversation.id });
    return { success: true, data: null };
  });
  app.delete("/conversations/:id/members/:userId", async (request) => {
    const member = await requireMembership(
      app,
      request.params.id,
      request.authUser.id,
    );
    const conversation = await app.prisma.conversation.findUnique({
      where: { id: request.params.id },
    });
    if (
      conversation.type === "DIRECT" ||
      request.params.userId === conversation.ownerId ||
      (member.role !== "OWNER" && request.params.userId !== request.authUser.id)
    )
      throw new HttpError(
        403,
        "MEMBER_REMOVE_DENIED",
        "Only the owner can remove other members; owners cannot leave their group",
      );
    await app.prisma.conversationMember.updateMany({
      where: { conversationId: conversation.id, userId: request.params.userId },
      data: { leftAt: new Date() },
    });
    app.io
      ?.in(`user:${request.params.userId}`)
      .socketsLeave(`conversation:${conversation.id}`);
    app.io
      ?.to(`user:${request.params.userId}`)
      .emit("conversation:removed", { id: conversation.id });
    app.io
      ?.to(`conversation:${conversation.id}`)
      .emit("conversation:updated", { id: conversation.id });
    return { success: true, data: null };
  });

  app.get("/messages/search", async (request) => {
    const query = parse(
      z.object({
        q: z.string().trim().min(2),
        conversationId: z.uuid().optional(),
      }),
      request.query,
    );
    const data = await app.prisma.message.findMany({
      where: {
        deletedAt: null,
        content: { contains: query.q, mode: "insensitive" },
        conversationId: query.conversationId,
        conversation: {
          members: { some: { userId: request.authUser.id, leftAt: null } },
        },
      },
      include: {
        ...messageInclude,
        conversation: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { success: true, data };
  });
}
