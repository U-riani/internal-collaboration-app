export async function markRelatedNotificationsRead(
  app,
  { userId, entityType, entityId },
) {
  const readAt = new Date();
  let notificationIds = [];

  if (entityType === "TASK" || entityType === "APPROVAL_REQUEST") {
    const notifications = await app.prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
        relatedEntityType: entityType,
        relatedEntityId: entityId,
      },
      select: { id: true },
    });
    notificationIds = notifications.map((item) => item.id);
  } else if (entityType === "CONVERSATION") {
    const notifications = await app.prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
        type: "MESSAGE",
        relatedEntityType: { in: ["MESSAGE", "CONVERSATION"] },
      },
      select: {
        id: true,
        relatedEntityType: true,
        relatedEntityId: true,
      },
    });

    const legacyIds = notifications
      .filter(
        (item) =>
          item.relatedEntityType === "CONVERSATION" &&
          item.relatedEntityId === entityId,
      )
      .map((item) => item.id);
    const messageNotifications = notifications.filter(
      (item) => item.relatedEntityType === "MESSAGE" && item.relatedEntityId,
    );
    const messageIds = messageNotifications.map((item) => item.relatedEntityId);

    let conversationMessageIds = new Set();
    if (messageIds.length) {
      const messages = await app.prisma.message.findMany({
        where: { id: { in: messageIds }, conversationId: entityId },
        select: { id: true },
      });
      conversationMessageIds = new Set(messages.map((item) => item.id));
    }

    notificationIds = [
      ...legacyIds,
      ...messageNotifications
        .filter((item) => conversationMessageIds.has(item.relatedEntityId))
        .map((item) => item.id),
    ];
  }

  if (!notificationIds.length) return 0;

  const result = await app.prisma.notification.updateMany({
    where: { id: { in: notificationIds }, userId, isRead: false },
    data: { isRead: true, readAt },
  });

  if (result.count) {
    app.io?.to(`user:${userId}`).emit("notification:updated", {
      relatedEntityType: entityType,
      relatedEntityId: entityId,
      isRead: true,
    });
  }

  return result.count;
}
