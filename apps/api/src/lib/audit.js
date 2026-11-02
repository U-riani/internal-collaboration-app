// Centralized, privacy-aware audit writer. Keep business changes and required
// audit records in the same Prisma transaction by passing the transaction client.
const PRIVATE_KEYS = /password|hash|token|secret|authorization|cookie|credential|privatekey|refresh|messagecontent|formdata|rawpayload|previousdata|data$|stack|attachmentcontent|^content$|^body$|^data$|^comment$|^reason$/i;
export function scrubAuditData(value, depth = 0) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.slice(0, 350);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => scrubAuditData(item, depth + 1) ?? null);
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 45)) {
      if (PRIVATE_KEYS.test(key)) continue;
      const sanitized = scrubAuditData(item, depth + 1);
      if (sanitized !== undefined) result[key] = sanitized;
    }
    return result;
  }
  return undefined;
}

export function auditModule(entityType = "", actionType = "") {
  const type = String(entityType).toUpperCase();
  const action = String(actionType).toUpperCase();
  if (/AUTH|LOGIN|SESSION|PASSWORD/.test(action)) return "AUTHENTICATION";
  if (/^TASK|SUBTASK/.test(type) || /^TASK|SUBTASK/.test(action)) return "TASKS";
  if (/APPROVAL/.test(type) || /APPROVAL/.test(action)) return "APPROVALS";
  if (/DRIVE|FILE|SHEET/.test(type) || /^DRIVE|FILE|SHEET/.test(action)) return "DRIVE";
  if (/MESSAGE|CONVERSATION|GROUP/.test(type) || /^MESSAGE|GROUP|CONVERSATION/.test(action)) return "MESSAGES";
  if (/NOTIFICATION/.test(type)) return "NOTIFICATIONS";
  if (/ROLE|PERMISSION|DEPARTMENT|USER/.test(type)) return "ADMINISTRATION";
  return "SYSTEM";
}

export async function audit(app, request, input, db = app.prisma) {
  const actionType = String(input.actionType);
  const entityType = String(input.entityType);
  const path = request.raw?.url || "";
  return db.auditLog.create({
    data: {
      actorId: input.actorId !== undefined ? input.actorId : (request.authUser?.id ?? null),
      actionType,
      entityType,
      entityId: input.entityId ?? null,
      module: input.module || auditModule(entityType, actionType),
      outcome: input.outcome || "SUCCESS",
      severity: input.severity || "INFO",
      source: input.source || (/\/mobile\//.test(path) ? "MOBILE" : "WEB"),
      requestId: request.id || null,
      ipAddress: request.ip || null,
      userAgent: request.headers?.["user-agent"]?.slice(0, 255) || null,
      beforeData: scrubAuditData(input.beforeData),
      afterData: scrubAuditData(input.afterData),
      metadata: scrubAuditData(input.metadata),
    },
  });
}
