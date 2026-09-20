-- Approval bases are queried by request type, then usually by status and newest first.
CREATE INDEX "ApprovalRequest_approvalTypeId_createdAt_idx"
ON "ApprovalRequest"("approvalTypeId", "createdAt" DESC);

CREATE INDEX "ApprovalRequest_approvalTypeId_status_createdAt_idx"
ON "ApprovalRequest"("approvalTypeId", "status", "createdAt" DESC);
