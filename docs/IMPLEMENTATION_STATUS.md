# Implementation status — 0.2.0

The modules listed in the README have connected frontend/backend implementations. Data is persisted in PostgreSQL and private file storage. They are not mock screens.

## Changes from the uploaded version

- Added a complete Drive module with hierarchical permissions and trash/restore.
- Replaced global task broadcasts with authorization-scoped invalidation events.
- Closed foreign-attachment linking paths in tasks, messages, and approvals.
- Fixed successful login failing in audit logging.
- Bound access tokens and sockets to revocable sessions; added password changes.
- Added active-member enforcement for chat rooms, typing, search, and attachments.
- Added friendly approval form/type creation, frozen definitions, typed validation, revision conflicts, and resubmission history.
- Added simpler navigation and connected task, chat, Drive, approval, account, and audit screens.
- Added migration-based startup, non-resetting seed behavior, generated setup secrets, and optional local/S3 storage.
- Added API, live socket, and frontend component regression coverage.

## Current limits

- Single organization, one API instance, one worker. Socket.IO uses its in-process adapter; Redis does not automatically make multiple API instances safe. No horizontal scaling or load-test claim is made.
- Drive currently loads the folder tree to resolve inheritance. Several lists are unpaginated; message history is paginated, audit view shows the latest 100 entries. Add indexed/paginated authorization queries before a large deployment.
- Approval chains are sequential. No conditional branching, parallel/quorum approvals, delegation, escalation, e-signatures, or approval-type editing UI. Create a new type for a changed workflow. Existing request fields can be revised, but existing attachment sets cannot be edited in the approval form.
- Tasks include a board and status control, without drag-and-drop or recurring tasks. Parent-task linking exists through the API; there is no subtask builder UI.
- Group owners cannot leave or transfer ownership through the current UI. No per-user read receipts, reactions, mentions, message forwarding, voice/video calls, calendar, collaborative document editor, desktop sync, or mobile app.
- Search uses database text matching, with no document-content indexing.
- Deadline notifications are persisted by the worker and appear when Inbox refreshes (every minute while open). API-originated notifications use sockets. There is no email or mobile push.
- Uploaded file extensions, size, and quota are checked, but no antivirus engine runs. `scanStatus=PENDING` does not mean a file is safe. Pending uploads can be downloaded. Integrate a scanner and quarantine policy if required before broad rollout.
- No permanent trash purge, storage garbage collection, resumable uploads, or file version history. Unlinked uploads and trash count toward the uploader quota. Drive's size summary measures owned Drive items and is not the same as total uploaded bytes charged to that user.
- No SSO, MFA, email invitation/reset flow, or forced first-login password change. Administrators create initial credentials; users can change their own password. An administrator password-recovery interface is not included.
- Fixed preset roles; no custom permission editor. Infrastructure operators remain privileged. Audit records are not tamper-proof and coverage is selective.
- Dependency review results and remaining optional S3 SDK advisories are recorded in `DEPENDENCIES.md`.
- Containers, HTTPS/reverse proxy deployment, actual Redis/BullMQ execution, S3/legacy MinIO, native PostgreSQL migration tooling, backup restores, and real-browser visual/accessibility checks still need verification on the target host.

The original `FULL_PROJECT_DESCRIPTION.md`, if present, is retained as a planning reference. It is not a feature-completion claim. This status file and the README describe the delivered implementation.
