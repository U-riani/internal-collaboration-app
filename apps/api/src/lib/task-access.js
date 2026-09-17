import { hasRole, hasPermission } from "./authz.js";
import { HttpError } from "./http-error.js";

export function canAccessTask(user, task) {
  if (hasRole(user, "SYSTEM_ADMIN")) return true;
  if (task.creatorId === user.id || task.assigneeId === user.id) return true;
  if (task.participants?.some((participant) => participant.userId === user.id))
    return true;
  return (
    hasPermission(user, "tasks.manage_department") &&
    user.departmentId &&
    task.departmentId === user.departmentId
  );
}

export function requireTaskAccess(user, task) {
  if (!canAccessTask(user, task)) {
    throw new HttpError(
      403,
      "TASK_ACCESS_DENIED",
      "You cannot access this task",
    );
  }
}
