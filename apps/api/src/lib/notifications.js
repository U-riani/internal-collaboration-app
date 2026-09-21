export async function createNotification(app, input) {
  let data = input;
  if (
    input.type === "MESSAGE" &&
    input.relatedEntityType === "CONVERSATION" &&
    input.relatedEntityId
  ) {
    const message = await app.prisma.message.findFirst({
      where: { conversationId: input.relatedEntityId },
      select: { id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (message) {
      data = {
        ...input,
        relatedEntityType: "MESSAGE",
        relatedEntityId: message.id,
      };
    }
  }

  if (data.deduplicationKey) {
    const inserted = await app.prisma.notification.createMany({
      data: [data],
      skipDuplicates: true,
    });
    const notification = await app.prisma.notification.findUnique({
      where: { deduplicationKey: data.deduplicationKey },
    });
    if (inserted.count && notification)
      app.io
        ?.to(`user:${input.userId}`)
        .emit("notification:created", notification);
    return notification;
  }

  const notification = await app.prisma.notification.create({ data });
  app.io?.to(`user:${input.userId}`).emit("notification:created", notification);
  return notification;
}
