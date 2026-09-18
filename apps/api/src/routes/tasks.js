import { requireOwnUploads } from "../lib/file-access.js";
import { emitTaskEvent } from "../lib/task-events.js";
import { z } from "zod";
import { parse } from "../lib/validation.js";
import { hasPermission, hasRole } from "../lib/authz.js";
import { HttpError } from "../lib/http-error.js";
import { canAccessTask, requireTaskAccess } from "../lib/task-access.js";
import { audit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";

function taskIncludeFor(userId) {
  return {
    creator: { select: { id: true, displayName: true, email: true } },
    assignee: { select: { id: true, displayName: true, email: true } },
    department: { select: { id: true, name: true, code: true } },
    parentTask: {
      select: {
        id: true,
        title: true,
        creatorId: true,
        assigneeId: true,
        departmentId: true,
        participants: { select: { userId: true } },
      },
    },
    participants: {
      include: { user: { select: { id: true, displayName: true, email: true } } },
    },
    attachments: { include: { file: true } },
    layouts: {
      where: { userId },
      select: {
        groupId: true,
        position: true,
        group: { select: { id: true, name: true, position: true } },
      },
    },
    _count: { select: { comments: true, subtasks: true } },
  };
}

function presentTask(task) {
  if (!task) return task;
  const { layouts = [], subtasks, parentTask, ...rest } = task;
  return {
    ...rest,
    parentTask: parentTask
      ? { id: parentTask.id, title: parentTask.title }
      : parentTask,
    personalLayout: layouts[0] || null,
    ...(subtasks
      ? { subtasks: subtasks.map((subtask) => presentTask(subtask)) }
      : {}),
  };
}


const createSchema = z.object({
  title: z.string().trim().min(2).max(250),
  description: z.string().max(20000).optional(),
  assigneeId: z.uuid().nullable().optional(),
  departmentId: z.uuid().nullable().optional(),
  parentTaskId: z.uuid().nullable().optional(),
  groupId: z.uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
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
  .omit({
    participantIds: true,
    attachmentIds: true,
    groupId: true,
    position: true,
  })
  .partial()
  .extend({
    participantIds: z.array(z.uuid()).optional(),
    attachmentIds: z.array(z.uuid()).optional(),
  });

const commentSchema = z.object({
  content: z.string().trim().min(1).max(10000),
  attachmentIds: z.array(z.uuid()).default([]),
});

const groupCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const groupUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  position: z.number().int().min(0).optional(),
});

const layoutSchema = z
  .object({
    groupId: z.uuid().nullable().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(
    (value) => value.groupId !== undefined || value.position !== undefined,
    "Provide a group or position",
  );

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

  function taskStakeholderIds(task, { includeParent = false } = {}) {
    const ids = new Set(
      [
        task.creatorId,
        task.assigneeId,
        ...(task.participants || []).map((participant) => participant.userId),
      ].filter(Boolean),
    );

    if (includeParent && task.parentTask) {
      ids.add(task.parentTask.creatorId);
      if (task.parentTask.assigneeId) ids.add(task.parentTask.assigneeId);
      for (const participant of task.parentTask.participants || []) {
        ids.add(participant.userId);
      }
    }

    return ids;
  }

  async function notifyTaskCommentStakeholders(task, comment, actorId) {
    const recipientIds = [
      ...taskStakeholderIds(task, {
        includeParent: Boolean(task.parentTaskId),
      }),
    ].filter((userId) => userId !== actorId);

    if (!recipientIds.length) return;

    const preview =
      comment.content.length > 180
        ? `${comment.content.slice(0, 177)}...`
        : comment.content;

    await Promise.all(
      recipientIds.map((userId) =>
        createNotification(app, {
          userId,
          type: "TASK_COMMENT",
          title: `New comment on "${task.title}"`,
          body: `${comment.author.displayName}: ${preview}`,
          relatedEntityType: "TASK",
          relatedEntityId: task.id,
        }),
      ),
    );
  }

  function directTaskAccessClauses(user) {
    return [
      { creatorId: user.id },
      { assigneeId: user.id },
      { participants: { some: { userId: user.id } } },
      ...(hasPermission(user, "tasks.manage_department") && user.departmentId
        ? [{ departmentId: user.departmentId }]
        : []),
    ];
  }

  function taskAccessWhere(user) {
    if (hasRole(user, "SYSTEM_ADMIN")) return {};
    const direct = directTaskAccessClauses(user);
    return {
      OR: [
        ...direct,
        { subtasks: { some: { OR: direct } } },
        { parentTask: { is: { OR: direct } } },
      ],
    };
  }

  function canAccessTaskFamily(user, task) {
    if (canAccessTask(user, task)) return true;
    if (task.parentTask && canAccessTask(user, task.parentTask)) return true;
    return Boolean(
      task.subtasks?.some((subtask) => canAccessTask(user, subtask)),
    );
  }

  async function requireOwnedGroup(userId, groupId) {
    if (!groupId) return null;
    const group = await app.prisma.taskGroup.findFirst({
      where: { id: groupId, ownerId: userId, archivedAt: null },
    });
    if (!group)
      throw new HttpError(
        404,
        "TASK_GROUP_NOT_FOUND",
        "Your task group was not found",
      );
    return group;
  }

  async function nextGroupPosition(userId) {
    const result = await app.prisma.taskGroup.aggregate({
      where: { ownerId: userId, archivedAt: null },
      _max: { position: true },
    });
    return (result._max.position ?? -1000) + 1000;
  }

  async function nextLayoutPosition(userId, groupId) {
    const result = await app.prisma.userTaskLayout.aggregate({
      where: { userId, groupId },
      _max: { position: true },
    });
    return (result._max.position ?? -1000) + 1000;
  }

  async function nextSubtaskPosition(parentTaskId) {
    const result = await app.prisma.task.aggregate({
      where: { parentTaskId, archivedAt: null },
      _max: { subtaskPosition: true },
    });
    return (result._max.subtaskPosition ?? -1000) + 1000;
  }

  async function loadTaskForFamilyAccess(taskId) {
    return app.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        participants: true,
        parentTask: { include: { participants: true } },
        subtasks: { include: { participants: true } },
      },
    });
  }

  app.get("/groups", async (request) => {
    const groups = await app.prisma.taskGroup.findMany({
      where: { ownerId: request.authUser.id, archivedAt: null },
      include: { _count: { select: { layouts: true } } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    return {
      success: true,
      data: groups.map((group) => ({
        ...group,
        canManage: true,
        canUse: true,
      })),
    };
  });

  app.post("/groups", async (request, reply) => {
    const input = parse(groupCreateSchema, request.body);
    const group = await app.prisma.taskGroup.create({
      data: {
        name: input.name,
        ownerId: request.authUser.id,
        position: await nextGroupPosition(request.authUser.id),
      },
      include: { _count: { select: { layouts: true } } },
    });
    reply.status(201);
    return {
      success: true,
      data: { ...group, canManage: true, canUse: true },
    };
  });

  app.patch("/groups/:groupId", async (request) => {
    const input = parse(groupUpdateSchema, request.body);
    const group = await app.prisma.taskGroup.findFirst({
      where: {
        id: request.params.groupId,
        ownerId: request.authUser.id,
        archivedAt: null,
      },
    });
    if (!group)
      throw new HttpError(
        404,
        "TASK_GROUP_NOT_FOUND",
        "Your task group was not found",
      );
    const updated = await app.prisma.taskGroup.update({
      where: { id: group.id },
      data: input,
      include: { _count: { select: { layouts: true } } },
    });
    return {
      success: true,
      data: { ...updated, canManage: true, canUse: true },
    };
  });

  app.delete("/groups/:groupId", async (request) => {
    const group = await app.prisma.taskGroup.findFirst({
      where: {
        id: request.params.groupId,
        ownerId: request.authUser.id,
        archivedAt: null,
      },
    });
    if (!group)
      throw new HttpError(
        404,
        "TASK_GROUP_NOT_FOUND",
        "Your task group was not found",
      );
    await app.prisma.$transaction([
      app.prisma.userTaskLayout.updateMany({
        where: { userId: request.authUser.id, groupId: group.id },
        data: { groupId: null },
      }),
      app.prisma.taskGroup.update({
        where: { id: group.id },
        data: { archivedAt: new Date() },
      }),
    ]);
    return { success: true, data: { id: group.id } };
  });

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

    const access = taskAccessWhere(request.authUser);
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
      include: taskIncludeFor(request.authUser.id),
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    return { success: true, data: data.map((task) => presentTask(task)) };
  });

  app.post("/", async (request, reply) => {
    if (!hasPermission(request.authUser, "tasks.create"))
      throw new HttpError(403, "PERMISSION_DENIED", "You cannot create tasks");
    const input = parse(createSchema, request.body);
    validateDates(input.startDate, input.dueDate);
    await activePeople([input.assigneeId, ...input.participantIds]);
    await requireOwnUploads(app, request.authUser, input.attachmentIds);

    let parent = null;
    if (input.parentTaskId) {
      parent = await app.prisma.task.findUnique({
        where: { id: input.parentTaskId },
        include: { participants: true },
      });
      if (!parent)
        throw new HttpError(404, "TASK_NOT_FOUND", "Parent task was not found");
      requireTaskAccess(request.authUser, parent);
      if (parent.parentTaskId)
        throw new HttpError(
          400,
          "TASK_NESTING_LIMIT",
          "Only one level of subtasks is supported",
        );
    }

    const effectiveDepartmentId = parent
      ? parent.departmentId
      : (input.departmentId ?? request.authUser.departmentId ?? null);
    if (
      parent &&
      input.departmentId &&
      input.departmentId !== parent.departmentId
    )
      throw new HttpError(
        400,
        "TASK_DEPARTMENT_MISMATCH",
        "Subtasks use the same department as their parent task",
      );

    const personalGroupId = parent ? null : (input.groupId ?? null);
    if (!parent)
      await requireOwnedGroup(request.authUser.id, personalGroupId);

    const subtaskPosition = parent
      ? (input.position ?? (await nextSubtaskPosition(parent.id)))
      : 0;
    const layoutPosition = parent
      ? null
      : (input.position ??
        (await nextLayoutPosition(request.authUser.id, personalGroupId)));

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
        departmentId: effectiveDepartmentId,
        parentTaskId: input.parentTaskId,
        subtaskPosition,
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
        layouts: parent
          ? undefined
          : {
              create: {
                userId: request.authUser.id,
                groupId: personalGroupId,
                position: layoutPosition,
              },
            },
        history: {
          create: {
            actorId: request.authUser.id,
            actionType: "TASK_CREATED",
            newValue: { title: input.title, status: input.status },
          },
        },
      },
      include: taskIncludeFor(request.authUser.id),
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
    return { success: true, data: presentTask(task) };
  });

  app.put("/:id/layout", async (request) => {
    const input = parse(layoutSchema, request.body);
    const task = await loadTaskForFamilyAccess(request.params.id);
    if (!task)
      throw new HttpError(404, "TASK_NOT_FOUND", "Task was not found");
    if (!canAccessTaskFamily(request.authUser, task))
      throw new HttpError(
        403,
        "TASK_ACCESS_DENIED",
        "You cannot organize this task",
      );
    if (task.parentTaskId)
      throw new HttpError(
        400,
        "TASK_LAYOUT_PARENT_ONLY",
        "Subtasks follow their parent task's personal group",
      );

    const existing = await app.prisma.userTaskLayout.findUnique({
      where: {
        userId_taskId: {
          userId: request.authUser.id,
          taskId: task.id,
        },
      },
    });
    const groupId =
      input.groupId === undefined ? (existing?.groupId ?? null) : input.groupId;
    await requireOwnedGroup(request.authUser.id, groupId);

    const position =
      input.position ??
      (existing && existing.groupId === groupId
        ? existing.position
        : await nextLayoutPosition(request.authUser.id, groupId));

    const layout = await app.prisma.userTaskLayout.upsert({
      where: {
        userId_taskId: {
          userId: request.authUser.id,
          taskId: task.id,
        },
      },
      create: {
        userId: request.authUser.id,
        taskId: task.id,
        groupId,
        position,
      },
      update: { groupId, position },
      include: {
        group: { select: { id: true, name: true, position: true } },
      },
    });
    return { success: true, data: layout };
  });

  app.get("/:id", async (request) => {
    const task = await app.prisma.task.findUnique({
      where: { id: request.params.id },
      include: {
        ...taskIncludeFor(request.authUser.id),
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
        subtasks: {
          where: { archivedAt: null },
          include: taskIncludeFor(request.authUser.id),
          orderBy: [{ subtaskPosition: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!task)
      throw new HttpError(404, "TASK_NOT_FOUND", "Task was not found");
    if (!canAccessTaskFamily(request.authUser, task))
      throw new HttpError(
        403,
        "TASK_ACCESS_DENIED",
        "You cannot access this task",
      );
    return { success: true, data: presentTask(task) };
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
        (id) => !existing.participants.some((participant) => participant.userId === id),
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
        input.attachmentIds.filter(
          (id) => !old.some((attachment) => attachment.fileId === id),
        ),
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
      include: taskIncludeFor(request.authUser.id),
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
    return { success: true, data: presentTask(task) };
  });

  app.post("/:id/comments", async (request, reply) => {
    const input = parse(commentSchema, request.body);
    const task = await app.prisma.task.findUnique({
      where: { id: request.params.id },
      include: {
        participants: true,
        parentTask: {
          include: { participants: true },
        },
      },
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
    await notifyTaskCommentStakeholders(task, comment, request.authUser.id);
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
