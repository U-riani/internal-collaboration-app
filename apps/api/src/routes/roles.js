import { requirePermission } from "../lib/authz.js";
export default async function roleRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.get("/roles", async (request) => {
    requirePermission(request.authUser, "roles.manage");
    const data = await app.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: "asc" },
    });
    return { success: true, data };
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
