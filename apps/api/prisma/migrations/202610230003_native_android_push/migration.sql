-- Native Android FCM registrations and durable delivery outbox.
CREATE TABLE "NativePushDevice" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "token" VARCHAR(4096) NOT NULL,
  "platform" VARCHAR(16) NOT NULL DEFAULT 'ANDROID',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NativePushDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NativePushDevice_token_key" ON "NativePushDevice"("token");
CREATE INDEX "NativePushDevice_userId_idx" ON "NativePushDevice"("userId");
CREATE INDEX "NativePushDevice_sessionId_idx" ON "NativePushDevice"("sessionId");
ALTER TABLE "NativePushDevice" ADD CONSTRAINT "NativePushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NativePushDevice" ADD CONSTRAINT "NativePushDevice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NativePushDelivery" (
  "id" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "eventKey" VARCHAR(128) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" VARCHAR(512),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativePushDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NativePushDelivery_deviceId_eventKey_key" ON "NativePushDelivery"("deviceId", "eventKey");
CREATE INDEX "NativePushDelivery_nextAttemptAt_leaseUntil_idx" ON "NativePushDelivery"("nextAttemptAt", "leaseUntil");
ALTER TABLE "NativePushDelivery" ADD CONSTRAINT "NativePushDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NativePushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NativePushDelivery" ADD CONSTRAINT "NativePushDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
