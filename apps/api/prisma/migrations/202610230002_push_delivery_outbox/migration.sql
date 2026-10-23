-- Durable, deduplicated retry queue for browser push deliveries.
CREATE TABLE "PushDelivery" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "eventKey" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDelivery_subscriptionId_eventKey_key"
    ON "PushDelivery"("subscriptionId", "eventKey");
CREATE INDEX "PushDelivery_nextAttemptAt_leaseUntil_idx"
    ON "PushDelivery"("nextAttemptAt", "leaseUntil");

ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
