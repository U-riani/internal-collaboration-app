-- CreateTable
CREATE TABLE "MessageReceipt" (
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "MessageReceipt_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "MessageReceipt_userId_readAt_idx" ON "MessageReceipt"("userId", "readAt");

-- CreateIndex
CREATE INDEX "MessageReceipt_messageId_deliveredAt_readAt_idx" ON "MessageReceipt"("messageId", "deliveredAt", "readAt");

-- AddForeignKey
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one receipt per historical recipient. Existing messages are treated as
-- delivered; messages at or before the legacy last-read pointer are also read.
INSERT INTO "MessageReceipt" ("messageId", "userId", "deliveredAt", "readAt")
SELECT
    m."id",
    cm."userId",
    m."createdAt",
    CASE
        WHEN notification."isRead" = true
        THEN COALESCE(notification."readAt", notification."createdAt", m."createdAt")
        WHEN last_read."createdAt" IS NOT NULL
         AND m."createdAt" <= last_read."createdAt"
        THEN m."createdAt"
        ELSE NULL
    END
FROM "Message" m
JOIN "ConversationMember" cm
  ON cm."conversationId" = m."conversationId"
 AND cm."userId" <> m."senderId"
 AND cm."joinedAt" <= m."createdAt"
LEFT JOIN "Message" last_read
  ON last_read."id" = cm."lastReadMessageId"
LEFT JOIN LATERAL (
    SELECT n."isRead", n."readAt", n."createdAt"
    FROM "Notification" n
    WHERE n."userId" = cm."userId"
      AND n."type" = 'MESSAGE'
      AND n."relatedEntityType" = 'MESSAGE'
      AND n."relatedEntityId" = m."id"::text
    ORDER BY n."createdAt" DESC
    LIMIT 1
) notification ON TRUE
WHERE cm."leftAt" IS NULL OR cm."leftAt" >= m."createdAt"
ON CONFLICT ("messageId", "userId") DO NOTHING;