CREATE TABLE "ApprovalGroup" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserApprovalLayout" (
    "userId" UUID NOT NULL,
    "approvalRequestId" UUID NOT NULL,
    "groupId" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserApprovalLayout_pkey" PRIMARY KEY ("userId","approvalRequestId")
);

CREATE INDEX "ApprovalGroup_ownerId_archivedAt_position_idx"
ON "ApprovalGroup"("ownerId", "archivedAt", "position");

CREATE INDEX "UserApprovalLayout_userId_groupId_position_idx"
ON "UserApprovalLayout"("userId", "groupId", "position");

CREATE INDEX "UserApprovalLayout_groupId_idx"
ON "UserApprovalLayout"("groupId");

ALTER TABLE "ApprovalGroup"
ADD CONSTRAINT "ApprovalGroup_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserApprovalLayout"
ADD CONSTRAINT "UserApprovalLayout_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserApprovalLayout"
ADD CONSTRAINT "UserApprovalLayout_approvalRequestId_fkey"
FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserApprovalLayout"
ADD CONSTRAINT "UserApprovalLayout_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "ApprovalGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
