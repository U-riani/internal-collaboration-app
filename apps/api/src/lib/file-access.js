import { HttpError } from "./http-error.js";
import { canAccessTask } from "./task-access.js";
import { driveAccess, driveTree } from "./drive-access.js";
import { hasPermission } from "./authz.js";

export const fileAccessInclude = {
  driveItem: true,
  messageAttachments: {
    include: { message: { select: { conversationId: true, deletedAt: true } } },
  },
  taskAttachments: true,
  taskCommentAttachments: {
    include: { taskComment: { select: { taskId: true, deletedAt: true } } },
  },
  approvalAttachments: {
    include: { approvalRequest: { include: { steps: true } } },
  },
};

export async function canAccessFile(app, user, file) {
  if (file.deletedAt || file.scanStatus === "INFECTED") return false;
  if (file.driveItem) {
    if (!hasPermission(user, "drive.use")) return false;
    const tree = await driveTree(app.prisma);
    return Boolean(driveAccess(user, tree.get(file.driveItem.id), tree));
  }
  if (file.uploadedById === user.id) return true;
  for (const link of file.messageAttachments) {
    if (link.message.deletedAt) continue;
    const member = await app.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: link.message.conversationId,
          userId: user.id,
        },
      },
    });
    if (member && !member.leftAt) return true;
  }
  for (const taskId of [
    ...file.taskAttachments.map((x) => x.taskId),
    ...file.taskCommentAttachments
      .filter((x) => !x.taskComment.deletedAt)
      .map((x) => x.taskComment.taskId),
  ]) {
    const task = await app.prisma.task.findUnique({
      where: { id: taskId },
      include: { participants: true },
    });
    if (task && canAccessTask(user, task)) return true;
  }
  return file.approvalAttachments.some(
    ({ approvalRequest: item }) =>
      item.requesterId === user.id ||
      item.steps.some((s) => s.approverId === user.id) ||
      hasPermission(user, "approvals.audit"),
  );
}

// Only your own non-Drive uploads may be attached. Reading a shared file never
// implicitly grants the ability to redistribute it into another resource.
export async function requireOwnUploads(
  app,
  user,
  ids = [],
  { unlinked = false } = {},
) {
  if (ids.length !== new Set(ids).size)
    throw new HttpError(
      400,
      "DUPLICATE_ATTACHMENTS",
      "Duplicate attachments are not allowed",
    );
  if (!ids.length) return;
  const files = await app.prisma.fileObject.findMany({
    where: { id: { in: ids } },
    include: fileAccessInclude,
  });
  if (
    files.length !== ids.length ||
    files.some(
      (f) =>
        f.deletedAt ||
        f.scanStatus === "INFECTED" ||
        f.uploadedById !== user.id ||
        f.driveItem ||
        (unlinked && hasLinks(f)),
    )
  ) {
    throw new HttpError(
      403,
      "ATTACHMENT_ACCESS_DENIED",
      "Attach only files you uploaded for this request",
    );
  }
}

export function hasLinks(file) {
  return (
    file.driveItem ||
    [
      "messageAttachments",
      "taskAttachments",
      "taskCommentAttachments",
      "approvalAttachments",
    ].some((key) => file[key]?.length)
  );
}
