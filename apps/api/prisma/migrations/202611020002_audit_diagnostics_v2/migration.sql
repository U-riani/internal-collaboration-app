-- Extend existing audit data without dropping or recreating historical records.
ALTER TABLE "AuditLog" ADD COLUMN "module" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "AuditLog" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'INFO';
ALTER TABLE "AuditLog" ADD COLUMN "source" TEXT;
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt" DESC, "id" DESC);
CREATE INDEX "AuditLog_module_createdAt_idx" ON "AuditLog"("module", "createdAt" DESC);
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

CREATE TABLE "DiagnosticEvent" (
  "id" UUID NOT NULL,
  "actorId" UUID,
  "eventType" TEXT NOT NULL,
  "module" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'ERROR',
  "message" TEXT NOT NULL,
  "requestId" TEXT,
  "httpStatus" INTEGER,
  "method" TEXT,
  "path" TEXT,
  "source" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiagnosticEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DiagnosticEvent" ADD CONSTRAINT "DiagnosticEvent_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DiagnosticEvent_createdAt_id_idx" ON "DiagnosticEvent"("createdAt" DESC,"id" DESC);
CREATE INDEX "DiagnosticEvent_module_createdAt_idx" ON "DiagnosticEvent"("module","createdAt" DESC);
CREATE INDEX "DiagnosticEvent_requestId_idx" ON "DiagnosticEvent"("requestId");
CREATE INDEX "DiagnosticEvent_actorId_createdAt_idx" ON "DiagnosticEvent"("actorId","createdAt" DESC);

-- Priority is application state: migrate the most recent value from historical audit entries.
ALTER TABLE "Notification" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';
UPDATE "Notification" AS n SET "priority" = previous.priority
FROM (
  SELECT DISTINCT ON ("entityId")
    "entityId",
    "metadata"->>'priority' AS priority
  FROM "AuditLog"
  WHERE "actionType" = 'NOTIFICATION_PRIORITY_SET'
    AND "entityType" = 'NOTIFICATION'
    AND "metadata"->>'priority' IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  ORDER BY "entityId", "createdAt" DESC, "id" DESC
) AS previous
WHERE n.id::text = previous."entityId";

-- Diagnostics are reserved for administrators; existing audit permissions stay unchanged.
INSERT INTO "Permission" ("id", "code", "description")
VALUES (gen_random_uuid(), 'system.diagnostics.read', 'Read technical diagnostic incidents')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.code = 'SYSTEM_ADMIN' AND p.code = 'system.diagnostics.read'
ON CONFLICT DO NOTHING;
