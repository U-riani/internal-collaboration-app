export async function createNotification(app, input) {
  const notification = await app.prisma.notification.create({ data: input });
  app.io?.to(`user:${input.userId}`).emit("notification:created", notification);
  return notification;
}
