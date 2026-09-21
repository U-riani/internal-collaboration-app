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
const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(32),
});

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
  receipts: {
    select: {
      userId: true,
      deliveredAt: true,
      readAt: true,
      user: { select: { id: true, displayName: true } },
    },
  },
  reactions: {
    select: {
      emoji: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  pin: {
    select: {
      pinnedAt: true,
      pinnedBy: { select: { id: true, displayName: true } },
    },
  },
};

function extractHttpLinks(content = "") {
  const matches = content.match(/https?:\/\/[^\s<>"']+/gi) || [];
  return [
    ...new Set(
      matches
        .map((value) => value.replace(/[),.;!?]+$/g, ""))
        .filter(Boolean),
    ),
  ];
}

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

async function unreadMessageState(app, userId) {
  const receipts = await app.prisma.messageReceipt.findMany({
    where: {
      userId,
      readAt: null,
      message: { deletedAt: null },
    },
    select: { message: { select: { conversationId: true } } },
  });
  const counts = new Map();
  for (const receipt of receipts) {
    const conversationId = receipt.message.conversationId;
    counts.set(conversationId, (counts.get(conversationId) || 0) + 1);
  }
  return counts;
}

async function messageReceiptsForUser(app, userId, messageIds, extraWhere = {}) {
  if (!messageIds.length) return [];
  return app.prisma.messageReceipt.findMany({
    where: {
      userId,
      messageId: { in: messageIds },
      ...extraWhere,
    },
    select: {
      messageId: true,
      deliveredAt: true,
      readAt: true,
      message: { select: { conversationId: true, senderId: true, createdAt: true } },
    },
  });
}

function emitReceiptUpdates(app, userId, receipts, changes) {
  const byConversation = new Map();
  for (const receipt of receipts) {
    const conversationId = receipt.message.conversationId;
    const ids = byConversation.get(conversationId) || [];
    ids.push(receipt.messageId);
    byConversation.set(conversationId, ids);
  }
  for (const [conversationId, messageIds] of byConversation) {
    app.io?.to(`conversation:${conversationId}`).emit("message:receipt-updated", {
      conversationId,
      userId,
      messageIds,
      ...changes,
    });
  }
}

async function markMessageNotificationsRead(app, userId, messageIds, readAt) {
  if (!messageIds.length) return 0;
  const result = await app.prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
      type: "MESSAGE",
      relatedEntityType: "MESSAGE",
      relatedEntityId: { in: messageIds },
    },
    data: { isRead: true, readAt },
  });
  if (result.count)
    app.io?.to(`user:${userId}`).emit("notification:updated", {
      messageIds,
      isRead: true,
    });
  return result.count;
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
    const counts = await unreadMessageState(app, request.authUser.id);
    const enriched = data.map((conversation) => ({
      ...conversation,
      unreadCount: counts.get(conversation.id) || 0,
    }));
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

    const members = await app.prisma.conversationMember.findMany({
      where: {
        conversationId: request.params.id,
        leftAt: null,
        userId: { not: request.authUser.id },
      },
      select: { userId: true },
    });
    if (members.length)
      await app.prisma.messageReceipt.createMany({
        data: members.map(({ userId }) => ({ messageId: message.id, userId })),
        skipDuplicates: true,
      });
    await Promise.all(
      members.map(({ userId }) =>
        createNotification(app, {
          userId,
          type: "MESSAGE",
          title: `New message from ${request.authUser.displayName}`,
          body: input.content.slice(0, 180),
          relatedEntityType: "MESSAGE",
          relatedEntityId: message.id,
        }),
      ),
    );
    const enrichedMessage = await app.prisma.message.findUnique({
      where: { id: message.id },
      include: messageInclude,
    });
    app.io
      ?.to(`conversation:${request.params.id}`)
      .emit("message:created", enrichedMessage);
    reply.status(201);
    return { success: true, data: enrichedMessage };
  });

  app.get("/conversations/:id/pins", async (request) => {
    await requireMembership(app, request.params.id, request.authUser.id);
    const data = await app.prisma.messagePin.findMany({
      where: {
        message: {
          conversationId: request.params.id,
          deletedAt: null,
        },
      },
      select: {
        messageId: true,
        pinnedAt: true,
        pinnedBy: { select: { id: true, displayName: true } },
        message: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            sender: { select: { id: true, displayName: true } },
            attachments: {
              select: {
                file: {
                  select: { id: true, originalName: true, mimeType: true },
                },
              },
            },
          },
        },
      },
      orderBy: { pinnedAt: "desc" },
    });
    return { success: true, data };
  });

  app.post("/messages/:id/reactions", async (request) => {
    const input = parse(reactionSchema, request.body);
    const message = await app.prisma.message.findUnique({
      where: { id: request.params.id },
      select: { id: true, conversationId: true, deletedAt: true },
    });
    if (!message || message.deletedAt)
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    await requireMembership(app, message.conversationId, request.authUser.id);

    const key = {
      messageId: message.id,
      userId: request.authUser.id,
      emoji: input.emoji,
    };
    const existing = await app.prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: key },
    });
    if (existing) {
      await app.prisma.messageReaction.delete({
        where: { messageId_userId_emoji: key },
      });
    } else {
      await app.prisma.messageReaction.create({ data: key });
    }

    app.io
      ?.to(`conversation:${message.conversationId}`)
      .emit("message:reaction-updated", {
        conversationId: message.conversationId,
        messageId: message.id,
        emoji: input.emoji,
        userId: request.authUser.id,
        added: !existing,
      });
    return {
      success: true,
      data: { added: !existing, emoji: input.emoji },
    };
  });

  app.post("/messages/:id/pin", async (request) => {
    const message = await app.prisma.message.findUnique({
      where: { id: request.params.id },
      select: { id: true, conversationId: true, deletedAt: true },
    });
    if (!message || message.deletedAt)
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    await requireMembership(app, message.conversationId, request.authUser.id);

    const pin = await app.prisma.messagePin.upsert({
      where: { messageId: message.id },
      create: { messageId: message.id, pinnedById: request.authUser.id },
      update: { pinnedById: request.authUser.id, pinnedAt: new Date() },
      select: {
        messageId: true,
        pinnedAt: true,
        pinnedBy: { select: { id: true, displayName: true } },
      },
    });
    app.io
      ?.to(`conversation:${message.conversationId}`)
      .emit("message:pin-updated", {
        conversationId: message.conversationId,
        messageId: message.id,
        pinned: true,
      });
    return { success: true, data: pin };
  });

  app.delete("/messages/:id/pin", async (request) => {
    const message = await app.prisma.message.findUnique({
      where: { id: request.params.id },
      select: { id: true, conversationId: true },
    });
    if (!message)
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    await requireMembership(app, message.conversationId, request.authUser.id);
    await app.prisma.messagePin.deleteMany({ where: { messageId: message.id } });
    app.io
      ?.to(`conversation:${message.conversationId}`)
      .emit("message:pin-updated", {
        conversationId: message.conversationId,
        messageId: message.id,
        pinned: false,
      });
    return { success: true, data: null };
  });

  app.post("/messages/receipts/delivered", async (request) => {
    const input = parse(
      z
        .object({
          messageIds: z.array(z.uuid()).max(500).default([]),
          allPending: z.boolean().default(false),
        })
        .refine((value) => value.allPending || value.messageIds.length > 0, {
          message: "Provide messageIds or allPending",
        }),
      request.body,
    );
    const pending = await app.prisma.messageReceipt.findMany({
      where: {
        userId: request.authUser.id,
        deliveredAt: null,
        ...(input.allPending ? {} : { messageId: { in: input.messageIds } }),
      },
      select: {
        messageId: true,
        deliveredAt: true,
        readAt: true,
        message: { select: { conversationId: true, senderId: true, createdAt: true } },
      },
      take: 500,
    });
    if (!pending.length) return { success: true, data: { count: 0 } };
    const deliveredAt = new Date();
    const messageIds = pending.map((item) => item.messageId);
    const result = await app.prisma.messageReceipt.updateMany({
      where: {
        userId: request.authUser.id,
        messageId: { in: messageIds },
        deliveredAt: null,
      },
      data: { deliveredAt },
    });
    emitReceiptUpdates(app, request.authUser.id, pending, { deliveredAt });
    return { success: true, data: { count: result.count } };
  });

  app.post("/messages/receipts/read", async (request) => {
    const { messageIds } = parse(
      z.object({ messageIds: z.array(z.uuid()).min(1).max(200) }),
      request.body,
    );
    const receipts = await messageReceiptsForUser(
      app,
      request.authUser.id,
      messageIds,
      { readAt: null },
    );
    if (!receipts.length) return { success: true, data: { count: 0 } };
    const ids = receipts.map((item) => item.messageId);
    const readAt = new Date();
    await app.prisma.messageReceipt.updateMany({
      where: {
        userId: request.authUser.id,
        messageId: { in: ids },
        deliveredAt: null,
      },
      data: { deliveredAt: readAt },
    });
    const result = await app.prisma.messageReceipt.updateMany({
      where: {
        userId: request.authUser.id,
        messageId: { in: ids },
        readAt: null,
      },
      data: { readAt },
    });
    await markMessageNotificationsRead(app, request.authUser.id, ids, readAt);
    emitReceiptUpdates(app, request.authUser.id, receipts, {
      deliveredAt: readAt,
      readAt,
    });
    return { success: true, data: { count: result.count } };
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
    const [, , updated] = await app.prisma.$transaction([
      app.prisma.messageReaction.deleteMany({ where: { messageId: message.id } }),
      app.prisma.messagePin.deleteMany({ where: { messageId: message.id } }),
      app.prisma.message.update({
        where: { id: message.id },
        data: { content: "", deletedAt: new Date() },
        include: messageInclude,
      }),
    ]);
    app.io
      ?.to(`conversation:${message.conversationId}`)
      .emit("message:deleted", {
        id: message.id,
        conversationId: message.conversationId,
      });
    return { success: true, data: updated };
  });

  app.post("/conversations/:id/read", async (request) => {
    const input = parse(
      z
        .object({
          messageId: z.uuid().optional(),
          all: z.boolean().default(false),
        })
        .refine((value) => value.all || value.messageId, {
          message: "Provide messageId or mark the whole conversation as read",
        }),
      request.body,
    );
    await requireMembership(app, request.params.id, request.authUser.id);

    const message = input.all
      ? await app.prisma.message.findFirst({
          where: {
            conversationId: request.params.id,
            deletedAt: null,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, conversationId: true, createdAt: true },
        })
      : await app.prisma.message.findUnique({
          where: { id: input.messageId },
          select: { id: true, conversationId: true, createdAt: true },
        });

    if (!message) return { success: true, data: { count: 0 } };
    if (message.conversationId !== request.params.id)
      throw new HttpError(
        400,
        "MESSAGE_NOT_IN_CONVERSATION",
        "Message is not in this conversation",
      );

    const receipts = await app.prisma.messageReceipt.findMany({
      where: {
        userId: request.authUser.id,
        readAt: null,
        message: {
          conversationId: request.params.id,
          deletedAt: null,
          ...(input.all ? {} : { createdAt: { lte: message.createdAt } }),
        },
      },
      select: {
        messageId: true,
        deliveredAt: true,
        readAt: true,
        message: {
          select: { conversationId: true, senderId: true, createdAt: true },
        },
      },
    });
    const readAt = new Date();
    const ids = receipts.map((item) => item.messageId);
    if (ids.length) {
      await app.prisma.messageReceipt.updateMany({
        where: {
          userId: request.authUser.id,
          messageId: { in: ids },
          deliveredAt: null,
        },
        data: { deliveredAt: readAt },
      });
      await app.prisma.messageReceipt.updateMany({
        where: {
          userId: request.authUser.id,
          messageId: { in: ids },
          readAt: null,
        },
        data: { readAt },
      });
      await markMessageNotificationsRead(
        app,
        request.authUser.id,
        ids,
        readAt,
      );
      emitReceiptUpdates(app, request.authUser.id, receipts, {
        deliveredAt: readAt,
        readAt,
      });
    }
    await app.prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId: request.params.id,
          userId: request.authUser.id,
        },
      },
      data: { lastReadMessageId: message.id },
    });
    app.io
      ?.to(`conversation:${request.params.id}`)
      .emit("conversation:read-updated", {
        conversationId: request.params.id,
        userId: request.authUser.id,
        messageId: message.id,
      });
    return { success: true, data: { count: ids.length } };
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
      z
        .object({
          q: z.string().trim().max(500).default(""),
          conversationId: z.uuid().optional(),
          type: z.enum(["messages", "files", "links"]).default("messages"),
        })
        .superRefine((value, ctx) => {
          if (value.type === "messages" && value.q.length < 2) {
            ctx.addIssue({
              code: "custom",
              path: ["q"],
              message: "Type at least 2 characters to search messages",
            });
          }
        }),
      request.query,
    );

    const membershipFilter = {
      members: { some: { userId: request.authUser.id, leftAt: null } },
    };

    if (query.type === "files") {
      const messages = await app.prisma.message.findMany({
        where: {
          deletedAt: null,
          conversationId: query.conversationId,
          conversation: membershipFilter,
          attachments: {
            some: {
              file: {
                deletedAt: null,
                ...(query.q
                  ? {
                      originalName: {
                        contains: query.q,
                        mode: "insensitive",
                      },
                    }
                  : {}),
              },
            },
          },
        },
        include: {
          sender: { select: { id: true, displayName: true } },
          attachments: { include: { file: true } },
          conversation: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      const needle = query.q.toLowerCase();
      const data = messages
        .flatMap((message) =>
          message.attachments
            .filter(
              ({ file }) =>
                !file.deletedAt &&
                (!needle || file.originalName.toLowerCase().includes(needle)),
            )
            .map(({ file }) => ({
              id: `${message.id}:${file.id}`,
              messageId: message.id,
              conversationId: message.conversationId,
              createdAt: message.createdAt,
              sender: message.sender,
              messagePreview: message.content,
              file,
              conversation: message.conversation,
            })),
        )
        .slice(0, 100);
      return { success: true, data };
    }

    if (query.type === "links") {
      const messages = await app.prisma.message.findMany({
        where: {
          deletedAt: null,
          conversationId: query.conversationId,
          conversation: membershipFilter,
          content: query.q
            ? { contains: query.q, mode: "insensitive" }
            : { contains: "http", mode: "insensitive" },
        },
        include: {
          sender: { select: { id: true, displayName: true } },
          conversation: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      const needle = query.q.toLowerCase();
      const data = messages
        .flatMap((message) =>
          extractHttpLinks(message.content)
            .filter(
              (url) =>
                !needle ||
                url.toLowerCase().includes(needle) ||
                message.content.toLowerCase().includes(needle),
            )
            .map((url, index) => ({
              id: `${message.id}:link:${index}`,
              messageId: message.id,
              conversationId: message.conversationId,
              createdAt: message.createdAt,
              sender: message.sender,
              messagePreview: message.content,
              url,
              conversation: message.conversation,
            })),
        )
        .slice(0, 100);
      return { success: true, data };
    }

    const data = await app.prisma.message.findMany({
      where: {
        deletedAt: null,
        content: { contains: query.q, mode: "insensitive" },
        conversationId: query.conversationId,
        conversation: membershipFilter,
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
