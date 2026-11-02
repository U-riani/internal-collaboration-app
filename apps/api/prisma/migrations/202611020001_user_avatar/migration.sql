-- Profile photos are stored privately in the existing object store.
-- Existing users keep their initials until a photo is uploaded.
ALTER TABLE "User"
  ADD COLUMN "avatarObjectKey" TEXT,
  ADD COLUMN "avatarMimeType" TEXT,
  ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);
