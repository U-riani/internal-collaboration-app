import { z } from "zod";
import { parse } from "../lib/validation.js";
import { requirePermission, hasPermission } from "../lib/authz.js";
import { HttpError } from "../lib/http-error.js";
import { auditModule } from "../lib/audit.js";

const actor = {
  select: {
    id: true,
    displayName: true,
    email: true,
    jobTitle: true,
    department: { select: { name: true } },
  },
};
const filtersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  start: z.string().optional(),
  end: z.string().optional(),
  q: z.string().trim().max(150).optional(),
  module: z.string().max(40).optional(),
  outcome: z.enum(["SUCCESS", "FAILED", "DENIED"]).optional(),
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]).optional(),
  actorId: z.uuid().optional(),
  source: z.enum(["WEB", "MOBILE", "SYSTEM"]).optional(),
  category: z.enum(["security"]).optional(),
});
function getFilters(request) {
  const input = parse(filtersSchema, request.query);
  const start = input.start ? new Date(input.start) : new Date(Date.now() - 7 * 86400000);
  const end = input.end ? new Date(input.end) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end)
    throw new HttpError(400, "INVALID_DATE_RANGE", "Select a valid date range");
  return { ...input, start, end };
}
function auditWhere(f) {
  const where = { createdAt: { gte: f.start, lte: f.end } };
  if (f.module) {
    const legacyEntities = {
      MESSAGES: ["MESSAGE", "CONVERSATION"],
      TASKS: ["TASK"],
      APPROVALS: ["APPROVAL_REQUEST", "APPROVAL_TYPE"],
      DRIVE: ["DRIVE_ITEM", "DRIVE_SPACE", "FILE_OBJECT", "DRIVE_SHEET"],
      ADMINISTRATION: ["USER", "ROLE", "DEPARTMENT"],
      NOTIFICATIONS: ["NOTIFICATION"],
    };
    where.AND = [{ OR: [
      { module: f.module },
      { module: null, entityType: { in: legacyEntities[f.module] || [] } },
      ...(f.module === "AUTHENTICATION" ? [{ module: null, actionType: { startsWith: "AUTH_" } }] : []),
    ] }];
  }
  if (f.outcome) where.outcome = f.outcome;
  if (f.severity) where.severity = f.severity;
  if (f.actorId) where.actorId = f.actorId;
  if (f.source) where.source = f.source;
  if (f.category === "security") where.AND = [...(where.AND || []), { OR: [
    { actionType: { startsWith: "AUTH_" } },
    { actionType: { startsWith: "ROLE_" } },
    { actionType: { startsWith: "USER_PASSWORD_" } },
    { outcome: "DENIED" },
  ] }];
  if (f.q) where.OR = [
    { actionType: { contains: f.q, mode: "insensitive" } },
    { entityType: { contains: f.q, mode: "insensitive" } },
    { entityId: { contains: f.q, mode: "insensitive" } },
    { requestId: { contains: f.q, mode: "insensitive" } },
    { actor: { displayName: { contains: f.q, mode: "insensitive" } } },
  ];
  return where;
}
function diagnosticWhere(f) {
  const where = { createdAt: { gte: f.start, lte: f.end } };
  if (f.module) where.module = f.module;
  if (f.severity) where.severity = f.severity;
  if (f.actorId) where.actorId = f.actorId;
  if (f.source) where.source = f.source;
  if (f.q) where.OR = [
    { eventType: { contains: f.q, mode: "insensitive" } },
    { message: { contains: f.q, mode: "insensitive" } },
    { requestId: { contains: f.q, mode: "insensitive" } },
    { actor: { displayName: { contains: f.q, mode: "insensitive" } } },
  ];
  return where;
}
function withPage(rows, total, f) {
  return { success: true, data: rows, meta: {
    total, page: f.page, limit: f.limit,
    pages: Math.max(1, Math.ceil(total / f.limit)),
  } };
}
function presentAudit(row) {
  // Backwards compatibility: historical audit events have no module column.
  return { ...row, module: row.module || auditModule(row.entityType, row.actionType) };
}
function csvCell(value) {
  let text = String(value ?? "").replace(/[\r\n]/g, " ");
  // Prevent formula injection when opening the export in a spreadsheet.
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export default async function auditRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/actors", async (request) => {
    requirePermission(request.authUser, "system.audit.read");
    const users = await app.prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, displayName: true, department: { select: { name: true } } },
      orderBy: { displayName: "asc" }, take: 300,
    });
    return { success: true, data: users };
  });

  app.get("/events", async (request) => {
    requirePermission(request.authUser, "system.audit.read");
    const f = getFilters(request);
    const where = auditWhere(f);
    const [rows, total] = await Promise.all([
      app.prisma.auditLog.findMany({
        where, include: { actor }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (f.page - 1) * f.limit, take: f.limit,
      }),
      app.prisma.auditLog.count({ where }),
    ]);
    return withPage(rows.map(presentAudit), total, f);
  });

  app.get("/events/:id", async (request) => {
    requirePermission(request.authUser, "system.audit.read");
    const id = parse(z.uuid(), request.params.id);
    const item = await app.prisma.auditLog.findUnique({ where: { id }, include: { actor } });
    if (!item) throw new HttpError(404, "AUDIT_NOT_FOUND", "Audit event was not found");
    return { success: true, data: presentAudit(item) };
  });

  app.get("/summary", async (request) => {
    requirePermission(request.authUser, "system.audit.read");
    const f = getFilters(request);
    const where = { createdAt: { gte: f.start, lte: f.end } };
    const security = {
      ...where,
      OR: [
        { actionType: { startsWith: "AUTH_" } },
        { actionType: { startsWith: "USER_PASSWORD_" } },
        { actionType: { startsWith: "ROLE_" } },
        { outcome: "DENIED" },
      ],
    };
    const [totalEvents, failedAudit, securityEvents, activeActors, failedDiagnostics] = await Promise.all([
      app.prisma.auditLog.count({ where }),
      app.prisma.auditLog.count({ where: { ...where, outcome: { in: ["FAILED", "DENIED"] } } }),
      app.prisma.auditLog.count({ where: security }),
      app.prisma.auditLog.groupBy({ by: ["actorId"], where: { ...where, actorId: { not: null } } }),
      hasPermission(request.authUser, "system.diagnostics.read")
        ? app.prisma.diagnosticEvent.count({ where: { ...where, httpStatus: { not: 403 } } }) : Promise.resolve(0),
    ]);
    return { success: true, data: {
      totalEvents, failedActions: failedAudit + failedDiagnostics,
      securityEvents, activeUsers: activeActors.length,
    } };
  });

  app.get("/diagnostics", async (request) => {
    requirePermission(request.authUser, "system.diagnostics.read");
    const f = getFilters(request);
    const where = diagnosticWhere(f);
    const [rows, total] = await Promise.all([
      app.prisma.diagnosticEvent.findMany({
        where, include: { actor }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (f.page - 1) * f.limit, take: f.limit,
      }),
      app.prisma.diagnosticEvent.count({ where }),
    ]);
    return withPage(rows, total, f);
  });

  app.get("/diagnostics/:id", async (request) => {
    requirePermission(request.authUser, "system.diagnostics.read");
    const id = parse(z.uuid(), request.params.id);
    const item = await app.prisma.diagnosticEvent.findUnique({ where: { id }, include: { actor } });
    if (!item) throw new HttpError(404, "DIAGNOSTIC_NOT_FOUND", "Diagnostic event was not found");
    return { success: true, data: item };
  });

  app.get("/export", async (request, reply) => {
    requirePermission(request.authUser, "system.audit.read");
    const f = getFilters(request);
    const where = auditWhere(f);
    const count = await app.prisma.auditLog.count({ where });
    if (count > 5000)
      throw new HttpError(422, "EXPORT_TOO_LARGE", "Narrow your filters to export no more than 5,000 events");
    const rows = await app.prisma.auditLog.findMany({
      where, include: { actor },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5000,
    });
    const lines = [
      ["Date", "User", "Module", "Action", "Target", "Result", "Severity", "Request ID"].map(csvCell).join(","),
      ...rows.map((event) => [
        event.createdAt.toISOString(), event.actor?.displayName || "System",
        event.module || auditModule(event.entityType, event.actionType),
        event.actionType, event.entityType + ":" + (event.entityId || ""),
        event.outcome, event.severity, event.requestId || "",
      ].map(csvCell).join(",")),
    ];
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="audit-events.csv"');
    reply.header("Cache-Control", "no-store");
    return lines.join("\r\n");
  });
}
