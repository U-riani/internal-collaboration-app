export async function audit(app, request, input) {
  await app.prisma.auditLog.create({
    data: {
      actorId: request.authUser?.id ?? null,
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      requestId: request.id,
      ipAddress: request.ip,
      userAgent: request.headers?.["user-agent"],
      beforeData: input.beforeData,
      afterData: input.afterData,
      metadata: input.metadata,
    },
  });
}
