import { auditModule } from "./audit.js";

// Keep database incidents small. The full exception is available in the
// protected Fastify/Pino log using the same request ID.
export async function recordDiagnostic(app, request, error, statusCode) {
  const path = request.raw?.url?.split("?")[0] || "";
  const eventType = String(error.code || (statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR")).slice(0, 100);
  const module = path.includes("/tasks") ? "TASKS"
    : path.includes("/approval") ? "APPROVALS"
    : path.includes("/drive") || path.includes("/files") ? "DRIVE"
    : path.includes("/conversation") || path.includes("/messages") ? "MESSAGES"
    : path.includes("/auth") ? "AUTHENTICATION"
    : path.includes("/users") || path.includes("/roles") ? "ADMINISTRATION"
    : auditModule("", eventType);
  return app.prisma.diagnosticEvent.create({
    data: {
      actorId: request.authUser?.id ?? null,
      eventType,
      module,
      severity: statusCode >= 500 ? "ERROR" : "WARNING",
      // Never persist arbitrary exception messages or stack traces in a user-facing database.
      message: statusCode >= 500 ? "An unexpected server error occurred" : "Request could not be completed",
      requestId: request.id,
      httpStatus: statusCode,
      method: request.method,
      path: path.slice(0, 300),
      source: /\/mobile\//.test(path) || /dart|flutter|okhttp/i.test(request.headers?.["user-agent"] || "") ? "MOBILE" : "WEB",
      ipAddress: request.ip,
      userAgent: request.headers?.["user-agent"]?.slice(0, 255),
      metadata: { errorCode: eventType },
    },
  });
}
