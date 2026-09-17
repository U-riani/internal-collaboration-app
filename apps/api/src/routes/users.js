import { z } from "zod";
import { parse } from "../lib/validation.js";
import { requirePermission, publicUser, userWithAccess } from "../lib/authz.js";
import { hashPassword } from "../lib/security.js";
import { HttpError } from "../lib/http-error.js";
import { audit } from "../lib/audit.js";

const createSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  employeeNumber: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(150).optional(),
  phone: z.string().trim().max(50).optional(),
  jobTitle: z.string().trim().max(150).optional(),
  departmentId: z.uuid().nullable().optional(),
  managerId: z.uuid().nullable().optional(),
  roleCodes: z.array(z.string().min(1)).default(["EMPLOYEE"]),
});

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  displayName: z.string().trim().min(1).max(150).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  jobTitle: z.string().trim().max(150).nullable().optional(),
  departmentId: z.uuid().nullable().optional(),
  managerId: z.uuid().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  roleCodes: z.array(z.string().min(1)).optional(),
});

export default async function userRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    requirePermission(request.authUser, "users.read");
    const users = await app.prisma.user.findMany({
      include: userWithAccess,
      orderBy: { displayName: "asc" },
    });
    return { success: true, data: users.map(publicUser) };
  });

  app.post("/", async (request, reply) => {
    requirePermission(request.authUser, "users.manage");
    const input = parse(createSchema, request.body);
    const roles = await app.prisma.role.findMany({
      where: { code: { in: input.roleCodes } },
    });
    if (roles.length !== input.roleCodes.length) {
      throw new HttpError(
        400,
        "ROLE_NOT_FOUND",
        "One or more roles do not exist",
      );
    }
    const user = await app.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        employeeNumber: input.employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName:
          input.displayName ?? `${input.firstName} ${input.lastName}`,
        phone: input.phone,
        jobTitle: input.jobTitle,
        departmentId: input.departmentId,
        managerId: input.managerId,
        roles: { create: roles.map((role) => ({ roleId: role.id })) },
      },
      include: userWithAccess,
    });
    await audit(app, request, {
      actionType: "USER_CREATED",
      entityType: "USER",
      entityId: user.id,
      afterData: publicUser(user),
    });
    reply.status(201);
    return { success: true, data: publicUser(user) };
  });

  app.get("/:id", async (request) => {
    requirePermission(request.authUser, "users.read");
    const user = await app.prisma.user.findUnique({
      where: { id: request.params.id },
      include: userWithAccess,
    });
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User was not found");
    return { success: true, data: publicUser(user) };
  });

  app.patch("/:id", async (request) => {
    requirePermission(request.authUser, "users.manage");
    const input = parse(updateSchema, request.body);
    const existing = await app.prisma.user.findUnique({
      where: { id: request.params.id },
      include: userWithAccess,
    });
    if (!existing)
      throw new HttpError(404, "USER_NOT_FOUND", "User was not found");

    let roleOperations;
    if (input.roleCodes) {
      const roles = await app.prisma.role.findMany({
        where: { code: { in: input.roleCodes } },
      });
      if (roles.length !== input.roleCodes.length)
        throw new HttpError(
          400,
          "ROLE_NOT_FOUND",
          "One or more roles do not exist",
        );
      roleOperations = {
        deleteMany: {},
        create: roles.map((role) => ({ roleId: role.id })),
      };
    }

    if (
      existing.id === request.authUser.id &&
      (input.status === "INACTIVE" ||
        (input.roleCodes && !input.roleCodes.includes("SYSTEM_ADMIN")))
    )
      throw new HttpError(
        409,
        "SELF_ACCESS_CHANGE",
        "Ask another administrator to change your own administrator access",
      );
    const user = await app.prisma.user.update({
      where: { id: request.params.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        phone: input.phone,
        jobTitle: input.jobTitle,
        departmentId: input.departmentId,
        managerId: input.managerId,
        status: input.status,
        roles: roleOperations,
        sessions:
          input.status === "INACTIVE" ||
          input.roleCodes ||
          input.departmentId !== undefined
            ? {
                updateMany: {
                  where: { revokedAt: null },
                  data: { revokedAt: new Date() },
                },
              }
            : undefined,
      },
      include: userWithAccess,
    });
    if (
      input.status === "INACTIVE" ||
      input.roleCodes ||
      input.departmentId !== undefined
    )
      app.io?.in(`user:${user.id}`).disconnectSockets(true);
    await audit(app, request, {
      actionType: "USER_UPDATED",
      entityType: "USER",
      entityId: user.id,
      beforeData: publicUser(existing),
      afterData: publicUser(user),
    });
    return { success: true, data: publicUser(user) };
  });
}
