import { canAccessTask } from "./task-access.js";
import { userWithAccess } from "./authz.js";

export async function emitTaskEvent(app, taskId, event) {
  const task = await app.prisma.task.findUnique({
    where: { id: taskId },
    include: {
      participants: true,
      parentTask: { include: { participants: true } },
      subtasks: { include: { participants: true } },
    },
  });
  if (!task) return;
  const users = await app.prisma.user.findMany({
    where: { status: "ACTIVE" },
    include: userWithAccess,
  });
  const rooms = users
    .filter(
      (user) =>
        canAccessTask(user, task) ||
        (task.parentTask && canAccessTask(user, task.parentTask)) ||
        task.subtasks.some((subtask) => canAccessTask(user, subtask)),
    )
    .map((user) => `user:${user.id}`);
  // Invalidation only; clients fetch current authorized data via the API.
  if (rooms.length)
    app.io?.to(rooms).emit(event, { id: task.id, taskId: task.id });
}
