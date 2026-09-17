# Permissions

Permissions are enforced on the server. Hiding a button is only a convenience. The application hosts one organization; it does not implement separate tenants.

## Preset roles

| Capability | Employee | Manager | System administrator | Auditor |
| --- | --- | --- | --- | --- |
| Read people/departments | Yes | Yes | Yes | Yes |
| Drive and ordinary messaging | Yes | Yes | Yes | Only if also given another role |
| Create own tasks | Yes | Yes | Yes | No |
| Assign tasks to another person | No | Yes | Yes | No |
| Read/manage department tasks | No | Own department | All tasks | No |
| Submit approval requests | Yes | Yes | Yes | No |
| Configure approval types | No | No | Yes | No |
| Read all approvals, including attachments | No | No | Yes | Yes |
| Decide an approval | Only when assigned to the current step | Same | Same | Same |
| Manage users/departments/role assignments | No | No | Yes | No |
| View the system audit log | No | No | Yes | Yes |

The API supports multiple role codes; the administration form assigns one preset role. Preset permission definitions live in `apps/api/prisma/seed.js` and are synchronized on startup. Custom role creation/editing is not exposed. To change a preset deliberately, edit the seed definition, review the resource rules, and rerun the tests.

## Resource rules

**Drive:** ownership and explicit shares are required, even for a system administrator. A viewer can read/download. An editor can add files/folders and rename accessible items. Only the owner can move items, share/revoke access, trash, or restore. Access on a folder is inherited by descendants; grants are additive. Removing a child grant does not override a grant inherited from its parent. Moving a folder can change which inherited grants apply.

An item created inside someone else's shared folder belongs to that folder's owner. The original uploader is charged for its bytes. This prevents a revoked editor from keeping access through uploader ownership. Trashing a folder hides every descendant; restore the parent first. Trash is retained and still uses disk space. No automatic purge, ownership transfer, public links, or file versioning is implemented.

**Tasks:** creator, assignee, participants, the task department's manager role, and administrators can read. Those readers may comment and change status. Only creator, department manager, or administrator may change task details/participants; assigning another person additionally requires `tasks.assign`. Managers can assign any active organization colleague, not just their department. Participants are an explicit way to share a task across departments. The current version does not implement a separate private-task flag: a task in a department is visible to that department's manager role. Real-time task events go only to authorized user rooms and contain IDs, not task contents.

**Messages:** only active conversation members can read, search, download attachments, or receive message events. Administrators cannot read a private conversation merely because of their role. Group owners manage membership; ordinary members can leave. Removing a member removes their live room access. Own message editing has a 15-minute window. Message deletion is a soft deletion. Department and announcement creation are available through the API to the relevant managers/admins; the standard creation form offers direct messages and groups.

**Approvals:** requesters, assigned reviewers, and administrators can read a request. Auditors have read-only access to all requests. Only the assigned current reviewer can decide; an administrator has no override. A role-based approver rule must resolve to exactly one active person; use a specific user or a manager rule otherwise. Form definitions are frozen per request; revision checks prevent a stale decision from being applied twice. Earlier review rounds are preserved when a requester revises and resubmits.

**Attachments:** only your own non-Drive uploads can be attached to a task, message, or approval. Knowing another file ID or being able to download a shared file does not grant attachment redistribution rights. Downloads recheck the current resource access every time. Downloaded copies cannot be recalled from a user's device.

**Sessions:** logout, account deactivation, password change, and role/department changes revoke relevant sessions. HTTP requests and Socket.IO packets recheck session validity. Access tokens expire and sockets reconnect through the refresh flow. Password changes revoke every session for that account.

## Administrative boundaries

The administrator can grant roles and controls this self-hosted infrastructure. Application-level private Drive/chat checks do not prevent a server/database operator from accessing stored data. Storage is not end-to-end encrypted. Audit records cover selected application actions; they are not an immutable compliance ledger or a log of every download.
