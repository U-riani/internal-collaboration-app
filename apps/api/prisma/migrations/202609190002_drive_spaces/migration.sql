-- Drive spaces split personal content from intentional shared workspaces.
CREATE TYPE "DriveSpaceType" AS ENUM ('PERSONAL', 'GLOBAL', 'GROUP');
CREATE TYPE "DriveSpaceRole" AS ENUM ('VIEWER', 'EDITOR', 'MANAGER');
CREATE TYPE "DrivePermissionMode" AS ENUM ('INHERIT', 'CUSTOM');
CREATE TYPE "DriveGrantScope" AS ENUM ('ITEM_ONLY', 'DESCENDANTS');

CREATE TABLE "DriveSpace" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "DriveSpaceType" NOT NULL,
  "ownerUserId" UUID,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriveSpace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriveSpaceMember" (
  "spaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "DriveSpaceRole" NOT NULL DEFAULT 'VIEWER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriveSpaceMember_pkey" PRIMARY KEY ("spaceId","userId")
);

CREATE UNIQUE INDEX "DriveSpace_key_key" ON "DriveSpace"("key");
CREATE UNIQUE INDEX "DriveSpace_ownerUserId_key" ON "DriveSpace"("ownerUserId");
CREATE INDEX "DriveSpace_type_idx" ON "DriveSpace"("type");
CREATE INDEX "DriveSpace_createdById_idx" ON "DriveSpace"("createdById");
CREATE INDEX "DriveSpaceMember_userId_role_idx" ON "DriveSpaceMember"("userId","role");

ALTER TABLE "DriveItem" ADD COLUMN "spaceId" UUID;
ALTER TABLE "DriveItem" ADD COLUMN "permissionMode" "DrivePermissionMode" NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "DriveGrant" ADD COLUMN "scope" "DriveGrantScope" NOT NULL DEFAULT 'ITEM_ONLY';

-- Every user gets a personal space. Existing Drive trees are assigned to their owner's space.
INSERT INTO "DriveSpace" ("id","key","name","type","ownerUserId","createdById","createdAt","updatedAt")
SELECT gen_random_uuid(), 'personal:' || u."id"::text, 'Personal', 'PERSONAL', u."id", u."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "DriveSpace" ("id","key","name","type","ownerUserId","createdById","createdAt","updatedAt")
VALUES (gen_random_uuid(), 'global', 'Global', 'GLOBAL', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

UPDATE "DriveItem" i
SET "spaceId" = s."id"
FROM "DriveSpace" s
WHERE s."ownerUserId" = i."ownerId" AND s."type" = 'PERSONAL';

-- Preserve old inherited-folder behavior for shares that existed before this migration.
UPDATE "DriveGrant" SET "scope" = 'DESCENDANTS';

ALTER TABLE "DriveItem" ALTER COLUMN "spaceId" SET NOT NULL;

CREATE INDEX "DriveItem_spaceId_parentId_deletedAt_idx" ON "DriveItem"("spaceId","parentId","deletedAt");

ALTER TABLE "DriveSpace"
  ADD CONSTRAINT "DriveSpace_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriveSpace"
  ADD CONSTRAINT "DriveSpace_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DriveSpaceMember"
  ADD CONSTRAINT "DriveSpaceMember_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "DriveSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriveSpaceMember"
  ADD CONSTRAINT "DriveSpaceMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriveItem"
  ADD CONSTRAINT "DriveItem_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "DriveSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
