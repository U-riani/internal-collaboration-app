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

  const notification = await app.prisma.notification.create({ data });
  app.io?.to(`user:${input.userId}`).emit("notification:created", notification);
  return notification;
}
