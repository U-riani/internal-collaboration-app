# API overview

Base: `/api/v1`. Use `Authorization: Bearer <accessToken>` after login. Refresh uses the HttpOnly, SameSite=Strict `collab_refresh_token` cookie at `/api/v1/auth`. The browser keeps access tokens in memory. All resource endpoints require an active account/session; access rules are in `PERMISSIONS.md`.

Success: `{ "success": true, "data": ... }`, optionally `meta`. Errors: `{ "success": false, "error": { "code": "...", "message": "..." }, "requestId": "..." }`. Common statuses: 400 invalid input, 401 sign-in required, 403 forbidden, 404 unavailable item, 409 conflict, 413 file/quota exceeded. API errors do not expose internal stacks. Identifiers are UUID strings.

## Authentication and administration

| Method | Path | Input / result |
| --- | --- | --- |
| POST | `/auth/login` | `{email,password}` → `{accessToken,user}` and refresh cookie |
| POST | `/auth/refresh` | Rotates refresh cookie; returns token/user |
| POST | `/auth/logout` | Revokes current cookie session |
| GET | `/auth/me` | Current public user, roles and permissions |
| POST | `/auth/password` | `{currentPassword,newPassword}` (12+ chars); revokes all own sessions |
| GET, POST | `/users` | Directory; admin creates users with name/email/password/roleCodes |
| GET, PATCH | `/users/:id` | Read user; admin edits names, departmentId, managerId, status, roleCodes |
| GET, POST | `/departments` | Directory; admin creates `{name,code,managerId?}` |
| PATCH | `/departments/:id` | Admin edits department |
| GET | `/roles` | Preset roles/permissions; requires `roles.manage` |
| GET | `/audit` | Most recent 100 recorded actions; requires `system.audit.read` |

## Drive

- `GET /drive/spaces` — list Personal, Global, and Group spaces available to the signed-in user.
- `POST /drive/spaces` — create a Group space (requires `drive.groups.create`).
- `GET|PUT /drive/spaces/:id/members` — read or replace shared-space membership; Manager access required.
- `GET /drive?spaceId=...` — browse a Personal, Global, or Group space.
- `GET /drive?view=shared-with-me` — browse direct shares from other users' Personal spaces.
- `GET /drive?view=trash` — browse the signed-in user's Personal Trash.
- `POST /drive` — create a folder or link an uploaded file into a space/folder.
- `PATCH /drive/:id` — rename or move an item within the same space.
- `GET|POST|PUT /drive/:id/shares` — inspect, add, or replace item grants. New grants default to item-only.
- Shared items use `INHERIT` or `CUSTOM` permission mode. Personal folders stay explicit and do not expose descendants unless the grant scope is `DESCENDANTS`.

## Tasks

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/tasks` | Accessible tasks; q/status/assigneeId/departmentId filters |
| POST | `/tasks` | Create task |
| GET, PATCH | `/tasks/:id` | Detail/edit or change status |
| POST | `/tasks/:id/comments` | `{content,attachmentIds?}` |
| GET | `/tasks/:id/history` | Authorized task activity |

Task input: `title`, optional `description`, `assigneeId`, `departmentId`, `parentTaskId`, `status`, `priority`, `startDate`, `dueDate`, `participantIds`, `attachmentIds`. Dates are ISO-8601, nullable. Status: DRAFT, OPEN, IN_PROGRESS, BLOCKED, WAITING_REVIEW, COMPLETED, CANCELLED. Priority: LOW, NORMAL, HIGH, URGENT. Participant/attachment arrays replace the current collection on PATCH; omit to preserve. Reparenting existing tasks is not supported.

## Approvals

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/approval-types` | Active types; create requires `approvals.configure` |
| GET, POST | `/approval-requests` | Accessible requests; create draft or immediately submit |
| GET, PATCH | `/approval-requests/:id` | Read; requester revises DRAFT/CHANGES_REQUESTED |
| POST | `/approval-requests/:id/submit` | `{revision}`; resolve and start/restart reviewers |
| POST | `/approval-requests/:id/actions` | `{revision,action,comment?}` |
| POST | `/approval-requests/:id/cancel` | `{revision}`; requester cancels unfinished request |
| POST | `/approval-requests/:id/comments` | `{content}` |

Create type example:

```json
{
  "code": "PURCHASE",
  "name": "Purchase request",
  "formSchema": {
    "reason": { "type": "textarea", "label": "Reason", "required": true },
    "amount": { "type": "number", "label": "Amount", "required": true }
  },
  "steps": [
    { "stepNumber": 1, "name": "Manager review", "approverRule": "REQUESTER_MANAGER" }
  ]
}
```

Field types: text, textarea, number, date, select (with options array), checkbox. Rules: USER (approverValue=user UUID), REQUESTER_MANAGER, DEPARTMENT_MANAGER, ROLE (approverValue=role code; exactly one active match). UI type builder supports the common field types and person/manager rules; select and ROLE are API options.

Create request: `{approvalTypeId,title,data,attachmentIds?,submit:false}`. Patch: `{title,data,revision}`. Decision action: APPROVE, REJECT, REQUEST_CHANGES; the latter two require a comment. On 409 refresh the request and let the user review its current state before retrying. Definitions are frozen at creation. Previous review rounds are retained on resubmission.

## Conversations and notifications

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/conversations` | List current memberships; create `{type,name?,memberIds,departmentId?}` |
| GET | `/conversations/:id/messages` | `?limit=50&cursor=UUID`; ascending page, meta.nextCursor for older history |
| POST | `/conversations/:id/messages` | `{content,attachmentIds?,replyToMessageId?}`; content may be empty if a file is attached |
| PATCH | `/messages/:id` | Own recent message `{content}` |
| DELETE | `/messages/:id` | Soft-delete own message |
| POST | `/conversations/:id/read` | `{messageId}` |
| POST | `/conversations/:id/members` | Owner adds `{userId}` |
| DELETE | `/conversations/:id/members/:userId` | Owner removes; ordinary member may leave |
| GET | `/messages/search` | `?q=text&conversationId=UUID` (optional conversationId); membership-scoped |
| GET | `/notifications` | Current user's inbox |
| POST | `/notifications/:id/read` | Mark own item read |
| POST | `/notifications/read-all` | Mark own inbox read |

Conversation types: DIRECT, GROUP, DEPARTMENT, ANNOUNCEMENT. A direct conversation has exactly one other member and is reused for the same pair. Department/announcement creation requires additional permission. Only an announcement owner/moderator can post.

## Real-time and health

Socket.IO at `/socket.io`, with `auth: {token}`. User/session/conversation rooms are assigned server-side. Client events: `conversation:join` (conversation UUID), `presence:heartbeat`, `message:typing:start/stop` (`{conversationId}`). Active membership is checked before joins or typing broadcasts.

Server events: `message:created/updated/deleted`, `conversation:updated/removed`, `task:created/updated/comment-created`, `approval:updated`, `notification:created`. Task events carry `{id,taskId}`; refetch the authorized resource. Refresh query data after reconnecting because events are not a durable replay log.

`/health/live` reports process liveness. `/health/ready` checks database, Redis, and configured storage (503 when unavailable). Both are outside `/api/v1` and are intended for internal monitoring.
