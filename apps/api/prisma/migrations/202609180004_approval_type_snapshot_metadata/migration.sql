-- Freeze request type metadata for approvals created before type metadata was
-- included in workflowSnapshot. This keeps historical requests stable if the
-- request type is renamed later.
UPDATE "ApprovalRequest" AS request
SET "workflowSnapshot" =
  COALESCE(request."workflowSnapshot", '{}'::jsonb) ||
  jsonb_build_object(
    'type',
    jsonb_build_object(
      'name', approval_type."name",
      'code', approval_type."code",
      'version', request."approvalTypeVersion"
    )
  )
FROM "ApprovalType" AS approval_type
WHERE request."approvalTypeId" = approval_type."id"
  AND (
    request."workflowSnapshot" IS NULL
    OR NOT (request."workflowSnapshot" ? 'type')
  );
