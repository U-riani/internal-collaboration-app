import { z } from "zod";
import { parse } from "../lib/validation.js";
import { hasRole, hasPermission, requirePermission } from "../lib/authz.js";
import { HttpError } from "../lib/http-error.js";
import { resolveApprover, requireResolvedApprover } from "../lib/approval.js";
import { createNotification } from "../lib/notifications.js";
import { requireOwnUploads } from "../lib/file-access.js";
import { formSchema, validateForm } from "../lib/approval-form.js";

const typeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/)
    .transform((x) => x.toUpperCase()),
  name: z.string().trim().min(2).max(200),
  description: z.string().max(2000).optional(),
  formSchema,
  steps: z
    .array(
      z.object({
        stepNumber: z.number().int().positive(),
        name: z.string().trim().min(2).max(150),
        approverRule: z.enum([
          "USER",
          "REQUESTER_MANAGER",
          "DEPARTMENT_MANAGER",
          "ROLE",
        ]),
        approverValue: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});
const requestSchema = z.object({
  approvalTypeId: z.uuid(),
  title: z.string().trim().min(2).max(250),
  data: z.record(z.string(), z.unknown()),
  attachmentIds: z.array(z.uuid()).max(10).default([]),
  submit: z.boolean().default(false),
});
const typeUpdateSchema = typeSchema.extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
const revisionSchema = z.object({ revision: z.number().int().nonnegative() });
const approvalGroupCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
const approvalGroupUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.position !== undefined,
    "Provide a name or position",
  );
const approvalLayoutSchema = z
  .object({
    groupId: z.uuid().nullable().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(
    (value) => value.groupId !== undefined || value.position !== undefined,
    "Provide a group or position",
  );

function requestIncludeFor(userId) {
  return {
    approvalType: true,
    requester: { select: { id: true, displayName: true, email: true } },
    steps: {
      include: { approver: { select: { id: true, displayName: true } } },
      orderBy: { stepNumber: "asc" },
    },
    comments: {
      include: { author: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    },
    attachments: {
      include: {
        file: { select: { id: true, originalName: true, sizeBytes: true } },
      },
    },
    layouts: {
      where: { userId },
      select: {
        groupId: true,
        position: true,
        group: { select: { id: true, name: true, position: true } },
      },
    },
  };
}
function presentRequest(item) {
  if (!item) return item;
  const { layouts = [], ...rest } = item;
  return { ...rest, personalLayout: layouts[0] || null };
}
function allowed(user, item) {
  return (
    hasRole(user, "SYSTEM_ADMIN") ||
    item.requesterId === user.id ||
    item.steps.some((s) => s.approverId === user.id)
  );
}
function conflict() {
  throw new HttpError(
    409,
    "APPROVAL_CHANGED",
    "This request changed. Refresh and try again",
  );
}
async function claim(tx, item, data, expected = item.revision) {
  const changed = await tx.approvalRequest.updateMany({
    where: { id: item.id, revision: expected, status: item.status },
    data: { ...data, revision: { increment: 1 } },
  });
  if (changed.count !== 1) conflict();
}
async function log(tx, user, id, action, metadata = {}) {
  await tx.auditLog.create({
    data: {
      actorId: user.id,
      entityType: "APPROVAL_REQUEST",
      entityId: id,
      actionType: action,
      metadata,
    },
  });
}
async function logType(tx, user, id, action, metadata = {}) {
  await tx.auditLog.create({
    data: {
      actorId: user.id,
      entityType: "APPROVAL_TYPE",
      entityId: id,
      actionType: action,
      metadata,
    },
  });
}
function normalizeSteps(steps) {
  const sorted = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  if (sorted.some((step, i) => step.stepNumber !== i + 1))
    throw new HttpError(
      400,
      "WORKFLOW_STEPS",
      "Steps must be numbered consecutively from 1",
    );
  return sorted;
}
async function submit(tx, id, actor, revision) {
  const item = await tx.approvalRequest.findUnique({
    where: { id },
    include: {
      ...requestIncludeFor(actor.id),
      requester: { include: { department: true } },
    },
  });
  if (!item)
    throw new HttpError(404, "APPROVAL_NOT_FOUND", "Request was not found");
  if (item.requesterId !== actor.id)
    throw new HttpError(
      403,
      "REQUESTER_REQUIRED",
      "Only the requester can submit",
    );
  if (!["DRAFT", "CHANGES_REQUESTED"].includes(item.status)) conflict();
  const snapshot = item.workflowSnapshot;
  validateForm(snapshot?.formSchema ?? item.approvalType.formSchema, item.data);
  const definitions =
    snapshot?.definitions ??
    (await tx.approvalTypeStep.findMany({
      where: { approvalTypeId: item.approvalTypeId },
      orderBy: { stepNumber: "asc" },
    }));
  const resolved = [];
  for (const step of definitions) {
    const id = await resolveApprover(
      { prisma: tx },
      step.approverRule,
      step.approverValue,
      item.requester,
    );
    requireResolvedApprover(id, step.name);
    if (!(await tx.user.findFirst({ where: { id, status: "ACTIVE" } })))
      throw new HttpError(
        409,
        "APPROVER_INACTIVE",
        `${step.name} needs an active approver`,
      );
    resolved.push({
      stepNumber: step.stepNumber,
      stepName: step.name,
      approverId: id,
      status: resolved.length ? "WAITING" : "PENDING",
    });
  }
  if (!resolved.length)
    throw new HttpError(
      409,
      "WORKFLOW_EMPTY",
      "Configure an approval step first",
    );
  const rounds = [...(Array.isArray(item.rounds) ? item.rounds : [])];
  if (item.steps.length)
    rounds.push(
      JSON.parse(
        JSON.stringify({
          submittedAt: item.submittedAt,
          data: snapshot?.roundData ?? item.data,
          steps: item.steps,
        }),
      ),
    );
  await claim(
    tx,
    item,
    {
      status: "PENDING",
      currentStepNumber: resolved[0].stepNumber,
      submittedAt: new Date(),
      completedAt: null,
      rounds,
      workflowSnapshot: { ...snapshot, roundData: item.data },
    },
    revision,
  );
  await tx.approvalRequestStep.deleteMany({ where: { approvalRequestId: id } });
  await tx.approvalRequestStep.createMany({
    data: resolved.map((x) => ({ ...x, approvalRequestId: id })),
  });
  await log(tx, actor, id, "APPROVAL_SUBMITTED");
  return tx.approvalRequest.findUnique({
    where: { id },
    include: requestIncludeFor(actor.id),
  });
}
export default async function approvalRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  async function notify(item) {
    const current = item.steps.find((x) => x.status === "PENDING");
    const ids = [
      ...new Set([item.requesterId, current?.approverId].filter(Boolean)),
    ];
    for (const userId of ids) {
      await createNotification(app, {
        userId,
        type:
          userId === current?.approverId
            ? "APPROVAL_PENDING"
            : "APPROVAL_UPDATED",
        title:
          userId === current?.approverId
            ? "A request needs your review"
            : "Your request was updated",
        body: item.title,
        relatedEntityType: "APPROVAL_REQUEST",
        relatedEntityId: item.id,
      });
      app.io?.to(`user:${userId}`).emit("approval:updated", { id: item.id });
    }
  }
  async function requireOwnedApprovalGroup(userId, groupId) {
    if (!groupId) return null;
    const group = await app.prisma.approvalGroup.findFirst({
      where: { id: groupId, ownerId: userId, archivedAt: null },
    });
    if (!group)
      throw new HttpError(
        404,
        "APPROVAL_GROUP_NOT_FOUND",
        "Your approval group was not found",
      );
    return group;
  }

  async function nextApprovalGroupPosition(userId) {
    const result = await app.prisma.approvalGroup.aggregate({
      where: { ownerId: userId, archivedAt: null },
      _max: { position: true },
    });
    return (result._max.position ?? -1000) + 1000;
  }

  async function nextApprovalLayoutPosition(userId, groupId) {
    const result = await app.prisma.userApprovalLayout.aggregate({
      where: { userId, groupId },
      _max: { position: true },
    });
    return (result._max.position ?? -1000) + 1000;
  }

  app.get("/approval-groups", async (request) => {
    const groups = await app.prisma.approvalGroup.findMany({
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

  app.post("/approval-groups", async (request, reply) => {
    const input = parse(approvalGroupCreateSchema, request.body);
    const group = await app.prisma.approvalGroup.create({
      data: {
        name: input.name,
        ownerId: request.authUser.id,
        position: await nextApprovalGroupPosition(request.authUser.id),
      },
      include: { _count: { select: { layouts: true } } },
    });
    reply.status(201);
    return {
      success: true,
      data: { ...group, canManage: true, canUse: true },
    };
  });

  app.patch("/approval-groups/:groupId", async (request) => {
    const input = parse(approvalGroupUpdateSchema, request.body);
    const group = await app.prisma.approvalGroup.findFirst({
      where: {
        id: request.params.groupId,
        ownerId: request.authUser.id,
        archivedAt: null,
      },
    });
    if (!group)
      throw new HttpError(
        404,
        "APPROVAL_GROUP_NOT_FOUND",
        "Your approval group was not found",
      );
    const updated = await app.prisma.approvalGroup.update({
      where: { id: group.id },
      data: input,
      include: { _count: { select: { layouts: true } } },
    });
    return {
      success: true,
      data: { ...updated, canManage: true, canUse: true },
    };
  });

  app.delete("/approval-groups/:groupId", async (request) => {
    const group = await app.prisma.approvalGroup.findFirst({
      where: {
        id: request.params.groupId,
        ownerId: request.authUser.id,
        archivedAt: null,
      },
    });
    if (!group)
      throw new HttpError(
        404,
        "APPROVAL_GROUP_NOT_FOUND",
        "Your approval group was not found",
      );
    await app.prisma.$transaction([
      app.prisma.userApprovalLayout.updateMany({
        where: { userId: request.authUser.id, groupId: group.id },
        data: { groupId: null },
      }),
      app.prisma.approvalGroup.update({
        where: { id: group.id },
        data: { archivedAt: new Date() },
      }),
    ]);
    return { success: true, data: { id: group.id } };
  });

  app.get("/approval-types", async () => ({
    success: true,
    data: await app.prisma.approvalType.findMany({
      where: { status: "ACTIVE" },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
      orderBy: { name: "asc" },
    }),
  }));
  app.get("/approval-types/manage", async (request) => {
    requirePermission(request.authUser, "approvals.configure");
    return {
      success: true,
      data: await app.prisma.approvalType.findMany({
        include: {
          steps: { orderBy: { stepNumber: "asc" } },
          createdBy: { select: { id: true, displayName: true } },
          _count: { select: { requests: true } },
        },
        orderBy: [{ status: "asc" }, { name: "asc" }],
      }),
    };
  });
  app.post("/approval-types", async (request, reply) => {
    requirePermission(request.authUser, "approvals.configure");
    const input = parse(typeSchema, request.body);
    const steps = normalizeSteps(input.steps);
    const { steps: _steps, ...fields } = input;
    const data = await app.prisma.$transaction(async (tx) => {
      const created = await tx.approvalType.create({
        data: {
          ...fields,
          status: "ACTIVE",
          createdById: request.authUser.id,
          steps: { create: steps },
        },
        include: { steps: { orderBy: { stepNumber: "asc" } } },
      });
      await logType(tx, request.authUser, created.id, "APPROVAL_TYPE_CREATED", {
        version: created.version,
      });
      return created;
    });
    reply.code(201);
    return { success: true, data };
  });
  app.patch("/approval-types/:id", async (request) => {
    requirePermission(request.authUser, "approvals.configure");
    const input = parse(typeUpdateSchema, request.body);
    const steps = normalizeSteps(input.steps);
    const data = await app.prisma.$transaction(async (tx) => {
      const existing = await tx.approvalType.findUnique({
        where: { id: request.params.id },
        include: {
          steps: { orderBy: { stepNumber: "asc" } },
          _count: { select: { requests: true } },
        },
      });
      if (!existing)
        throw new HttpError(404, "TYPE_NOT_FOUND", "Request type was not found");
      if (existing._count.requests > 0 && input.code !== existing.code)
        throw new HttpError(
          409,
          "TYPE_CODE_LOCKED",
          "The code cannot be changed after this request type has been used",
        );
      await tx.approvalTypeStep.deleteMany({
        where: { approvalTypeId: existing.id },
      });
      const updated = await tx.approvalType.update({
        where: { id: existing.id },
        data: {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          formSchema: input.formSchema,
          status: input.status ?? existing.status,
          version: { increment: 1 },
          steps: { create: steps },
        },
        include: {
          steps: { orderBy: { stepNumber: "asc" } },
          createdBy: { select: { id: true, displayName: true } },
          _count: { select: { requests: true } },
        },
      });
      await logType(tx, request.authUser, updated.id, "APPROVAL_TYPE_UPDATED", {
        fromVersion: existing.version,
        toVersion: updated.version,
      });
      return updated;
    });
    return { success: true, data };
  });
  app.patch("/approval-types/:id/status", async (request) => {
    requirePermission(request.authUser, "approvals.configure");
    const { status } = parse(
      z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }),
      request.body,
    );
    const data = await app.prisma.$transaction(async (tx) => {
      const existing = await tx.approvalType.findUnique({
        where: { id: request.params.id },
      });
      if (!existing)
        throw new HttpError(404, "TYPE_NOT_FOUND", "Request type was not found");
      const updated = await tx.approvalType.update({
        where: { id: existing.id },
        data: { status },
        include: {
          steps: { orderBy: { stepNumber: "asc" } },
          createdBy: { select: { id: true, displayName: true } },
          _count: { select: { requests: true } },
        },
      });
      await logType(
        tx,
        request.authUser,
        updated.id,
        status === "ACTIVE"
          ? "APPROVAL_TYPE_ACTIVATED"
          : "APPROVAL_TYPE_DEACTIVATED",
        { previousStatus: existing.status, status },
      );
      return updated;
    });
    return { success: true, data };
  });
  app.get("/approval-requests", async (request) => {
    const data = await app.prisma.approvalRequest.findMany({
      where: hasPermission(request.authUser, "approvals.audit")
        ? {}
        : {
            OR: [
              { requesterId: request.authUser.id },
              { steps: { some: { approverId: request.authUser.id } } },
            ],
          },
      include: requestIncludeFor(request.authUser.id),
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: data.map((item) => presentRequest(item)) };
  });
  app.post("/approval-requests", async (request, reply) => {
    requirePermission(request.authUser, "approvals.submit");
    const input = parse(requestSchema, request.body);
    const type = await app.prisma.approvalType.findUnique({
      where: { id: input.approvalTypeId },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });
    if (!type || type.status !== "ACTIVE")
      throw new HttpError(
        404,
        "TYPE_NOT_FOUND",
        "Select an active request type",
      );
    validateForm(type.formSchema, input.data, { draft: !input.submit });
    await requireOwnUploads(app, request.authUser, input.attachmentIds);
    const item = await app.prisma.$transaction(async (tx) => {
      const item = await tx.approvalRequest.create({
        data: {
          approvalTypeId: type.id,
          approvalTypeVersion: type.version,
          requesterId: request.authUser.id,
          departmentId: request.authUser.departmentId,
          title: input.title,
          data: input.data,
          workflowSnapshot: {
            type: {
              name: type.name,
              code: type.code,
              version: type.version,
            },
            formSchema: type.formSchema,
            definitions: type.steps.map(
              ({ stepNumber, name, approverRule, approverValue }) => ({
                stepNumber,
                name,
                approverRule,
                approverValue,
              }),
            ),
          },
          attachments: {
            create: input.attachmentIds.map((fileId) => ({ fileId })),
          },
        },
        include: requestIncludeFor(request.authUser.id),
      });
      return input.submit
        ? submit(tx, item.id, request.authUser, item.revision)
        : item;
    });
    if (input.submit) await notify(item);
    reply.code(201);
    return { success: true, data: presentRequest(item) };
  });
  app.put("/approval-requests/:id/layout", async (request) => {
    const input = parse(approvalLayoutSchema, request.body);
    const item = await app.prisma.approvalRequest.findUnique({
      where: { id: request.params.id },
      include: { steps: true },
    });
    if (!item)
      throw new HttpError(404, "APPROVAL_NOT_FOUND", "Request was not found");
    if (
      !allowed(request.authUser, item) &&
      !hasPermission(request.authUser, "approvals.audit")
    )
      throw new HttpError(
        403,
        "APPROVAL_ACCESS_DENIED",
        "You cannot organize this request",
      );

    const existing = await app.prisma.userApprovalLayout.findUnique({
      where: {
        userId_approvalRequestId: {
          userId: request.authUser.id,
          approvalRequestId: item.id,
        },
      },
    });
    const groupId =
      input.groupId === undefined ? (existing?.groupId ?? null) : input.groupId;
    await requireOwnedApprovalGroup(request.authUser.id, groupId);
    const position =
      input.position ??
      (existing && existing.groupId === groupId
        ? existing.position
        : await nextApprovalLayoutPosition(request.authUser.id, groupId));

    const layout = await app.prisma.userApprovalLayout.upsert({
      where: {
        userId_approvalRequestId: {
          userId: request.authUser.id,
          approvalRequestId: item.id,
        },
      },
      create: {
        userId: request.authUser.id,
        approvalRequestId: item.id,
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

  app.get("/approval-requests/:id", async (request) => {
    const item = await app.prisma.approvalRequest.findUnique({
      where: { id: request.params.id },
      include: requestIncludeFor(request.authUser.id),
    });
    if (!item)
      throw new HttpError(404, "APPROVAL_NOT_FOUND", "Request was not found");
    if (
      !allowed(request.authUser, item) &&
      !hasPermission(request.authUser, "approvals.audit")
    )
      throw new HttpError(
        403,
        "APPROVAL_ACCESS_DENIED",
        "You cannot view this request",
      );
    return { success: true, data: presentRequest(item) };
  });
  app.patch("/approval-requests/:id", async (request) => {
    const input = parse(
      z.object({
        title: z.string().trim().min(2).max(250),
        data: z.record(z.string(), z.unknown()),
        revision: z.number().int().nonnegative(),
      }),
      request.body,
    );
    await app.prisma.$transaction(async (tx) => {
      const item = await tx.approvalRequest.findUnique({
        where: { id: request.params.id },
        include: requestIncludeFor(request.authUser.id),
      });
      if (!item || item.requesterId !== request.authUser.id)
        throw new HttpError(
          403,
          "REQUESTER_REQUIRED",
          "Only the requester can edit",
        );
      if (!["DRAFT", "CHANGES_REQUESTED"].includes(item.status)) conflict();
      validateForm(
        item.workflowSnapshot?.formSchema ?? item.approvalType.formSchema,
        input.data,
        { draft: true },
      );
      await log(tx, request.authUser, item.id, "APPROVAL_EDITED", {
        previousData: item.data,
      });
      await claim(
        tx,
        item,
        { title: input.title, data: input.data },
        input.revision,
      );
    });
    return { success: true, data: null };
  });
  app.post("/approval-requests/:id/submit", async (request) => {
    requirePermission(request.authUser, "approvals.submit");
    const { revision } = parse(revisionSchema, request.body);
    const item = await app.prisma.$transaction((tx) =>
      submit(tx, request.params.id, request.authUser, revision),
    );
    await notify(item);
    return { success: true, data: presentRequest(item) };
  });
  app.post("/approval-requests/:id/cancel", async (request) => {
    const { revision } = parse(revisionSchema, request.body);
    await app.prisma.$transaction(async (tx) => {
      const item = await tx.approvalRequest.findUnique({
        where: { id: request.params.id },
      });
      if (!item || item.requesterId !== request.authUser.id)
        throw new HttpError(
          403,
          "REQUESTER_REQUIRED",
          "Only the requester can cancel",
        );
      if (["APPROVED", "REJECTED", "CANCELLED"].includes(item.status))
        conflict();
      await claim(
        tx,
        item,
        {
          status: "CANCELLED",
          currentStepNumber: null,
          cancelledAt: new Date(),
        },
        revision,
      );
      await tx.approvalRequestStep.updateMany({
        where: {
          approvalRequestId: item.id,
          status: { in: ["PENDING", "WAITING"] },
        },
        data: { status: "SKIPPED" },
      });
      await log(tx, request.authUser, item.id, "APPROVAL_CANCELLED");
    });
    return { success: true, data: null };
  });
  app.post("/approval-requests/:id/actions", async (request) => {
    const input = parse(
      revisionSchema.extend({
        action: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
        comment: z.string().trim().max(5000).default(""),
      }),
      request.body,
    );
    if (input.action !== "APPROVE" && !input.comment)
      throw new HttpError(
        400,
        "COMMENT_REQUIRED",
        "Explain the requested changes or rejection",
      );
    const updated = await app.prisma.$transaction(async (tx) => {
      const item = await tx.approvalRequest.findUnique({
        where: { id: request.params.id },
        include: requestIncludeFor(request.authUser.id),
      });
      if (
        !item ||
        item.status !== "PENDING" ||
        item.revision !== input.revision
      )
        conflict();
      const current = item.steps.find(
        (s) =>
          s.stepNumber === item.currentStepNumber && s.status === "PENDING",
      );
      if (!current || current.approverId !== request.authUser.id)
        throw new HttpError(
          403,
          "CURRENT_APPROVER_REQUIRED",
          "Only the current assigned approver can decide",
        );
      const next =
        input.action === "APPROVE"
          ? item.steps.find(
              (s) =>
                s.stepNumber > current.stepNumber && s.status === "WAITING",
            )
          : null;
      const status =
        input.action === "APPROVE"
          ? next
            ? "PENDING"
            : "APPROVED"
          : input.action === "REJECT"
            ? "REJECTED"
            : "CHANGES_REQUESTED";
      await claim(
        tx,
        item,
        {
          status,
          currentStepNumber: next?.stepNumber ?? null,
          completedAt: ["APPROVED", "REJECTED"].includes(status)
            ? new Date()
            : null,
        },
        input.revision,
      );
      await tx.approvalRequestStep.update({
        where: { id: current.id },
        data: {
          status: input.action === "APPROVE" ? "APPROVED" : status,
          comment: input.comment,
          actedAt: new Date(),
        },
      });
      if (next)
        await tx.approvalRequestStep.update({
          where: { id: next.id },
          data: { status: "PENDING" },
        });
      await log(tx, request.authUser, item.id, `APPROVAL_${input.action}`, {
        stepNumber: current.stepNumber,
        comment: input.comment,
      });
      return tx.approvalRequest.findUnique({
        where: { id: item.id },
        include: requestIncludeFor(request.authUser.id),
      });
    });
    await notify(updated);
    return { success: true, data: presentRequest(updated) };
  });
  app.post("/approval-requests/:id/comments", async (request, reply) => {
    const { content } = parse(
      z.object({ content: z.string().trim().min(1).max(5000) }),
      request.body,
    );
    const item = await app.prisma.approvalRequest.findUnique({
      where: { id: request.params.id },
      include: { steps: true },
    });
    if (!item || !allowed(request.authUser, item))
      throw new HttpError(
        403,
        "APPROVAL_ACCESS_DENIED",
        "You cannot comment on this request",
      );
    const data = await app.prisma.approvalComment.create({
      data: {
        approvalRequestId: item.id,
        authorId: request.authUser.id,
        content,
      },
    });
    reply.code(201);
    return { success: true, data };
  });
}
