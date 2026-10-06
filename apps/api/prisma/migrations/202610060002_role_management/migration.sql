-- Employees can assign tasks to other users.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role_row."id", permission_row."id"
FROM "Role" AS role_row
JOIN "Permission" AS permission_row ON permission_row."code" = 'tasks.assign'
WHERE role_row."code" = 'EMPLOYEE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Add the STORE preset role for existing installations.
INSERT INTO "Role" ("id", "code", "name", "description", "isSystem", "createdAt")
VALUES (
  (md5('internal-collaboration-app:role:STORE'))::uuid,
  'STORE',
  'Store',
  'Store team member',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET "isSystem" = true;

-- STORE starts with the same permissions the EMPLOYEE role currently has.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT store_role."id", employee_permission."permissionId"
FROM "Role" AS store_role
JOIN "Role" AS employee_role ON employee_role."code" = 'EMPLOYEE'
JOIN "RolePermission" AS employee_permission
  ON employee_permission."roleId" = employee_role."id"
WHERE store_role."code" = 'STORE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
