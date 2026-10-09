# Internal Collaboration App — Business Description & Business Logic

**Version:** 1.0 (business documentation)  
**Reviewed on:** 2026-10-09  
**Code reference:** [U-riani/internal-collaboration-app — prod](https://github.com/U-riani/internal-collaboration-app/tree/prod)  
**Product stage:** Advanced internal development / production deployment; acceptance testing remains necessary  
**Audience:** Company stakeholders, product owner, business analysts, developers, administrators, and future maintainers

> **Document policy:** This is an explanation of the business purpose, workflows, access decisions, and rules found in the current prod implementation, not a promise that every Lark feature exists. The previously discussed “80–90% complete” is the project owner's estimate, **not** a measured delivery or test-coverage percentage. When an item is labeled “target” or “to validate,” it must not be represented as a completed feature. Earlier planning and status documents in /docs may be outdated.

---

## 1. Executive summary

The Internal Collaboration App is a **single-company digital workspace**, inspired by the features the organization uses in Lark. Instead of using separate services for employee communication, tasks, internal approvals, and shared files, staff work inside one company-managed web application.

The core value proposition is:
- **Communicate:** direct and group messages, replies, reactions, attachments, pinned messages, and unread activity.
- **Coordinate work:** assign tasks, track progress and deadlines, collaborate through comments, organize subtasks, and view work in a list or board.
- **Control decisions:** submit structured requests through predefined, sequential approval workflows, retain decision history, and review approval records by request type.
- **Manage information:** store personal and shared files in Drive with business-facing access rules; create, import, edit, and export spreadsheets.
- **Give accountability:** present notifications, organizational directories, administrator controls, permissions, and selected audit events.

The business objective is to reduce dependence on a paid external collaboration platform, bring routine workflows under company control, make permissions customizable, and establish a foundation for future ERP or operational integrations. **The application is currently one organization, not a multi-tenant SaaS platform.**

## 2. Business scope and actors

### 2.1 Organizational scope

The company operates a single workspace containing employees, departments, roles, conversations, tasks, approval workflows, Drive spaces, notifications, and logs. Employees can collaborate across departments only when the relevant resource-specific permissions permit it. The company hosts and administers the application and its storage.

### 2.2 Business actors

| Actor | Main responsibility |
| --- | --- |
| Employee | Communicate, share permitted files, create/assign tasks, follow their work, and submit approval requests. |
| Store | Frontline/store employee role; starts with the same capabilities as Employee. |
| Manager | Do ordinary employee work plus supervise department tasks and, where permitted, create Group Drive spaces. |
| System Administrator | Manage user accounts, departments, role definitions, approval types, system audit access, and all **shared** Drive spaces. |
| Auditor | Review authorized approval records and system audit history without ordinary task/Drive/chat capability by default. |
| Task creator | Own the task's business definition: title, assignment, participants, priority, dates, etc., subject to resource rules. |
| Task assignee / participant | Work on and comment on tasks to which they have access; may update status. |
| Approval requester | Create, submit, revise when changes are requested, track, and (before finalization) cancel their request. |
| Current approver | Act on the currently pending step: approve, reject, or request changes. |
| Drive owner / space manager | Control sharing or membership for the resources they are authorized to manage. |
| Chat group owner | Manage membership of the group, while all ordinary message access still requires membership. |

A user can possess multiple roles at the API/data level; the current administration form normally selects a single role. A custom role's actual permission set can change what its holders may do.

## 3. Permissions and trust boundaries

### 3.1 Authorization model

**Authorization has two layers:**
1. **Capability authorization:** a user's roles provide named permissions, such as creating tasks or managing roles.
2. **Resource authorization:** even with the relevant capability, the user must have access to the particular conversation, task, approval request, file, or Drive space.

The server enforces decisions. A hidden or disabled frontend control by itself is **not** security.

### 3.2 Preset roles at the reviewed revision

| Business capability | Employee | Store | Manager | System Administrator | Auditor |
| --- | :---: | :---: | :---: | :---: | :---: |
| Read organization directory | Yes | Yes | Yes | Yes | Yes |
| Ordinary messaging | Yes | Yes | Yes | Yes | No* |
| Drive usage | Yes | Yes | Yes | Yes | No* |
| Create tasks | Yes | Yes | Yes | Yes | No* |
| Assign a task to another active colleague | Yes | Yes | Yes | Yes | No* |
| Manage department tasks | No | No | Own department | All | No* |
| Submit approval requests | Yes | Yes | Yes | Yes | No* |
| Decide currently assigned approval step | If current approver | If current approver | If current approver | If current approver | If current approver |
| Configure approval request types | No | No | No | Yes | No* |
| View all approval requests / attachments | No | No | No | Yes | Yes |
| Create Group Drive spaces | No | No | Yes | Yes | No* |
| Manage Global/shared Drive as administrator | No | No | Only with a specific grant | Yes | No* |
| Administer users and departments | No | No | No | Yes | No* |
| Create/edit roles and their permissions | No | No | No | Yes | No* |
| View system audit log | No | No | No | Yes | Yes |

*“No” means the **preset** Auditor role has no such permission; combining it with another/custom role could change the effective result. An auditor may decide an approval **only if actually assigned as the current approver**.

### 3.3 Custom roles and protected administrator role

- System Administrators can create additional roles, enter a role code/name/description, and select from existing capability permissions.
- Administrators can edit non-SYSTEM_ADMIN roles (including role permission assignments). Existing users' sessions are revoked when a role's permission set changes, so new access rights are reflected after sign-in.
- **SYSTEM_ADMIN is protected**: it cannot be edited via the role-management API and is treated by server authorization as having every global capability even if a role-permission record is missing.
- This does **not** mean SYSTEM_ADMIN may read everyone else's private conversations or Personal Drive. Special resource-level exceptions are described below.

### 3.4 Data boundary examples

- A private/direct chat is visible only to its active participants, not to administrators merely because they administer the platform.
- A Personal Drive is owned by its user; its files remain private unless specifically shared.
- The System Administrator has Manager access to **Global and all Group shared Drive spaces**, regardless of ordinary group membership.
- Tasks are visible to relevant stakeholders and authorized department managers; administrators have system-wide task access.
- Approval records are visible to requesters, step approvers, administrators, and users with approval-audit permission.
- Possessing a file identifier does not bypass the underlying file's authorization.

An infrastructure/database administrator could nevertheless access the self-hosted data outside application-level checks. The app is **not end-to-end encrypted**.

## 4. People, departments, and administration

**Business purpose:** maintain the organizational identity and reporting structure on which other modules depend.

**Current workflow:**
1. A System Administrator creates an employee profile with a name, unique email, initial password, and role.
2. The administrator may set a job title, phone number, department, manager, and active/inactive status.
3. An active employee signs in and receives capabilities from their assigned role(s).
4. The People directory exposes organizational information and supports search/filtering (such as department, role, and status).
5. Administrators can edit users, assign departments/managers, deactivate accounts, and set a new password for a user.
6. Users can change their own password through Account settings.

**Rules and implications:**
- Only active users can sign in and should be selected for new task assignments, message membership, or approval steps.
- Deactivation and sensitive identity/permission changes revoke applicable sessions.
- Changing a person's department/manager can affect *future* task-management access and *new* approval-step resolution.
- Departments can have a designated manager. Users may also have a separately recorded reporting manager.
- Administrator password resets and users' own password changes are distinct operations.
- Business administration is not the same thing as direct access to private employee conversations or Personal Drive data.

## 5. Messages and conversations

**Business purpose:** provide fast internal communication without routing employees through separate external chat applications.

### 5.1 Conversation lifecycle

- Employees can create or open a **direct** conversation with one colleague; the backend reuses the direct conversation for the same pair.
- Authorized staff can create **group** conversations. The API data model also supports department, project, and announcement conversation types, with extra creation/posting rules.
- A group owner manages group members; ordinary members can leave according to the membership rules.
- Removing someone from a conversation removes their further message, search, attachment, and live-event access to that conversation.

### 5.2 Message lifecycle

1. A current conversation member posts text, one or more allowed attachments, or both.
2. The message is saved as a conversation record and delivered to authorized connected members.
3. Recipients receive unread/new-message activity and delivery/read receipt state is tracked.
4. Members can reply to a specific message, react with emoji, view reactions, and pin/unpin messages.
5. A sender can edit their own message within **15 minutes**; message deletion uses a soft-delete record rather than unrestricted removal from all history.
6. Opening/reading a conversation updates applicable unread state.

### 5.3 Reactions are not new messages

**Expected and implemented business distinction:** reacting to another person's message produces a **reaction notification** for the original message's sender, not a fake chat message saying “someone reacted.” A reaction can contribute to a conversation's activity indicator, including the main sidebar and Messages conversation list, without increasing the count of newly sent messages. The same user's identical reaction is a toggle: adding creates/reactivates a notification, removing reverses the reaction. Reacting to your own message does not notify you.

The reaction indicator and Inbox are separate surfaces driven by related activity. Opening a conversation can clear the relevant reaction notification(s). Because reaction indicators have been a regression area, they require cross-role, two-way acceptance tests before claiming full reliability.

### 5.4 Membership and privacy

- Only active members can send messages, read history, search content, or download chat attachments.
- Ordinary messages cannot be sent into a conversation a user has not joined.
- Announcement posting requires the relevant owner/moderator permission.
- Presence and typing are transient information, not a permanent business decision log.
- A pinned message remains subject to conversation membership and message existence.

## 6. Task management

**Business purpose:** turn work requests and conversations into accountable, assigned activities.

### 6.1 Task data

Each task has a creator, title, optional description, optional primary assignee, optional department, status, priority, dates, optional participants, attachments, comments, history, and optional parent/subtask relationship. Tasks can also be placed in an individual's personal organizational group.

| Status | Business meaning |
| --- | --- |
| DRAFT | Saved planning item, not yet treated as active work. |
| OPEN | Work identified and available to start. |
| IN_PROGRESS | Work is actively being performed. |
| BLOCKED | Progress is obstructed. |
| WAITING_REVIEW | Work is waiting for review/feedback. |
| COMPLETED | Work has been marked complete; completion time is recorded. |
| CANCELLED | Work has been cancelled. |

Priorities: **LOW, NORMAL, HIGH, URGENT**. These are task priority labels, not an automatic escalation policy.

### 6.2 Task workflow

1. A user with tasks.create creates a task.
2. They may leave it unassigned, assign it to themselves, or assign it to **another active organization colleague** when they have tasks.assign.
3. They choose relevant participants, priority, dates, and optionally attachments.
4. The assignee receives a task-assignment notification when someone else assigns it.
5. Authorized stakeholders see the task and may discuss it through comments/attachments; appropriate users update the status.
6. The creator/authorized manager may change assignment, dates, priority, participants, and other task details.
7. Significant changes are saved in the task history, and the task remains available through list/board/filter views.

### 6.3 Task visibility and edit rights

- **View:** creator, assignee, participants, department manager with applicable capability, or System Administrator. Parent/child task family relationships also affect browsing access.
- **Comment and change status:** users with direct authorized task access.
- **Edit business fields:** creator, System Administrator, or a user permitted to manage tasks in the task's department.
- **Assign to another person:** additionally requires tasks.assign. Employee and Store presets include this permission.
- **Subtasks:** one level below a parent is supported. Subtasks use the parent's department and cannot later be reparented.
- **Personal task groups:** each user may organize their own accessible tasks into groups; one person's grouping does not globally reorganize other users' work.

The application does not currently implement a distinct “private task” switch. A task assigned to a department can be visible to its authorized department manager.

### 6.4 Task views and business signals

The frontend supplies **list and board** views, search, quick filters, sorting, visual task status, and subtask progress. Tasks can be filtered around active work, assignment, creation, participation, and completion. There are deadline-related notifications, and the Overview dashboard highlights active and overdue tasks.

**Important:** marking a parent task complete is not documented here as automatically completing every subtask; no such blanket business rule is assumed.

## 7. Approval requests and approval bases

**Business purpose:** standardize internal decisions such as purchases, equipment requests, expenses, access requests, and other company processes without relying on informal messages.

### 7.1 Request types

An authorized administrator configures a reusable request type with:
- Code, name, description, active/inactive state, and version.
- Business form fields (including required/optional values and field types).
- A numbered **sequential** list of approval steps.
- An approver-selection rule for each step: a specific USER, REQUESTER_MANAGER, DEPARTMENT_MANAGER, or a ROLE that resolves to exactly one active person.

**Current code supports editing a request type after creation.** Updating its workflow/form increments its version. If the type has already been used, its **code cannot change**. Existing requests keep a frozen snapshot of their original form/workflow definitions, so changing a type does not silently rewrite submitted history. Deactivation prevents new requests using the type, not historical review.

### 7.2 Request lifecycle

| Request state | Business meaning and allowed next action |
| --- | --- |
| DRAFT | Requester is preparing the form; may edit or submit. |
| PENDING | Submitted and awaiting the currently assigned approval step. |
| CHANGES_REQUESTED | Current approver returned the request for correction; requester can edit and resubmit. |
| APPROVED | All required sequential steps were approved. Terminal state. |
| REJECTED | An approver rejected the request. Terminal state. |
| CANCELLED | Requester cancelled before finalization. Terminal state. |
| SUBMITTED | Defined in the status model; normal submission processing moves to PENDING. |

**Typical business flow:**

~~~text
Employee creates draft
  -> employee submits validated form
  -> system resolves active approvers and freezes this round
  -> Step 1 pending -> Approve -> Step 2 pending -> ...
  -> final approval -> APPROVED

At a pending step:
  -> REJECT -> REJECTED
  -> REQUEST_CHANGES -> requester revises -> resubmits -> new review round
  -> requester CANCEL -> CANCELLED (before terminal decision)
~~~

### 7.3 Decision rules

- Only the **requester** may submit/revise/cancel their request.
- Only the **currently assigned approver** may approve, reject, or request changes. Even a System Administrator does not automatically override an assigned approver.
- Rejecting or requesting changes requires a written comment.
- Resubmission restarts the step sequence while preserving earlier review rounds.
- A revision number is checked to prevent two reviewers or browser sessions from silently overwriting the same decision.
- Approved/rejected requests and earlier reviews stay available for authorized history and audit.
- Request attachments are associated with the request and must meet ownership/access checks.

### 7.4 Approval bases

An **Approval Base** is a request-type-specific table-like view. It displays the records for one configured request type, including form columns, requester, current decision/status, and dates. The UI supports searching, filtering, sorting, and record inspection. Access to each row remains permission-scoped: ordinary users see only their own requests or those they participate in reviewing; system administrators/auditors may have broader visibility.

**Implementation distinction:** “One base per request type” is a **logical UI and query organization**, not a claim that a separate PostgreSQL physical table is automatically created for each type.

### 7.5 Personal approval organization

Users can arrange the approvals they can access into **personal groups**. Like task groups, this is a user's personal layout preference rather than shared ownership of the underlying approval request. The Approvals screen also offers list/board-like organization, quick filters, and progress indications for sequential steps.

## 8. Drive and file sharing

**Business purpose:** maintain company and personal working files under explicit, auditable access rules.

### 8.1 Spaces

| Space | Audience | Business rules |
| --- | --- | --- |
| **Personal** | Individual owner, plus explicit grantees | Private by default. Owner controls personal shares and trash. |
| **Global** | Organization-wide | Active Drive users can view by default. Managers/global administrators or specifically granted members control broader access. |
| **Group** | Selected department/team members | Explicit Viewer, Editor, or Manager membership, plus resource-level permissions. |

**System Administrator has Manager access to every shared Global/Group space, including a Group of which they are not a member.** This deliberate platform-level exception does not grant the same access to another employee's Personal space.

### 8.2 Permission levels

| Level | Typical business ability |
| --- | --- |
| VIEWER | Browse and download permitted content. |
| EDITOR | Create, rename, and modify content where resource access allows it. |
| EDITOR_DELETE | Editor rights plus the relevant shared-item trash action; typically an explicit item grant. |
| MANAGER | Manage shared-space membership, sharing policy, and deletion/restore actions. |
| OWNER | Full authority over the user's Personal space and its items. |

A shared Group space's **membership** choices are Viewer, Editor, Manager; item grants can also have Editor-delete. Resource checks can be more restrictive than the top-level workspace membership if an item is set to custom visibility.

### 8.3 File and folder workflow

1. A user opens Personal, Global, Group, or “Shared with me” areas where authorized.
2. An authorized Editor/Owner/Manager creates nested folders, uploads files, links uploaded files, or creates a spreadsheet.
3. Owners or managers may share an item with selected users/departments and choose Viewer, Editor, or Editor-delete as available.
4. Recipients access only the allowed item and descendants according to the grant's **scope**.
5. Authorized editors rename or move items within the same space; authorized people can send content to Trash; authorized owners/managers can restore it.

### 8.4 Inheritance and customized access

- In a **Personal** space, grants are explicit. A newly shared folder defaults to **ITEM_ONLY**, not access to all its contents.
- **DESCENDANTS** grants intentionally pass the specified access to nested content, including newly created children.
- Shared spaces normally use **INHERIT**. A Manager can switch selected content to **CUSTOM** access and grant access to named users/departments.
- Group custom grants must remain compatible with Group membership restrictions. A space Manager cannot be locked out of managing the space's own shared content.
- Moving a folder cannot create a loop/cycle in the folder hierarchy.
- Moving between different Drive spaces is not supported by the same item-move operation.

### 8.5 File safety and retention rules

- Files have internal metadata including uploader, storage reference, type, size, and associations.
- Downloads are reauthorized at the time of request; links are not permanent public access credentials.
- An upload owned by another person cannot be silently attached to an unrelated task/chat/approval just by knowing its ID.
- Uploaded file size is configurable and subject to quota checks; business usage should never assume “unlimited files.”
- Trashing a folder hides its descendants. Trash is **not** an automatic scheduled permanent-purge system.
- Antivirus scanning, reliable permanent cleanup, backups/restore testing, and any regulatory retention schedule require separate operational policy/verification.

## 9. Spreadsheets in Drive (Univer)

**Business purpose:** let authorized employees work with familiar spreadsheet-style data inside the company workspace and share it via Drive access.

### 9.1 Current user workflow

- Create a new spreadsheet in an authorized Drive space/folder.
- Open it in the embedded Univer spreadsheet editor.
- Enter/edit cells and use spreadsheet formatting and enabled **filter/sort** functionality.
- **Import Excel** workbook data to the application and **export/download XLSX**.
- Increase active-sheet size using “+1,000 rows,” “+10 columns,” or a total-row/column resize dialog.
- See who currently has the same spreadsheet open, by display name.
- Save changes with spreadsheet-level concurrency protection.

The initial displayed grid is **1,000 rows × 20 columns**. The frontend allows larger sheets up to its configured limits (1,048,576 rows and 16,384 columns); these are UI maxima, **not** a guarantee that very large spreadsheets will perform adequately or fit configured snapshot/upload limits.

### 9.2 Authorization

- Viewer can open and read according to Drive rights.
- Editor or a stronger Drive access level is required to save.
- The spreadsheet belongs to its Drive item. Removing Drive access must also remove edit/view authorization.
- The list of potential collaborators is derived from users with actual Drive access to that spreadsheet.

### 9.3 Conflict and collaboration business logic

Spreadsheets currently use **optimistic versioning**:
1. The user opens a saved spreadsheet version and edits locally.
2. On save, the server accepts the new workbook snapshot only when the supplied version equals the current version.
3. If another person saved first, the client loads the latest snapshot and tries a **three-way merge** (original, remote, local).
4. Non-overlapping edits can merge automatically and be saved.
5. When both people changed the same underlying data, the UI identifies the conflicting item/cell and the last editor's **display name**; the user can choose **Keep my changes** or **Use latest version**.
6. The system must not quietly overwrite a conflicting edit without user choice.

This is **shared editing with merge/conflict management**, not a claim of Google Sheets-style live per-keystroke operational transformation or conflict-free simultaneous cell cursors. Presence indicates current viewers/editors, but not a durable record of exactly which cell each person is editing.

## 10. Notifications and Inbox

**Business purpose:** make incoming work visible and help staff respond without manually checking every module.

### 10.1 Activity sources

The implemented notification model supports:
- New chat messages and **message reactions** as different activity types.
- Task assignment, task discussion/changes, deadlines, and overdue work.
- Pending approvals and request decision/state updates.
- Other system and mention-type notification categories as represented by the model.

A category existing in the data model does not guarantee that every possible trigger or UI workflow is fully implemented.

### 10.2 Delivery and read semantics

- Each notification is addressed to a particular user and records a link to the related business entity when possible.
- The Inbox allows viewing recent notifications, marking items read/unread, bulk mark-as-read, and setting a personal priority label.
- Main navigation shows summarized unread counts for Messages, Tasks, Approvals, and Inbox.
- Task/Approval detail opening and conversation read actions synchronize relevant read state; the goal is to clear an indicator when its item has actually been opened.
- Opening a reaction-related chat can clear the reaction indicator without pretending a new message was received.
- Backend events update connected clients; polling/refetch also supports reconciliation after reconnect.
- Currently the Inbox API returns a **recent window** rather than an unlimited historical notification archive.

**Known verification priority:** test reaction and unread synchronization in both directions for Employee ↔ Manager, Employee ↔ System Administrator, and Employee ↔ Employee (including group chats). These cases have previously shown intermittent/mismatched badges and must not be treated as conclusively solved by a code review alone.

## 11. Overview, People, Account, and audit

- **Overview/Dashboard:** presents active tasks, overdue tasks, approvals needing the logged-in user's decision, unread updates, a small work-focus list, and recent activity.
- **People:** search/filter company users with organizational information; not a replacement for HR payroll or employment records.
- **Account:** view identity details and change one's password.
- **Administration:** user management, roles/permission editor, department structure, and user password resets according to permissions.
- **Audit log:** users with system.audit.read may inspect the latest recorded administrative/business operations. Audit entries are **selective**, not an immutable forensic ledger of every read/download or backend event.

## 12. End-to-end business process examples

### 12.1 Onboard a new store colleague

1. System Administrator creates an active user in the store's appropriate department.
2. Administrator selects the **Store** role, records a phone/job title and manager if known, and provides the initial credentials through a secure channel.
3. The employee signs in; Store starts with the same default chat/Drive/task/approval capabilities as Employee.
4. The employee can be assigned tasks by others and can assign work to another active colleague.
5. Shared-space content and private chats remain subject to **membership and file-level** permissions.

**Acceptance rule:** giving Store the ordinary Employee capabilities must not accidentally give company-wide user administration or all-department task management.

### 12.2 Assign and complete cross-department work

1. User A creates a task and assigns User B in a different department.
2. Server validates both authorization and the recipient's active user status.
3. User B receives an assignment notification.
4. User B and explicit participants can open, comment, and update status.
5. User A, authorized department managers, and System Administrator may manage core task details according to their rights.
6. Task history records the important changes; each user can organize the visible task within their personal groups.

**Acceptance rule:** authorization follows the **task relationship**, not an unconditional rule that employees may browse every task in the company.

### 12.3 Approve an equipment request

1. System Administrator maintains an **Equipment Request** type with the relevant form and review steps.
2. Employee creates a draft, completes the form, and submits.
3. The system freezes request/form/workflow definitions, resolves current approvers, and sets step 1 pending.
4. The current approver approves, rejects, or requests changes.
5. Approvals advance sequentially. Corrections lead to requester revision/resubmission with the previous decision round preserved.
6. Requester, reviewers, and authorized auditors view permitted status and history; Approval Base presents the records by type.

**Acceptance rule:** a non-current approver, including an administrator who is not that request's current reviewer, cannot make the decision.

### 12.4 Share a team spreadsheet

1. Manager creates a Group Drive space and grants membership.
2. Editor creates a spreadsheet in a shared folder.
3. Colleagues with Viewer access open it; Editors make changes.
4. Concurrent sessions appear in the collaborator list.
5. A later save merges independent edits or offers named conflict resolution on overlapping edits.
6. Authorized recipients may export the spreadsheet as an Excel file.

**Acceptance rule:** the user without Editor rights cannot submit a save even if they can read/download the sheet.

### 12.5 React to a chat message

1. User A sends a message to User B.
2. User B reacts to that message.
3. User A receives a **reaction** activity indicator (not a fake new-message entry) in Messages and a related Inbox notification.
4. User A opens/reads the conversation; its relevant reaction activity is acknowledged.
5. The reverse direction (A reacting to B) must follow the same rule, regardless of roles.

**Acceptance rule:** message sender, not every member of a group, is the reaction-notification target, unless explicitly changed by a future product rule.

## 13. Important cross-module rules

1. **Single source of business truth:** persisted API/database records decide status, access, and history. Live socket events request UI refresh; they are not an authoritative event ledger.
2. **Active identity required:** inactive users must not have working sessions or new assignments/step resolutions.
3. **Least privilege:** role capability is necessary but not always sufficient; resource membership is checked separately.
4. **Record ownership matters:** requester controls their approval draft, creator/authorized manager controls task fields, and Drive owner/manager controls sharing.
5. **History vs current state:** task changes, approval rounds, message deletion metadata, and selected audit events remain distinct from whatever the latest UI currently displays.
6. **Concurrency must be explicit:** stale approval revisions or spreadsheet versions are rejected/merged rather than silently overwriting authoritative records.
7. **Private vs shared means different rules:** shared Drive administrator override does not translate into ordinary access to personal files or private chats.
8. **Notification ≠ work object:** reading a badge must not itself modify task/approval business state; it only acknowledges a user's activity.
9. **Attachments inherit context:** access to task/chat/approval files must be validated against the containing entity, not assumed from a shared-looking filename.
10. **Business status is not security:** DRAFT, PENDING, COMPLETED, etc. describe process state, while roles and resource rules control who may act.

## 14. Delivered scope versus remaining validation

The following table is **a code-review assessment**, not a certified production acceptance report.

| Area | Observable implementation | Remaining product/acceptance concerns |
| --- | --- | --- |
| Authentication and users | Sessions, password changes/resets, roles, departments, profile/directory | MFA/SSO, credential lifecycle, recovery policy, production security testing |
| Roles | Employee, Store, Manager, Auditor, protected System Admin, editable custom roles | Review role-permission UX, separation of duties, custom-role edge cases |
| Messages | Direct/group messaging, replies, reactions, pins, receipts, presence, unread state | Validate reaction badges across roles, mobile UI, group ownership workflow |
| Tasks | Task assignment by employees, comments, subtasks, personal groups, list/board, notifications | Validate full UX, recurring/automation needs, advanced workflow requirements |
| Approvals | Typed forms, editable/versioned types, sequential decisions, corrections, bases and personal groups | Parallel/conditional/delegated approvals not implemented; acceptance of edge cases |
| Drive | Personal, Global, Group, nested folders, custom shares, Trash | Large folder scale, antivirus, lifecycle/retention, storage cleanup |
| Spreadsheets | Univer editing, import/export XLSX, sorting/filtering, resize, presence, conflict detection/merge | Live per-cell collaboration is not Google Sheets-equivalent; large workbook performance, merge edge cases |
| Inbox and overview | Notifications, badge summaries, read state, priority, overview counters | Regression tests for cross-page synchronization and reconnect behavior |
| Auditing and operations | Selected business/admin logs and self-hostable backend | Security review, backup/restore drill, monitoring, privacy and compliance policy |

### What is intentionally **not** established as complete

- Exact feature parity with all of Lark.
- Video/voice conferencing, screen sharing, shared calendars, native mobile apps, or external guest collaboration.
- SSO/MFA and full enterprise identity lifecycle.
- Branching/parallel approvals, automated delegation, escalation, or e-signature.
- Real-time cursor-level spreadsheet collaboration equivalent to Google Sheets.
- Antivirus/quarantine certification, immutable audit trail, verified disaster recovery, or unlimited storage.
- Full performance, mobile-browser, security, and role-combination test coverage.
- The project owner's 80–90% overall estimate as an objective percentage.

## 15. Recommended next business decisions

**Before wider employee rollout**, settle and document these as explicit company policies:

1. **Role governance:** who may grant roles, whether administrators may grant themselves additional access, and whether the Auditor role may be combined with operational roles.
2. **Private-data policy:** distinguish application-level System Administrator visibility from database/server operator access; communicate the distinction to staff.
3. **Approval ownership:** define how to handle missing/inactive approvers and who may maintain or deactivate frequently used request types.
4. **Task policy:** define who is accountable for overdue tasks, whether assignee changes require acknowledgement, and whether parent tasks can close with unfinished subtasks.
5. **Drive retention:** choose quota, file type policy, trash retention period, antivirus/quarantine, backup retention, and procedures for employee departure.
6. **Spreadsheet collaboration:** decide whether save-time conflict merging is sufficient or true live per-cell co-editing is a future requirement.
7. **Notifications:** decide what counts as seen/read and complete two-way per-role reaction tests.
8. **Operational readiness:** run migration/staging, database+file backup/restore, secure production configuration, mobile-browser, accessibility, and concurrency/load acceptance tests.

## 16. Suggested business acceptance checklist

- [ ] Employee and Store can assign a task to any active colleague; unauthorized roles cannot.
- [ ] Department managers see/manage appropriate departmental tasks, but not unrelated private data.
- [ ] System Administrator can create/edit custom roles but **cannot edit SYSTEM_ADMIN**.
- [ ] Changing role permissions invalidates applicable user sessions.
- [ ] Admin can manage all shared Group/Global Drive content and **cannot automatically browse Personal Drive**.
- [ ] Personal folder sharing with ITEM_ONLY does not expose nested private files; DESCENDANTS works as requested.
- [ ] Unauthorized chat member cannot read messages, attachments, or reaction information.
- [ ] Reacting in either direction creates the correct recipient's distinct reaction badge; reading clears it.
- [ ] Task creation, assignment, comments, due dates, completion and history behave correctly.
- [ ] Approval types can be edited/versioned without mutating existing request snapshots.
- [ ] Only a pending step's assigned approver can decide; reject/request changes require comments.
- [ ] Corrections create a new approval review round without discarding earlier decisions.
- [ ] Approval Base lists only records allowed to the viewer and shows consistent progress.
- [ ] Viewer cannot save shared spreadsheet; Editors can import/export/resize as allowed.
- [ ] Two editors' independent edits merge; overlapping edits show the **last editor name** and a choice.
- [ ] Unread counts agree across main navigation, module sidebar, and Inbox.
- [ ] File downloads and shares are reauthorized; deactivated users cannot continue with revoked sessions.
- [ ] Database and uploaded-file backups can be restored on an isolated staging environment.
- [ ] Major flows work in desktop browsers and on a real Android device, not only device emulation.

## 17. Glossary

| Term | Business definition |
| --- | --- |
| Workspace | The company's single internal collaboration environment. |
| Role | A named group of business capabilities assigned to a user. |
| Resource permission | A rule deciding who can access a particular conversation, task, request, or file. |
| Personal Drive | Private user-owned Drive space, optionally shared at item level. |
| Global Drive | Organization-wide shared Drive space. |
| Group Drive | Membership-controlled shared area for selected staff. |
| Approval type | Reusable form and decision workflow definition. |
| Approval request | A particular employee's submitted business decision case. |
| Approval step | One designated sequential review action in a request. |
| Approval round | One submission/review cycle; earlier rounds are kept after corrections. |
| Approval Base | Per-request-type table/record presentation, with row-level access checks. |
| Task group | An individual's personal organization of accessible tasks. |
| Reaction notification | Activity directed to a message sender when another member reacts. |
| Spreadsheet version | Saved workbook revision checked to prevent concurrent silent overwrite. |

## 18. Code traceability and maintenance

The most relevant **prod branch** implementation references reviewed for this document:

| Subject | Source locations |
| --- | --- |
| Preset role permission catalog | apps/api/prisma/seed.js; apps/api/src/lib/authz.js |
| Roles, user administration | apps/api/src/routes/roles.js; users.js; departments.js; apps/web/src/components/RoleManagement.jsx |
| Authentication and session enforcement | apps/api/src/routes/auth.js; apps/api/src/app.js |
| Task access, assignment, grouping, history | apps/api/src/routes/tasks.js; apps/api/src/lib/task-access.js |
| Approval workflow, versioning, bases | apps/api/src/routes/approvals.js; apps/api/src/lib/approval.js; approval-form.js |
| Conversation/reaction business rules | apps/api/src/routes/conversations.js |
| Drive spaces, grants, inheritance | apps/api/src/routes/drive.js; apps/api/src/lib/drive-access.js |
| Spreadsheet snapshots, merge and presence | apps/api/src/routes/drive-sheets.js; apps/web/src/pages/SpreadsheetPage.jsx; apps/web/src/lib/spreadsheet-collaboration.js |
| Notification presentation/read state | apps/api/src/routes/notifications.js; apps/api/src/lib/notification-read.js; apps/web/src/components/Layout.jsx |
| Underlying business entities | apps/api/prisma/schema.prisma |
| Frontend workflows | apps/web/src/pages/ and apps/web/src/App.jsx |

**Maintenance rule:** update this document when a business rule changes, especially roles, shared-Drive access, approvals, cross-user reactions, and spreadsheet conflict handling. Keep this separate from the older initial specification (docs/FULL_PROJECT_DESCRIPTION.md), which includes plans that are not necessarily delivered, and from technical deployment/API documents.

---

**End of business-logic document.**
