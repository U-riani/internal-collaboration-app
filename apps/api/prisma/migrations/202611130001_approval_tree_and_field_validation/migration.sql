-- New approval workflow definitions coexist with legacy sequential steps.
-- Existing approval types/requests remain valid without backfilling.
ALTER TABLE "ApprovalType" ADD COLUMN "workflowDefinition" JSONB;
ALTER TABLE "ApprovalRequestStep" ADD COLUMN "nodeId" TEXT;
CREATE UNIQUE INDEX "ApprovalRequestStep_approvalRequestId_nodeId_key"
  ON "ApprovalRequestStep"("approvalRequestId", "nodeId");
