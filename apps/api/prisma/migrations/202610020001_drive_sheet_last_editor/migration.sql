ALTER TABLE "DriveSheet"
ADD COLUMN "updatedById" UUID;

ALTER TABLE "DriveSheet"
ADD CONSTRAINT "DriveSheet_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DriveSheet_updatedById_idx" ON "DriveSheet"("updatedById");
