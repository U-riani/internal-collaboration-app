import { z } from "zod";
import { parse } from "../lib/validation.js";
import { requirePermission } from "../lib/authz.js";
import { audit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";

const createSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .transform((value) => value.toUpperCase()),
  managerId: z.uuid().nullable().optional(),
});

const updateSchema = createSchema.partial();

export default async function departmentRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    requirePermission(request.authUser, "users.read");
    const data = await app.prisma.department.findMany({
      include: {
        manager: { select: { id: true, displayName: true, email: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    });
    return { success: true, data };
  });

  app.post("/", async (request, reply) => {
    requirePermission(request.authUser, "users.manage");
    const input = parse(createSchema, request.body);
    const department = await app.prisma.department.create({ data: input });
    await audit(app, request, {
      actionType: "DEPARTMENT_CREATED",
      entityType: "DEPARTMENT",
      entityId: department.id,
      afterData: department,
    });
    reply.status(201);
    return { success: true, data: department };
  });

  app.patch("/:id", async (request) => {
    requirePermission(request.authUser, "users.manage");
    const input = parse(updateSchema, request.body);
    const existing = await app.prisma.department.findUnique({
      where: { id: request.params.id },
    });
    if (!existing)
      throw new HttpError(
        404,
        "DEPARTMENT_NOT_FOUND",
        "Department was not found",
      );
    const department = await app.prisma.department.update({
      where: { id: existing.id },
      data: input,
    });
    await audit(app, request, {
      actionType: "DEPARTMENT_UPDATED",
      entityType: "DEPARTMENT",
      entityId: department.id,
      beforeData: existing,
      afterData: department,
    });
    return { success: true, data: department };
  });
}
