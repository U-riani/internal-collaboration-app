-- Add first-class task groups and stable ordering for groups, parent tasks, and subtasks.
CREATE TABLE "TaskGroup" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "creatorId" UUID NOT NULL,
    "departmentId" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Task"
ADD COLUMN "groupId" UUID,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Give existing tasks deterministic spacing so later drag/reorder support can insert
-- positions between rows without another migration.
WITH ranked AS (
    SELECT
        "id",
        (ROW_NUMBER() OVER (
            PARTITION BY "parentTaskId"
            ORDER BY "dueDate" ASC NULLS LAST, "createdAt" ASC
        ) * 1000)::INTEGER AS "newPosition"
    FROM "Task"
)
UPDATE "Task" AS task
SET "position" = ranked."newPosition"
FROM ranked
WHERE task."id" = ranked."id";

CREATE INDEX "TaskGroup_departmentId_archivedAt_position_idx"
ON "TaskGroup"("departmentId", "archivedAt", "position");

CREATE INDEX "TaskGroup_creatorId_archivedAt_idx"
ON "TaskGroup"("creatorId", "archivedAt");

CREATE INDEX "Task_groupId_position_idx"
ON "Task"("groupId", "position");

CREATE INDEX "Task_parentTaskId_position_idx"
ON "Task"("parentTaskId", "position");

ALTER TABLE "TaskGroup"
ADD CONSTRAINT "TaskGroup_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskGroup"
ADD CONSTRAINT "TaskGroup_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "TaskGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
