import { z } from "zod";
import { requirePermission } from "../lib/authz.js";
import { parse } from "../lib/validation.js";
import { HttpError } from "../lib/http-error.js";
import { audit } from "../lib/audit.js";

const roleInclude = {
  permissions: { include: { permission: true } },
};

const roleCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z][A-Z0-9_]*$/.test(value), {
    message: "Role code must use letters, numbers, and underscores",
  });

const createRoleSchema = z.object({
  code: roleCodeSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  permissionCodes: z.array(z.string().trim().min(1)).max(100).default([]),
});

const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    permissionCodes: z.array(z.string().trim().min(1)).max(100).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one role field is required",
  });

function publicRole(role) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions,
    createdAt: role.createdAt,
  };
}

async function resolvePermissions(app, permissionCodes) {
  const uniqueCodes = [...new Set(permissionCodes)];
  const rows = await app.prisma.permission.findMany({
    where: { code: { in: uniqueCodes } },
    orderBy: { code: "asc" },
  });
  if (rows.length !== uniqueCodes.length) {
    throw new HttpError(
      400,
      "PERMISSION_NOT_FOUND",
      "One or more permissions do not exist",
    );
  }
  return rows;
}

async function revokeRoleSessions(app, roleId) {
  const users = await app.prisma.userRole.findMany({
    where: { roleId },
    select: { userId: true },
  });
  const userIds = users.map((item) => item.userId);
  if (!userIds.length) return 0;

  await app.prisma.session.updateMany({
    where: { userId: { in: userIds }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  for (const userId of userIds) {
    app.io?.in(`user:${userId}`).disconnectSockets(true);
  }
  return userIds.length;
}

export default async function roleRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/roles", async (request) => {
    requirePermission(request.authUser, "roles.manage");
    const data = await app.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return { success: true, data: data.map(publicRole) };
  });

  app.get("/permissions", async (request) => {
    requirePermission(request.authUser, "roles.manage");
    const data = await app.prisma.permission.findMany({
      orderBy: { code: "asc" },
    });
    return { success: true, data };
  });

  app.post("/roles", async (request, reply) => {
    requirePermission(request.authUser, "roles.manage");
    const input = parse(createRoleSchema, request.body);
    if (input.code === "SYSTEM_ADMIN") {
      throw new HttpError(
        409,
        "SYSTEM_ROLE_PROTECTED",
        "SYSTEM_ADMIN is a protected role",
      );
    }

    const permissionRows = await resolvePermissions(app, input.permissionCodes);
    const role = await app.prisma.role.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        permissions: {
          create: permissionRows.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
      include: roleInclude,
    });

    await audit(app, request, {
      actionType: "ROLE_CREATED",
      entityType: "ROLE",
      entityId: role.id,
      afterData: publicRole(role),
    });
    reply.status(201);
    return { success: true, data: publicRole(role) };
  });

  app.patch("/roles/:id", async (request) => {
    requirePermission(request.authUser, "roles.manage");
    const input = parse(updateRoleSchema, request.body);
    const existing = await app.prisma.role.findUnique({
      where: { id: request.params.id },
      include: roleInclude,
    });
    if (!existing) {
      throw new HttpError(404, "ROLE_NOT_FOUND", "Role was not found");
    }
    if (existing.code === "SYSTEM_ADMIN") {
      throw new HttpError(
        409,
        "SYSTEM_ROLE_PROTECTED",
        "SYSTEM_ADMIN is protected and cannot be edited",
      );
    }

    const permissionRows =
      input.permissionCodes !== undefined
        ? await resolvePermissions(app, input.permissionCodes)
        : null;

    const role = await app.prisma.role.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description,
        permissions:
          permissionRows === null
            ? undefined
            : {
                deleteMany: {},
                create: permissionRows.map((permission) => ({
                  permissionId: permission.id,
                })),
              },
      },
      include: roleInclude,
    });

    const affectedUsers =
      input.permissionCodes !== undefined
        ? await revokeRoleSessions(app, role.id)
        : 0;
    await audit(app, request, {
      actionType: "ROLE_UPDATED",
      entityType: "ROLE",
      entityId: role.id,
      beforeData: publicRole(existing),
      afterData: publicRole(role),
      metadata: { affectedUsers, sessionsRevoked: affectedUsers > 0 },
    });
    return { success: true, data: publicRole(role) };
  });

  app.get("/audit", async (request) => {
    requirePermission(request.authUser, "system.audit.read");
    const data = await app.prisma.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, displayName: true } } },
    });
    return { success: true, data };
  });
}
