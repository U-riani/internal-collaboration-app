CREATE TABLE "DriveSheet" (
    "driveItemId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveSheet_pkey" PRIMARY KEY ("driveItemId")
);

CREATE INDEX "DriveSheet_updatedAt_idx" ON "DriveSheet"("updatedAt" DESC);
