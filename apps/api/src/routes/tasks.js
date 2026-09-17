import { requireOwnUploads } from "../lib/file-access.js";
import { emitTaskEvent } from "../lib/task-events.js";
import { z } from "zod";
import { parse } from "../lib/validation.js";
import { hasPermission, hasRole } from "../lib/authz.js";
import { HttpError } from "../lib/http-error.js";
import { requireTaskAccess } from "../lib/task-access.js";
import { audit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";

const taskInclude = {
  creator: { select: { id: true, displayName: true, email: true } },
  assignee: { select: { id: true, displayName: true, email: true } },
  department: { select: { id: true, name: true, code: true } },
  participants: {
    include: { user: { select: { id: true, displayName: true, email: true } } },
  },
  attachments: { include: { file: true } },
  _count: { select: { comments: true, subtasks: true } },
};

const createSchema = z.object({
  title: z.string().trim().min(2).max(250),
  description: z.string().max(20000).optional(),
  assigneeId: z.uuid().nullable().optional(),
  departmentId: z.uuid().nullable().optional(),
  parentTaskId: z.uuid().nullable().optional(),
  status: z
    .enum([
      "DRAFT",
      "OPEN",
      "IN_PROGRESS",
      "BLOCKED",
      "WAITING_REVIEW",
      "COMPLETED",
      "CANCELLED",
    ])
    .default("OPEN"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  participantIds: z.array(z.uuid()).default([]),
  attachmentIds: z.array(z.uuid()).default([]),
});

const updateSchema = createSchema
  .partial()
  .omit({ participantIds: true, attachmentIds: true })
  .extend({
    participantIds: z.array(z.uuid()).optional(),
    attachmentIds: z.array(z.uuid()).optional(),
  });

const commentSchema = z.object({
  content: z.string().trim().min(1).max(10000),
  attachmentIds: z.array(z.uuid()).default([]),
});

function validateDates(startDate, dueDate) {
  if (startDate && dueDate && dueDate < startDate) {
    throw new HttpError(
      400,
      "TASK_INVALID_DATES",
      "Deadline cannot be before the start date",
    );
  }
}

export default async function taskRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  async function activePeople(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (
      unique.length &&
      (await app.prisma.user.count({
        where: { id: { in: unique }, status: "ACTIVE" },
      })) !== unique.length
    )
      throw new HttpError(
        400,
        "USER_UNAVAILABLE",
        "Choose active organization members",
      );
  }

  app.get("/", async (request) => {
    const query = parse(
      z.object({
        status: z.string().optional(),
        assigneeId: z.uuid().optional(),
        departmentId: z.uuid().optional(),
        q: z.string().optional(),
        archived: z.enum(["true", "false"]).optional(),
      }),
      request.query,
    );

    const access = hasRole(request.authUser, "SYSTEM_ADMIN")
      ? {}
      : {
          OR: [
            { creatorId: request.authUser.id },
            { assigneeId: request.authUser.id },
            { participants: { some: { userId: request.authUser.id } } },
            ...(hasPermission(request.authUser, "tasks.manage_department") &&
            request.authUser.departmentId
              ? [{ departmentId: request.authUser.departmentId }]
              : []),
          ],
        };

    const searchFilter = query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { description: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {};

    const data = await app.prisma.task.findMany({
      where: {
        AND: [access, searchFilter],
        status: query.status || undefined,
        assigneeId: query.assigneeId,
        departmentId: query.departmentId,
        archivedAt: query.archived === "true" ? { not: null } : null,
      },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    return { success: true, data };
  });

  app.post("/", async (request, reply) => {
    if (!hasPermission(request.authUser, "tasks.create"))
      throw new HttpError(403, "PERMISSION_DENIED", "You cannot create tasks");
    const input = parse(createSchema, request.body);
    validateDates(input.startDate, input.dueDate);
    await activePeople([input.assigneeId, ...input.participantIds]);
    await requireOwnUploads(app, request.authUser, input.attachmentIds);
    if (input.parentTaskId) {
      const parent = await app.prisma.task.findUnique({
        where: { id: input.parentTaskId },
        include: { participants: true },
      });
      if (!parent)
        throw new HttpError(404, "TASK_NOT_FOUND", "Parent task was not found");
      requireTaskAccess(request.authUser, parent);
    }
    if (
      input.assigneeId &&
      input.assigneeId !== request.authUser.id &&
      !hasPermission(request.authUser, "tasks.assign")
    ) {
      throw new HttpError(
        403,
        "TASK_ASSIGN_DENIED",
        "You cannot assign tasks to other users",
      );
    }

    const task = await app.prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        creatorId: request.authUser.id,
        assigneeId: input.assigneeId,
        departmentId: input.departmentId ?? request.authUser.departmentId,
        parentTaskId: input.parentTaskId,
        status: input.status,
        priority: input.priority,
        startDate: input.startDate,
        dueDate: input.dueDate,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
        participants: {
          create: input.participantIds.map((userId) => ({ userId })),
        },
        attachments: {
          create: input.attachmentIds.map((fileId) => ({ fileId })),
        },
        history: {
          create: {
            actorId: request.authUser.id,
            actionType: "TASK_CREATED",
            newValue: { title: input.title, status: input.status },
          },
        },
      },
      include: taskInclude,
    });

    if (task.assigneeId && task.assigneeId !== request.authUser.id) {
      await createNotification(app, {
        userId: task.assigneeId,
        type: "TASK_ASSIGNED",
        title: "New task assigned",
        body: task.title,
        relatedEntityType: "TASK",
        relatedEntityId: task.id,
      });
    }
    await emitTaskEvent(app, task.id, "task:created");
    await audit(app, request, {
      actionType: "TASK_CREATED",
      entityType: "TASK",
      entityId: task.id,
      afterData: { title: task.title, status: task.status },
    });
    reply.status(201);
    return { success: true, data: task };
  });

  app.get("/:id", async (request) => {
    const task = await app.prisma.task.findUnique({
      where: { id: request.params.id },
      include: {
        ...taskInclude,
        comments: {
          where: { deletedAt: null },
          include: {
            author: { select: { id: true, displayName: true } },
            attachments: { include: { file: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        history: {
          include: { actor: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "Task was not found");
    requireTaskAccess(request.authUser, task);
    return { success: true, data: task };
  });

  app.patch("/:id", async (request) => {
    const input = parse(updateSchema, request.body);
    const existing = await app.prisma.task.findUnique({
      where: { id: request.params.id },
      include: { participants: true },
    });
    if (!existing)
      throw new HttpError(404, "TASK_NOT_FOUND", "Task was not found");
    requireTaskAccess(request.authUser, existing);
    await activePeople([
      input.assigneeId !== existing.assigneeId ? input.assigneeId : null,
      ...(input.participantIds || []).filter(
        (id) => !existing.participants.some((p) => p.userId === id),
      ),
    ]);
    validateDates(
      input.startDate === undefined ? existing.startDate : input.startDate,
      input.dueDate === undefined ? existing.dueDate : input.dueDate,
    );

    if (
      input.assigneeId &&
      input.assigneeId !== existing.assigneeId &&
      input.assigneeId !== request.authUser.id &&
      !hasPermission(request.authUser, "tasks.assign")
    )
      throw new HttpError(
        403,
        "TASK_ASSIGN_DENIED",
        "You cannot assign tasks to other users",
      );
    const canManage =
      existing.creatorId === request.authUser.id ||
      hasRole(request.authUser, "SYSTEM_ADMIN") ||
      (hasPermission(request.authUser, "tasks.manage_department") &&
        existing.departmentId === request.authUser.departmentId);
    if (
      !canManage &&
      [
        input.assigneeId,
        input.departmentId,
        input.dueDate,
        input.priority,
        input.participantIds,
        input.attachmentIds,
        input.parentTaskId,
        input.title,
        input.description,
        input.startDate,
      ].some((value) => value !== undefined)
    ) {
      throw new HttpError(
        403,
        "TASK_MANAGE_DENIED",
        "Only the creator or manager may change assignment, department, deadline, or priority",
      );
    }

    if (
      input.parentTaskId !== undefined &&
      input.parentTaskId !== existing.parentTaskId
    )
      throw new HttpError(
        400,
        "TASK_PARENT_IMMUTABLE",
        "Create subtasks under their parent; reparenting is not supported",
      );
    if (input.attachmentIds) {
      const old = await app.prisma.taskAttachment.findMany({
        where: { taskId: existing.id },
      });
      await requireOwnUploads(
        app,
        request.authUser,
        input.attachmentIds.filter((id) => !old.some((x) => x.fileId === id)),
      );
    }
    const before = {
      title: existing.title,
      status: existing.status,
      assigneeId: existing.assigneeId,
      dueDate: existing.dueDate,
      priority: existing.priority,
    };
    const task = await app.prisma.task.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        description: input.description,
        assigneeId: input.assigneeId,
        departmentId: input.departmentId,
        parentTaskId: input.parentTaskId,
        status: input.status,
        priority: input.priority,
        startDate: input.startDate,
        dueDate: input.dueDate,
        completedAt:
          input.status === "COMPLETED"
            ? new Date()
            : input.status
              ? null
              : undefined,
        participants: input.participantIds
          ? {
              deleteMany: {},
              create: input.participantIds.map((userId) => ({ userId })),
            }
          : undefined,
        attachments: input.attachmentIds
          ? {
              deleteMany: {},
              create: input.attachmentIds.map((fileId) => ({ fileId })),
            }
          : undefined,
        history: {
          create: {
            actorId: request.authUser.id,
            actionType: "TASK_UPDATED",
            oldValue: before,
            newValue: input,
          },
        },
      },
      include: taskInclude,
    });

    if (
      input.assigneeId &&
      input.assigneeId !== existing.assigneeId &&
      input.assigneeId !== request.authUser.id
    ) {
      await createNotification(app, {
        userId: input.assigneeId,
        type: "TASK_ASSIGNED",
        title: "Task reassigned to you",
        body: task.title,
        relatedEntityType: "TASK",
        relatedEntityId: task.id,
      });
    }
    await emitTaskEvent(app, task.id, "task:updated");
    return { success: true, data: task };
  });

  app.post("/:id/comments", async (request, reply) => {
    const input = parse(commentSchema, request.body);
    const task = await app.prisma.task.findUnique({
      where: { id: request.params.id },
      include: { participants: true },
    });
    if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "Task was not found");
    requireTaskAccess(request.authUser, task);
    await requireOwnUploads(app, request.authUser, input.attachmentIds);
    const comment = await app.prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: request.authUser.id,
        content: input.content,
        attachments: {
          create: input.attachmentIds.map((fileId) => ({ fileId })),
        },
      },
      include: {
        author: { select: { id: true, displayName: true } },
        attachments: { include: { file: true } },
      },
    });
    await app.prisma.taskHistory.create({
      data: {
        taskId: task.id,
        actorId: request.authUser.id,
        actionType: "COMMENT_ADDED",
        metadata: { commentId: comment.id },
      },
    });
    await emitTaskEvent(app, task.id, "task:comment-created");
    reply.status(201);
    return { success: true, data: comment };
  });

  app.get("/:id/history", async (request) => {
    const task = await app.prisma.task.findUnique({
      where: { id: request.params.id },
      include: { participants: true },
    });
    if (!task) throw new HttpError(404, "TASK_NOT_FOUND", "Task was not found");
    requireTaskAccess(request.authUser, task);
    const data = await app.prisma.taskHistory.findMany({
      where: { taskId: task.id },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data };
  });
}
