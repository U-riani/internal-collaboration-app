> Original planning reference retained from the upload. Some sections describe planned features. See README.md and IMPLEMENTATION_STATUS.md for the delivered 0.2.0 scope.

# Internal Collaboration Application

## Full Project Description and Technical Specification

**Document status:** Initial project specification  
**Version:** 1.0  
**Last updated:** 2026-07-16  
**Primary backend:** Node.js  
**Application type:** Internal web application  

---

## 1. Project Overview

The Internal Collaboration Application is a lightweight organizational platform intended to replace the main Lark features currently used by the company.

The application will centralize internal communication, task tracking, approval processing, file sharing, notifications, and activity history in one secure system controlled by the organization.

The project will not attempt to reproduce every Lark feature. The first version will focus only on the workflows that provide the highest operational value:

- Direct employee-to-employee chat
- Group, department, and project chats
- Task creation, assignment, tracking, and discussion
- Configurable approval workflows
- File attachments
- In-app notifications
- Search and activity history
- Role-based access and audit logs

Audio calls, video calls, screen sharing, public communities, external customer messaging, and advanced document editing are outside the initial project scope.

---

## 2. Business Problem

The organization currently depends on Lark for communication, task management, and approvals. This creates several concerns:

- Dependence on an external platform
- Limited control over application behavior and future customization
- Recurring subscription costs
- Business data stored outside the organization's own infrastructure
- Difficulty integrating internal ERP and operational processes
- Features and workflows that may not match the organization's exact requirements

The proposed application will give the organization direct control over its data, workflows, permissions, integrations, and deployment environment.

---

## 3. Project Goals

### 3.1 Primary Goals

1. Provide reliable internal communication through direct and group chat.
2. Provide structured task management with deadlines, priorities, comments, and history.
3. Provide configurable approval workflows with sequential approval steps.
4. Store all application data and files in organization-controlled infrastructure.
5. Create a foundation that can later integrate with ERP, HR, inventory, finance, and other internal systems.
6. Keep the first version simple enough to build, test, deploy, and maintain with a small development team.

### 3.2 Success Criteria

The first production release will be considered successful when:

- Employees can authenticate and access only authorized data.
- Employees can send and receive direct and group messages in real time.
- Managers can create, assign, and track tasks.
- Employees can submit approval requests.
- Approvers can approve, reject, or request changes.
- Relevant users receive notifications for important events.
- Files can be securely attached to messages, tasks, and approvals.
- Important actions are recorded in audit history.
- The system can be backed up and restored.
- The application operates reliably on the organization's Linux server.

---

## 4. Scope

### 4.1 Included in Version 1

- User authentication
- User profile management
- Departments and teams
- Roles and permissions
- Direct chat
- Group chat
- Department and project channels
- Message replies
- Message editing and deletion according to permissions
- Mentions
- File attachments
- Message search
- Unread message tracking
- User presence and last-seen status
- Task creation and assignment
- Task comments and attachments
- Task status, priority, start date, and deadline
- Task activity history
- Approval type configuration
- Sequential approval steps
- Approval submission and decision actions
- Approval comments and attachments
- Notifications
- Audit logging
- Administrative settings
- Docker-based deployment
- Database and file backups

### 4.2 Explicitly Excluded from Version 1

- Audio calls
- Video calls
- Screen sharing
- Email hosting
- Calendar replacement
- Collaborative document editing
- Public or external communities
- External client accounts
- Mobile applications
- Desktop-native applications
- End-to-end encrypted private messaging
- AI assistants or automatic summarization
- Complex workflow designer with drag-and-drop logic

These features may be reviewed after the core platform is stable.

---

## 5. User Types

### 5.1 System Administrator

Responsible for system-level configuration.

Typical permissions:

- Create, activate, deactivate, and manage users
- Manage departments and roles
- Configure global permissions
- Create approval types
- Access system audit logs
- Manage storage and application settings
- View operational health information

### 5.2 Organization Administrator or HR Administrator

Responsible for organizational structure and employee access.

Typical permissions:

- Manage employee profiles
- Assign departments and managers
- Activate or deactivate accounts
- Create department channels
- View organizational reports allowed by policy

### 5.3 Manager

Responsible for teams, tasks, and approvals.

Typical permissions:

- Create and assign tasks
- View team tasks
- Create group or project chats when allowed
- Approve or reject assigned approval requests
- View task and approval reports for managed employees

### 5.4 Employee

Standard application user.

Typical permissions:

- Participate in authorized chats
- Create and update allowed tasks
- Comment on assigned tasks
- Submit approval requests
- Review personal notifications and activity
- Upload authorized attachments

### 5.5 Auditor or Read-Only User

Optional role for management, finance, compliance, or internal audit.

Typical permissions:

- Read selected approval records
- Read selected task histories
- View audit records
- No data modification permissions

---

## 6. Permission Model

The application will use role-based access control combined with resource-level membership checks.

Access will be determined by:

1. User status
2. Global role
3. Department membership
4. Team or project membership
5. Conversation membership
6. Task relationship
7. Approval relationship
8. Explicit administrative permission

Examples:

- A user cannot read a private conversation unless they are a member.
- A task assignee can update the task status but may not change all task fields.
- A task creator or manager may change assignment and deadlines.
- An approver can act only when the approval request is currently waiting for their step.
- An administrator may manage users without automatically reading all private conversations.
- Audit access must be granted separately from ordinary administrative access.

Recommended permission naming format:

```text
users.read
users.manage
roles.manage
conversations.create
messages.send
tasks.create
tasks.assign
tasks.manage_department
approvals.submit
approvals.configure
approvals.audit
system.audit.read
```

---

## 7. Functional Modules

## 7.1 Authentication and Account Management

### Features

- Username/email and password login
- Secure password hashing
- Access token and refresh token handling
- Logout from current session
- Logout from all devices
- Password change
- Administrator password reset
- Failed-login protection
- Account activation and deactivation
- Session history
- Optional future two-factor authentication

### Rules

- Only active users may authenticate.
- Deactivated users lose access immediately or after the configured token revocation period.
- Passwords must never be stored in plain text.
- Refresh tokens must be stored securely and revocable.
- Sensitive authentication events must be audited.

---

## 7.2 Users, Departments, Teams, and Roles

### User Profile Fields

- ID
- Employee number
- First name
- Last name
- Display name
- Email
- Phone number
- Job title
- Department
- Manager
- Profile image
- Account status
- Preferred language
- Time zone
- Created date
- Updated date

### Department Features

- Create and update departments
- Assign department manager
- Add and remove employees
- Create a default department channel
- Deactivate departments without deleting historical records

### Team or Project Group Features

- Create temporary or permanent teams
- Assign owner and members
- Link chats and tasks to a team
- Archive completed project groups

---

## 7.3 Chat Module

### Conversation Types

- Direct conversation between two users
- Private group conversation
- Department channel
- Project or team channel
- Announcement channel

### Core Features

- Send text messages
- Real-time message delivery
- Reply to a message
- Edit a message
- Delete a message
- Soft-delete messages for auditability
- Attach files
- Mention users
- Mention all members when authorized
- Add and remove reactions
- View message delivery state
- View unread message count
- Mark a conversation as read
- Pin messages
- Search messages
- View shared files
- Mute a conversation
- Archive a conversation

### Group Management

- Create group
- Rename group
- Set group image
- Add and remove members
- Assign group owner
- Assign moderators
- Restrict who may add members
- Restrict who may post in announcement channels
- Leave group
- Transfer group ownership

### Message Rules

- Every message belongs to one conversation.
- A sender must be an active conversation member.
- Message editing should be limited by policy, such as within 15 minutes or without a time limit for administrators.
- Deleted messages remain represented by a tombstone record when auditability is required.
- Attachments must be validated and linked through database metadata.
- Socket.IO is used only for delivery; the database remains the source of truth.

### Search

The first version should support:

- Text search
- Sender filter
- Conversation filter
- Date range filter
- Attachment-only filter

PostgreSQL full-text search is sufficient for the first version. A separate search engine can be introduced later if needed.

---

## 7.4 Task Management Module

### Task Fields

- ID
- Title
- Description
- Creator
- Primary assignee
- Additional participants
- Department or project
- Status
- Priority
- Start date
- Deadline
- Completion date
- Parent task
- Created date
- Updated date
- Archived date

### Suggested Task Statuses

- Draft
- Open
- In progress
- Blocked
- Waiting for review
- Completed
- Cancelled

### Suggested Priorities

- Low
- Normal
- High
- Urgent

### Features

- Create a task
- Assign or reassign a task
- Add participants
- Change status
- Change priority
- Set start date and deadline
- Add checklist items
- Add comments
- Attach files
- Mention users in comments
- Link related tasks
- Create subtasks
- Follow or unfollow task updates
- View activity history
- Filter and sort tasks
- View personal task list
- View tasks created by the user
- View department tasks according to permission
- Receive overdue and upcoming-deadline notifications

### Task Rules

- Every task must have a creator.
- A task may have one primary assignee and multiple participants.
- Only authorized users may reassign a task.
- Completing a parent task may require all required subtasks to be completed.
- Every important field change must create a history entry.
- Task deletion should normally be replaced with archiving.

### Task Views

- My tasks
- Created by me
- Department tasks
- Overdue tasks
- Due today
- Due this week
- Completed tasks
- Archived tasks

A Kanban view may be introduced after the initial list-based implementation.

---

## 7.5 Approval Workflow Module

### Purpose

The approval module will support internal business requests such as:

- Purchase requests
- Expense requests
- Leave requests
- Equipment requests
- Access requests
- Discount approvals
- Contract approvals
- Custom organizational processes

### Approval Type Configuration

An administrator can define:

- Approval type name
- Description
- Form fields
- Required attachments
- Approval steps
- Approver selection rules
- Whether steps are sequential or parallel
- Whether the requester may cancel
- Whether changes may be requested
- Notification rules
- Visibility rules

### First-Version Workflow Model

Version 1 should prioritize sequential approvals because they are easier to implement and audit.

Example:

```text
Employee submits request
        ↓
Department Manager reviews
        ↓
Finance reviews
        ↓
Director approves
        ↓
Request completed
```

### Approval Request Statuses

- Draft
- Submitted
- Pending
- Changes requested
- Approved
- Rejected
- Cancelled

### Step Statuses

- Waiting
- Pending
- Approved
- Rejected
- Changes requested
- Skipped

### Actions

- Save draft
- Submit
- Approve
- Reject
- Request changes
- Resubmit
- Cancel when allowed
- Add comment
- Add attachment
- Delegate approval when allowed

### Approval Rules

- A request receives a frozen copy of the workflow definition at submission time.
- Future changes to an approval type must not alter already submitted requests.
- Only the current approver or authorized delegate may act on the current step.
- Every action must record actor, action, timestamp, comment, and relevant metadata.
- Approved and rejected requests must remain available for audit.
- Approval records must not be hard-deleted through ordinary user actions.

---

## 7.6 File Management Module

### Storage Architecture

- File binary data: MinIO
- File metadata: PostgreSQL
- Access control: Backend API
- Download method: Short-lived signed URL or authenticated streaming

### Supported Attachment Locations

- Chat messages
- Task descriptions
- Task comments
- Approval requests
- Approval comments
- User profile images

### File Metadata

- ID
- Original filename
- Stored object key
- MIME type
- File size
- Checksum
- Storage bucket
- Uploaded by
- Upload timestamp
- Related entity type
- Related entity ID
- Scan status
- Deletion status

### File Rules

- Users must not access MinIO directly through permanent public URLs.
- Upload size limits must be configurable.
- Allowed and blocked file types must be configurable.
- Filenames must be sanitized.
- Object keys must be generated by the backend.
- Authorization must be checked before generating a download URL.
- Files should be soft-deleted before permanent cleanup.
- Antivirus scanning can be introduced through a background worker.

---

## 7.7 Notifications Module

### Notification Channels in Version 1

- In-app notification center
- Real-time toast notification
- Unread notification badge

Email and push notifications may be added later.

### Notification Examples

- New direct message
- Mention in message
- Added to group
- Task assigned
- Task reassigned
- Task deadline approaching
- Task overdue
- Task comment added
- Approval request submitted
- Approval step assigned
- Approval approved
- Approval rejected
- Changes requested

### Notification Rules

- Notifications must contain a link to the related resource.
- Users can mark notifications as read.
- Users can mark all notifications as read.
- Notification records must be stored in PostgreSQL.
- Socket.IO delivers the notification event but does not replace persistent storage.
- User notification preferences may be added gradually.

---

## 7.8 Activity History and Audit Module

### Activity History

User-facing history for tasks and approvals, such as:

- Status changed
- Assignee changed
- Deadline changed
- Comment added
- Approval submitted
- Approval decision recorded

### Audit Log

Administrative and compliance-focused history, such as:

- User created or deactivated
- Role changed
- Permission changed
- Approval type changed
- Login failure
- Password reset
- Sensitive data export
- Administrative message deletion

### Audit Record Fields

- ID
- Actor user ID
- Action type
- Target entity type
- Target entity ID
- Timestamp
- IP address
- User agent
- Request ID
- Before data when appropriate
- After data when appropriate
- Additional metadata

Audit records should be append-only for ordinary application users.

---

## 7.9 Administration Module

### Administrative Features

- User management
- Department management
- Role and permission management
- Approval type management
- File policy management
- System configuration
- Audit log viewer
- Active session management
- Storage usage summary
- Background job status
- Application version information

---

## 8. Recommended Technology Stack

## 8.1 Frontend

- React
- Vite
- JavaScript
- Tailwind CSS
- React Router
- TanStack Query for server state
- Zustand or React Context for limited client state
- Socket.IO Client
- React Hook Form
- Zod for frontend validation

### Frontend Recommendation

Use feature-based folders rather than placing all components in one global directory.

---

## 8.2 Backend

- Node.js
- JavaScript
- Fastify as the preferred HTTP framework
- Socket.IO for real-time events
- Zod or Fastify JSON Schema for validation
- Prisma or Drizzle ORM for PostgreSQL access
- BullMQ for background jobs
- Pino for structured logging

### Why Fastify Is Recommended

Fastify provides a clean plugin model, schema-based validation, good performance, and structured logging support while remaining much lighter than NestJS.

Express remains acceptable if development familiarity is more important than framework features.

### FastAPI Position

FastAPI is not required for the main application. It may later be introduced as a separate service for:

- ERP integration
- Data transformation
- Reporting
- Machine learning
- Python-specific automation

---

## 8.3 Data and Infrastructure

- PostgreSQL: Primary transactional database
- Redis: Presence, caching, rate limiting, queues, and Socket.IO scaling
- MinIO: Object storage for attachments
- Docker Compose: Initial deployment orchestration
- Nginx: Reverse proxy and TLS termination
- Linux: Production server operating system
- Let's Encrypt or organization certificate: HTTPS

---

## 9. High-Level Architecture

```mermaid
flowchart LR
    U[Employee Browser] --> N[Nginx]
    N --> F[React Frontend]
    N --> A[Node.js API]
    N --> S[Socket.IO Gateway]

    A --> P[(PostgreSQL)]
    A --> R[(Redis)]
    A --> M[(MinIO)]

    S --> P
    S --> R

    W[Background Worker] --> P
    W --> R
    W --> M

    A --> E[Optional ERP Services]
```

### Core Principle

PostgreSQL is the source of truth.

- HTTP API handles authenticated commands and queries.
- Socket.IO broadcasts changes after successful database operations.
- Redis supports temporary state and distributed processing.
- MinIO stores file objects.
- Background workers process delayed and asynchronous jobs.

---

## 10. Suggested Repository Structure

A monorepo is recommended for the first version.

```text
internal-collaboration-app/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── chat/
│   │   │   │   ├── tasks/
│   │   │   │   ├── approvals/
│   │   │   │   ├── notifications/
│   │   │   │   └── admin/
│   │   │   ├── hooks/
│   │   │   ├── layouts/
│   │   │   ├── lib/
│   │   │   ├── routes/
│   │   │   └── styles/
│   │   └── package.json
│   │
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.js
│   │   │   ├── config/
│   │   │   ├── plugins/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── departments/
│   │   │   │   ├── roles/
│   │   │   │   ├── conversations/
│   │   │   │   ├── messages/
│   │   │   │   ├── tasks/
│   │   │   │   ├── approvals/
│   │   │   │   ├── files/
│   │   │   │   ├── notifications/
│   │   │   │   └── audit/
│   │   │   ├── shared/
│   │   │   └── server.js
│   │   └── package.json
│   │
│   └── worker/
│       ├── src/
│       │   ├── jobs/
│       │   ├── queues/
│       │   └── worker.js
│       └── package.json
│
├── packages/
│   ├── shared/
│   ├── validation/
│   └── config/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── schema/
│
├── infrastructure/
│   ├── nginx/
│   ├── docker/
│   ├── scripts/
│   └── backups/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── business-rules/
│   └── deployment/
│
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 11. Core Database Model

The following is a conceptual model. Exact columns and indexes should be finalized during implementation.

### 11.1 Organization and Access Tables

#### users

- id
- employee_number
- email
- password_hash
- first_name
- last_name
- display_name
- phone
- job_title
- department_id
- manager_id
- avatar_file_id
- status
- preferred_language
- timezone
- last_seen_at
- created_at
- updated_at

#### departments

- id
- name
- code
- manager_id
- parent_department_id
- status
- created_at
- updated_at

#### teams

- id
- name
- description
- owner_id
- status
- created_at
- archived_at

#### team_members

- team_id
- user_id
- member_role
- joined_at

#### roles

- id
- name
- description
- is_system_role

#### permissions

- id
- code
- description

#### role_permissions

- role_id
- permission_id

#### user_roles

- user_id
- role_id
- scope_type
- scope_id

#### sessions

- id
- user_id
- refresh_token_hash
- device_name
- ip_address
- user_agent
- expires_at
- revoked_at
- created_at

### 11.2 Chat Tables

#### conversations

- id
- type
- name
- description
- image_file_id
- department_id
- team_id
- owner_id
- is_archived
- created_at
- updated_at

#### conversation_members

- conversation_id
- user_id
- role
- joined_at
- left_at
- muted_until
- last_read_message_id

#### messages

- id
- conversation_id
- sender_id
- reply_to_message_id
- message_type
- content
- edited_at
- deleted_at
- created_at

#### message_attachments

- message_id
- file_id

#### message_mentions

- message_id
- mentioned_user_id

#### message_reactions

- message_id
- user_id
- reaction
- created_at

#### pinned_messages

- conversation_id
- message_id
- pinned_by
- pinned_at

### 11.3 Task Tables

#### tasks

- id
- title
- description
- creator_id
- assignee_id
- department_id
- team_id
- parent_task_id
- status
- priority
- start_date
- due_date
- completed_at
- archived_at
- created_at
- updated_at

#### task_participants

- task_id
- user_id
- participant_role

#### task_checklist_items

- id
- task_id
- title
- is_completed
- completed_by
- completed_at
- sort_order

#### task_comments

- id
- task_id
- author_id
- content
- edited_at
- deleted_at
- created_at

#### task_comment_attachments

- task_comment_id
- file_id

#### task_attachments

- task_id
- file_id

#### task_history

- id
- task_id
- actor_id
- action_type
- old_value
- new_value
- metadata
- created_at

### 11.4 Approval Tables

#### approval_types

- id
- name
- description
- code
- version
- status
- created_by
- created_at
- updated_at

#### approval_type_fields

- id
- approval_type_id
- field_key
- label
- field_type
- is_required
- validation_rules
- options
- sort_order

#### approval_type_steps

- id
- approval_type_id
- step_number
- name
- approver_rule_type
- approver_rule_value
- is_required

#### approval_requests

- id
- approval_type_id
- approval_type_version
- requester_id
- department_id
- title
- status
- current_step_number
- submitted_at
- completed_at
- cancelled_at
- created_at
- updated_at

#### approval_request_data

- approval_request_id
- field_key
- field_value

#### approval_request_steps

- id
- approval_request_id
- step_number
- step_name
- approver_id
- delegated_from_user_id
- status
- acted_at
- comment

#### approval_comments

- id
- approval_request_id
- author_id
- content
- created_at
- edited_at

#### approval_attachments

- approval_request_id
- file_id

#### approval_history

- id
- approval_request_id
- actor_id
- action_type
- step_number
- comment
- metadata
- created_at

### 11.5 Shared System Tables

#### files

- id
- original_name
- object_key
- bucket
- mime_type
- size_bytes
- checksum
- uploaded_by
- scan_status
- deleted_at
- created_at

#### notifications

- id
- user_id
- type
- title
- body
- related_entity_type
- related_entity_id
- is_read
- read_at
- created_at

#### audit_logs

- id
- actor_id
- action_type
- entity_type
- entity_id
- request_id
- ip_address
- user_agent
- before_data
- after_data
- metadata
- created_at

#### outbox_events

- id
- event_type
- aggregate_type
- aggregate_id
- payload
- status
- attempts
- available_at
- processed_at
- created_at

---

## 12. Database Design Principles

- Use UUIDs or ordered UUID-compatible identifiers for primary keys.
- Use foreign keys for relational integrity.
- Use `created_at` and `updated_at` consistently.
- Use soft deletion for business records requiring history.
- Use migrations for every schema change.
- Add indexes based on real query patterns.
- Store timestamps in UTC.
- Avoid storing temporary online presence in PostgreSQL; use Redis.
- Store flexible approval form values carefully, using relational fields plus JSON where appropriate.
- Use database transactions for multi-step business operations.
- Use an outbox table for reliable event publication when needed.

### Important Initial Indexes

- users(email)
- users(department_id, status)
- conversation_members(user_id, conversation_id)
- messages(conversation_id, created_at desc)
- messages(sender_id, created_at desc)
- tasks(assignee_id, status, due_date)
- tasks(department_id, status)
- approval_requests(requester_id, created_at desc)
- approval_request_steps(approver_id, status)
- notifications(user_id, is_read, created_at desc)
- audit_logs(entity_type, entity_id, created_at desc)

---

## 13. API Design

Use a versioned REST API:

```text
/api/v1
```

### 13.1 Authentication Endpoints

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
GET    /api/v1/auth/me
PUT    /api/v1/auth/password
```

### 13.2 Users and Organization

```text
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:userId
PATCH  /api/v1/users/:userId
POST   /api/v1/users/:userId/activate
POST   /api/v1/users/:userId/deactivate

GET    /api/v1/departments
POST   /api/v1/departments
GET    /api/v1/departments/:departmentId
PATCH  /api/v1/departments/:departmentId

GET    /api/v1/roles
POST   /api/v1/roles
PATCH  /api/v1/roles/:roleId
```

### 13.3 Conversations and Messages

```text
GET    /api/v1/conversations
POST   /api/v1/conversations
GET    /api/v1/conversations/:conversationId
PATCH  /api/v1/conversations/:conversationId
POST   /api/v1/conversations/:conversationId/members
DELETE /api/v1/conversations/:conversationId/members/:userId

GET    /api/v1/conversations/:conversationId/messages
POST   /api/v1/conversations/:conversationId/messages
PATCH  /api/v1/messages/:messageId
DELETE /api/v1/messages/:messageId
POST   /api/v1/messages/:messageId/reactions
DELETE /api/v1/messages/:messageId/reactions/:reaction
POST   /api/v1/conversations/:conversationId/read
GET    /api/v1/messages/search
```

### 13.4 Tasks

```text
GET    /api/v1/tasks
POST   /api/v1/tasks
GET    /api/v1/tasks/:taskId
PATCH  /api/v1/tasks/:taskId
POST   /api/v1/tasks/:taskId/assign
POST   /api/v1/tasks/:taskId/status
POST   /api/v1/tasks/:taskId/comments
GET    /api/v1/tasks/:taskId/history
POST   /api/v1/tasks/:taskId/archive
```

### 13.5 Approvals

```text
GET    /api/v1/approval-types
POST   /api/v1/approval-types
GET    /api/v1/approval-types/:approvalTypeId
PATCH  /api/v1/approval-types/:approvalTypeId

GET    /api/v1/approval-requests
POST   /api/v1/approval-requests
GET    /api/v1/approval-requests/:requestId
PATCH  /api/v1/approval-requests/:requestId
POST   /api/v1/approval-requests/:requestId/submit
POST   /api/v1/approval-requests/:requestId/approve
POST   /api/v1/approval-requests/:requestId/reject
POST   /api/v1/approval-requests/:requestId/request-changes
POST   /api/v1/approval-requests/:requestId/cancel
POST   /api/v1/approval-requests/:requestId/comments
GET    /api/v1/approval-requests/:requestId/history
```

### 13.6 Files and Notifications

```text
POST   /api/v1/files
GET    /api/v1/files/:fileId
GET    /api/v1/files/:fileId/download
DELETE /api/v1/files/:fileId

GET    /api/v1/notifications
POST   /api/v1/notifications/:notificationId/read
POST   /api/v1/notifications/read-all
```

### API Response Format

Successful response:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task was not found",
    "details": []
  },
  "requestId": "request-id"
}
```

---

## 14. Socket.IO Design

### Connection Rules

- The client authenticates the socket connection using a valid access token.
- The server validates the user and account status.
- Each user joins a private room such as `user:{userId}`.
- The user joins only authorized conversation rooms.
- Socket events are emitted after successful database commits.

### Suggested Client-to-Server Events

```text
conversation:join
conversation:leave
message:typing:start
message:typing:stop
presence:heartbeat
```

Message creation should preferably use the authenticated HTTP API first. The server then emits the persisted message through Socket.IO. This reduces duplicate business logic and ensures the database write succeeds before delivery.

### Suggested Server-to-Client Events

```text
message:created
message:updated
message:deleted
message:reaction-added
message:reaction-removed
conversation:updated
conversation:read-updated
user:presence-updated
task:created
task:updated
task:comment-created
approval:submitted
approval:updated
notification:created
```

### Scaling

When more than one API instance is introduced, use the Socket.IO Redis adapter so events can be distributed across instances.

---

## 15. Background Jobs

BullMQ with Redis is recommended for asynchronous work.

### Initial Jobs

- Upcoming task deadline notifications
- Overdue task notifications
- Approval reminder notifications
- File cleanup after soft deletion
- File antivirus scan when introduced
- Audit export generation
- Email notifications when introduced
- Retry failed external integrations
- Database-backed event processing

### Job Rules

- Jobs must be idempotent where possible.
- Failed jobs must have retry limits.
- Permanently failed jobs must be visible to administrators.
- Job payloads should contain identifiers, not large file contents.

---

## 16. Security Requirements

### Authentication Security

- Password hashing with Argon2id or bcrypt using secure parameters
- Short-lived access tokens
- Rotating refresh tokens
- Refresh token revocation
- Secure, HTTP-only cookies when practical
- Rate limiting on login and password reset
- Optional future two-factor authentication

### Authorization Security

- Every protected API route must enforce authorization.
- Frontend visibility is not a security control.
- Resource membership must be checked on the backend.
- Administrative permissions must be explicit.

### Application Security

- HTTPS only in production
- Secure HTTP headers
- CORS allowlist
- CSRF protection when cookie authentication is used
- Request size limits
- File upload validation
- SQL injection protection through parameterized queries or ORM
- XSS protection through safe rendering and sanitization
- Rate limiting
- Structured security logging
- Secrets stored outside source control

### Data Security

- Encrypt server disks or storage where possible.
- Backups must be protected.
- MinIO buckets must not be publicly accessible.
- Production database access must be restricted by network and credentials.
- Sensitive audit data must be visible only to authorized roles.

---

## 17. Validation and Business Rule Handling

Validation should occur at multiple levels:

1. Frontend form validation for usability
2. API schema validation for security and correctness
3. Service-layer business rule validation
4. Database constraints for integrity

Example task creation rules:

- Title is required.
- Assignee must be active.
- Department must exist.
- Deadline cannot be before start date.
- Creator must have permission to assign the selected user.

Example approval rules:

- Approval type must be active.
- Required fields must be provided.
- Required attachments must exist.
- Approver must not act twice on the same step.
- A completed request cannot be modified through ordinary endpoints.

---

## 18. Logging, Monitoring, and Observability

### Logging

Use structured JSON logs with Pino.

Each request log should include:

- Timestamp
- Log level
- Request ID
- User ID when known
- HTTP method
- Route
- Status code
- Duration
- Error code when applicable

Do not log:

- Passwords
- Access tokens
- Refresh tokens
- Sensitive file contents
- Unnecessary personal data

### Monitoring

Initial monitoring should include:

- API availability
- API error rate
- Response time
- PostgreSQL health
- Redis health
- MinIO health
- Disk usage
- Memory usage
- CPU usage
- Background job failures
- Backup status

### Health Endpoints

```text
GET /health/live
GET /health/ready
```

`live` confirms the process is running.  
`ready` confirms required dependencies are available.

---

## 19. Backup and Recovery

### Data Requiring Backup

- PostgreSQL database
- MinIO object data
- MinIO configuration
- Environment and deployment configuration
- Nginx configuration
- Encryption or signing keys according to secure policy

### Recommended Initial Policy

- Daily PostgreSQL backup
- Daily MinIO backup or replication
- Weekly full backup retained longer
- Regular off-server backup copy
- Backup encryption
- Documented restore procedure
- Scheduled restore testing

A backup is not considered reliable until a restore has been tested.

---

## 20. Deployment Architecture

### Initial Single-Server Deployment

```text
Linux Server
├── Nginx
├── React static frontend
├── Node.js API container
├── Node.js worker container
├── PostgreSQL container or managed instance
├── Redis container
├── MinIO container
└── Backup scripts
```

### Docker Compose Services

```text
nginx
web
api
worker
postgres
redis
minio
```

### Network Exposure

Externally exposed:

- 80 for HTTP redirect
- 443 for HTTPS

Internal-only:

- PostgreSQL
- Redis
- MinIO administrative/API ports where possible
- API container port behind Nginx

---

## 21. Environment Configuration

Example variables:

```dotenv
NODE_ENV=production
APP_NAME=Internal Collaboration Application
APP_URL=https://collaboration.example.com
API_PORT=3000

DATABASE_URL=postgresql://user:password@postgres:5432/collaboration
REDIS_URL=redis://redis:6379

JWT_ACCESS_SECRET=replace_me
JWT_REFRESH_SECRET=replace_me
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d

MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=replace_me
MINIO_SECRET_KEY=replace_me
MINIO_BUCKET_ATTACHMENTS=attachments
MINIO_USE_SSL=false

CORS_ORIGINS=https://collaboration.example.com
MAX_UPLOAD_SIZE_MB=25
LOG_LEVEL=info
```

Real secrets must never be committed to Git.

---

## 22. Testing Strategy

### Unit Tests

Test isolated business logic:

- Permission checks
- Task transitions
- Approval step transitions
- Notification decision rules
- Validation helpers

### Integration Tests

Test API and database behavior:

- Authentication
- Conversation membership
- Message creation
- Task assignment
- Approval submission and decisions
- File authorization

### End-to-End Tests

Test critical user workflows:

1. Login
2. Create and assign task
3. Update task status
4. Submit approval
5. Approve request
6. Send direct message
7. Upload and download attachment
8. Receive notification

### Additional Tests

- Socket.IO event tests
- Database migration tests
- Backup restoration tests
- Permission boundary tests
- Load tests for chat history and concurrent connections

---

## 23. CI/CD Strategy

A basic GitLab CI or GitHub Actions pipeline should include:

1. Install dependencies
2. Lint frontend and backend
3. Run formatting checks
4. Run unit tests
5. Run integration tests
6. Build frontend
7. Build Docker images
8. Scan dependencies and images
9. Deploy to staging
10. Run smoke tests
11. Deploy to production through an approved manual step

### Branching Recommendation

- `main`: production-ready code
- `develop`: optional shared integration branch
- Feature branches: short-lived development work
- Merge requests required for important changes

For a small team, trunk-based development with short-lived feature branches may be simpler than a complex Git flow.

---

## 24. Development Phases

## Phase 0: Planning and Foundation

### Deliverables

- Confirm business requirements
- Define user roles
- Define departments and organizational structure
- Confirm approval examples
- Prepare UI wireframes
- Create repository
- Configure linting and formatting
- Configure Docker development environment
- Configure database migrations
- Configure logging and error handling

---

## Phase 1: Authentication and Organization

### Deliverables

- Login and logout
- Token refresh
- Current user endpoint
- User administration
- Department administration
- Role and permission management
- Basic audit logging
- Base frontend layout

### Completion Criteria

- Active users can log in.
- Inactive users cannot log in.
- Administrators can manage users and departments.
- Protected routes enforce permissions.

---

## Phase 2: Task Management MVP

### Deliverables

- Task CRUD
- Assignment
- Status and priority
- Deadlines
- Comments
- Attachments
- Activity history
- Task filters
- Task notifications

### Completion Criteria

- Managers can assign tasks.
- Employees can update authorized tasks.
- Task history records important changes.
- Upcoming and overdue notifications work.

---

## Phase 3: Approval Workflow MVP

### Deliverables

- Approval type configuration
- Dynamic request fields
- Sequential approval steps
- Submit, approve, reject, and request changes
- Comments and attachments
- Approval history
- Pending approval inbox
- Notifications

### Completion Criteria

- At least two real organizational approval processes work from start to finish.
- Every approval action is auditable.
- Workflow definitions are frozen for submitted requests.

---

## Phase 4: Chat MVP

### Deliverables

- Direct conversations
- Private groups
- Department channels
- Real-time delivery
- Message replies
- Editing and deletion
- Attachments
- Mentions
- Unread counts
- Search
- Presence

### Completion Criteria

- Users can reliably exchange messages.
- Conversation membership is securely enforced.
- Reconnection does not lose persisted messages.
- Unread counts remain consistent.

---

## Phase 5: Production Hardening

### Deliverables

- Monitoring
- Backup automation
- Restore documentation
- Rate limiting
- Security review
- Error tracking
- Background job dashboard
- Performance testing
- Production deployment
- Administrator documentation
- User training materials

---

## 25. MVP Prioritization

### Must Have

- Authentication
- Users and departments
- Roles and permissions
- Task management
- Sequential approvals
- Direct chat
- Group chat
- Attachments
- Notifications
- Audit history
- Backups

### Should Have

- Department channels
- Message replies
- Mentions
- Task checklist
- Approval request changes
- Search
- Presence

### Could Have

- Reactions
- Pinned messages
- Kanban board
- Delegated approvals
- Email notifications
- Advanced reports
- ERP integration

### Not Planned for Initial Release

- Calls
- Screen sharing
- Public communities
- External users
- Native mobile application
- Collaborative office documents

---

## 26. Non-Functional Requirements

### Performance

- Common API requests should normally complete quickly under expected organizational load.
- Message history must use pagination.
- Large lists must use server-side pagination and filtering.
- File uploads must not block unrelated requests.
- Expensive notifications and cleanup operations must run as background jobs.

### Reliability

- Persist data before emitting real-time events.
- Use transactions for multi-table operations.
- Retry safe background jobs.
- Detect and report dependency failures.
- Avoid single actions creating duplicate tasks, messages, or approval decisions.

### Maintainability

- Organize code by business module.
- Keep route handlers thin.
- Place business rules in services or domain functions.
- Use consistent error codes.
- Keep database migrations in source control.
- Document important workflows.

### Scalability

The initial deployment may use one server, but the architecture should permit:

- Multiple API instances
- Multiple Socket.IO instances
- Separate worker instances
- External PostgreSQL
- External Redis
- Distributed object storage

---

## 27. UI Structure

### Main Application Navigation

- Home or dashboard
- Chat
- Tasks
- Approvals
- Notifications
- Directory
- Administration, when authorized

### Chat Layout

```text
Conversation List | Active Conversation | Optional Details Panel
```

### Task Layout

- Filters at top or left
- Task list or board in center
- Task details drawer or page
- Comments and activity history

### Approval Layout

- My requests
- Pending my approval
- Completed
- Approval type selection
- Request details and timeline

### Responsive Design

The first release should be optimized for desktop browsers and remain usable on mobile browsers. A native mobile application is not required.

---

## 28. Error Handling Principles

- Return stable application error codes.
- Do not expose stack traces in production.
- Include a request ID in error responses.
- Log unexpected errors with context.
- Show user-friendly messages in the frontend.
- Distinguish validation, authorization, conflict, and server errors.

Example error codes:

```text
AUTH_INVALID_CREDENTIALS
AUTH_ACCOUNT_DISABLED
PERMISSION_DENIED
CONVERSATION_NOT_FOUND
CONVERSATION_MEMBER_REQUIRED
TASK_NOT_FOUND
TASK_INVALID_STATUS_TRANSITION
APPROVAL_NOT_CURRENT_APPROVER
APPROVAL_ALREADY_COMPLETED
FILE_TYPE_NOT_ALLOWED
FILE_TOO_LARGE
```

---

## 29. Data Retention and Deletion

A formal retention policy should be agreed with management.

Recommended principles:

- Deactivated users remain linked to historical records.
- Business approval records should not be hard-deleted by ordinary users.
- Tasks should be archived rather than deleted.
- Messages may be soft-deleted while retaining audit metadata.
- Orphaned file objects should be cleaned only after a safety retention period.
- Audit logs should have a longer retention period than ordinary application logs.

---

## 30. Integration Readiness

The application should later support integration with:

- ERP systems
- HR employee directory
- Payroll or leave systems
- Inventory systems
- Finance systems
- Email services
- SFTP or REST API processes

Recommended integration methods:

- Versioned REST APIs
- Webhooks
- Background jobs
- Outbox events
- Service accounts with limited permissions
- Separate integration logs

External integrations should not directly modify application tables without controlled services or documented interfaces.

---

## 31. Main Technical Risks

### Scope Growth

Risk: Attempting to recreate all Lark functionality.  
Mitigation: Protect the MVP boundary and require prioritization for new features.

### Chat Complexity

Risk: Real-time behavior, reconnection, unread state, and permissions can become difficult.  
Mitigation: Persist first, emit second, keep Socket.IO stateless where possible, and implement direct chat before advanced channels.

### Approval Complexity

Risk: Dynamic workflows can become a full workflow engine.  
Mitigation: Begin with configurable sequential steps and a limited field model.

### Permission Errors

Risk: Users may access unauthorized conversations or records.  
Mitigation: Centralize backend authorization and test permission boundaries.

### File Security

Risk: Attachments may expose sensitive files.  
Mitigation: Private MinIO buckets, backend authorization, signed URLs, validation, and audit logs.

### Operational Dependence

Risk: Self-hosting transfers responsibility for backups, uptime, security, and updates to the organization.  
Mitigation: Create operational ownership, monitoring, automated backups, and documented recovery procedures.

---

## 32. Recommended Initial Decisions

Before coding begins, the organization should confirm:

1. How users will be created: manual administration, ERP import, or directory synchronization.
2. Whether email or employee number will be the login identifier.
3. Which roles exist in the organization.
4. Which departments and managers must be represented.
5. Which two approval workflows should be implemented first.
6. Maximum allowed file size and blocked file types.
7. Message edit and deletion policy.
8. Task assignment rules across departments.
9. Data retention requirements.
10. Server ownership, backup location, and production support responsibility.

---

## 33. Recommended First Two Approval Workflows

To validate the approval engine, begin with two workflows of different complexity.

### Example A: Equipment Request

```text
Employee → Department Manager → IT Manager → Completed
```

Suggested fields:

- Equipment type
- Business reason
- Requested date
- Estimated cost
- Attachment

### Example B: Purchase Request

```text
Employee → Department Manager → Finance → Director → Completed
```

Suggested fields:

- Supplier
- Item or service
- Quantity
- Estimated amount
- Cost center
- Business reason
- Quotation attachment

These workflows test dynamic fields, attachments, sequential approvers, rejection, and audit history.

---

## 34. Definition of Done for a Feature

A feature is complete only when:

- Business rules are documented.
- Database migration is included.
- API validation is included.
- Authorization is enforced.
- UI success, loading, empty, and error states are implemented.
- Unit or integration tests cover critical behavior.
- Audit and activity history are added when required.
- Logs do not expose sensitive information.
- Documentation is updated.
- The feature works in the Docker development environment.

---

## 35. First-Version Deliverable

The first production version will be a secure internal web application that allows employees and managers to:

- Communicate through direct and group chats
- Create and track organizational tasks
- Submit and process approval requests
- Share files in authorized contexts
- Receive relevant notifications
- Review task and approval activity history

The system will be deployed on organization-controlled infrastructure using Node.js, React, PostgreSQL, Redis, MinIO, Docker Compose, Nginx, and HTTPS.

The architecture will prioritize clear business modules, secure authorization, reliable persistence, auditability, backups, and future ERP integration without introducing unnecessary microservice complexity in the first version.

---

## 36. Final Recommendation

Build the project as a modular monolith first.

Use:

- One React frontend
- One Node.js API application
- One background worker
- One PostgreSQL database
- Redis for temporary and asynchronous workloads
- MinIO for files
- Docker Compose for development and initial production deployment

Do not begin with microservices. Separate services only when a proven operational or scaling need appears.

The recommended implementation order is:

1. Project foundation and authentication
2. Users, departments, roles, and permissions
3. Task management
4. Approval workflows
5. Direct chat
6. Group and department chat
7. Notifications and search
8. Production security, monitoring, and backups

This approach keeps the project realistic, maintainable, and aligned with the organization's actual replacement needs.
