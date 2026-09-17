-- CreateEnum
CREATE TYPE "DriveKind" AS ENUM ('FOLDER', 'FILE');

-- CreateEnum
CREATE TYPE "DriveAccess" AS ENUM ('VIEWER', 'EDITOR');

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rounds" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "DriveItem" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DriveKind" NOT NULL,
    "ownerId" UUID NOT NULL,
    "parentId" UUID,
    "fileId" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveGrant" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "userId" UUID,
    "departmentId" UUID,
    "access" "DriveAccess" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveItem_fileId_key" ON "DriveItem"("fileId");

-- CreateIndex
CREATE INDEX "DriveItem_parentId_deletedAt_idx" ON "DriveItem"("parentId", "deletedAt");

-- CreateIndex
CREATE INDEX "DriveItem_ownerId_deletedAt_idx" ON "DriveItem"("ownerId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriveGrant_itemId_userId_key" ON "DriveGrant"("itemId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriveGrant_itemId_departmentId_key" ON "DriveGrant"("itemId", "departmentId");

-- AddForeignKey
ALTER TABLE "DriveItem" ADD CONSTRAINT "DriveItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveItem" ADD CONSTRAINT "DriveItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DriveItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveItem" ADD CONSTRAINT "DriveItem_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveGrant" ADD CONSTRAINT "DriveGrant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DriveItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveGrant" ADD CONSTRAINT "DriveGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveGrant" ADD CONSTRAINT "DriveGrant_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

