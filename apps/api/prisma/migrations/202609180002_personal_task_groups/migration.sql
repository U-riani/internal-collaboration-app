-- Convert task grouping from shared task state into each user's personal layout.
-- Existing shared groups become personal to the user who created them.

CREATE TABLE "UserTaskLayout" (
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "groupId" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTaskLayout_pkey" PRIMARY KEY ("userId", "taskId")
);

ALTER TABLE "Task"
ADD COLUMN "subtaskPosition" INTEGER NOT NULL DEFAULT 0;

-- Keep the shared order of subtasks while top-level ordering becomes personal.
UPDATE "Task"
SET "subtaskPosition" = "position"
WHERE "parentTaskId" IS NOT NULL;

-- Preserve the old grouped view for the creator of each group.
INSERT INTO "UserTaskLayout" (
    "userId",
    "taskId",
    "groupId",
    "position",
    "createdAt",
    "updatedAt"
)
SELECT
    task_group."creatorId",
    task."id",
    task."groupId",
    task."position",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Task" AS task
JOIN "TaskGroup" AS task_group
    ON task_group."id" = task."groupId"
WHERE task."parentTaskId" IS NULL
  AND task."groupId" IS NOT NULL
ON CONFLICT ("userId", "taskId") DO NOTHING;

-- Preserve old ungrouped ordering for the task creator.
INSERT INTO "UserTaskLayout" (
    "userId",
    "taskId",
    "groupId",
    "position",
    "createdAt",
    "updatedAt"
)
SELECT
    task."creatorId",
    task."id",
    NULL,
    task."position",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Task" AS task
WHERE task."parentTaskId" IS NULL
  AND task."groupId" IS NULL
ON CONFLICT ("userId", "taskId") DO NOTHING;

ALTER TABLE "Task"
DROP CONSTRAINT IF EXISTS "Task_groupId_fkey";

DROP INDEX IF EXISTS "Task_groupId_position_idx";
DROP INDEX IF EXISTS "Task_parentTaskId_position_idx";

ALTER TABLE "Task"
DROP COLUMN "groupId",
DROP COLUMN "position";

ALTER TABLE "TaskGroup"
DROP CONSTRAINT IF EXISTS "TaskGroup_departmentId_fkey";

ALTER TABLE "TaskGroup"
DROP CONSTRAINT IF EXISTS "TaskGroup_creatorId_fkey";

DROP INDEX IF EXISTS "TaskGroup_departmentId_archivedAt_position_idx";
DROP INDEX IF EXISTS "TaskGroup_creatorId_archivedAt_idx";

ALTER TABLE "TaskGroup"
DROP COLUMN "departmentId";

ALTER TABLE "TaskGroup"
RENAME COLUMN "creatorId" TO "ownerId";

CREATE INDEX "Task_parentTaskId_subtaskPosition_idx"
ON "Task"("parentTaskId", "subtaskPosition");

CREATE INDEX "TaskGroup_ownerId_archivedAt_position_idx"
ON "TaskGroup"("ownerId", "archivedAt", "position");

CREATE INDEX "UserTaskLayout_userId_groupId_position_idx"
ON "UserTaskLayout"("userId", "groupId", "position");

CREATE INDEX "UserTaskLayout_groupId_idx"
ON "UserTaskLayout"("groupId");

ALTER TABLE "TaskGroup"
ADD CONSTRAINT "TaskGroup_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTaskLayout"
ADD CONSTRAINT "UserTaskLayout_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTaskLayout"
ADD CONSTRAINT "UserTaskLayout_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTaskLayout"
ADD CONSTRAINT "UserTaskLayout_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "TaskGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
