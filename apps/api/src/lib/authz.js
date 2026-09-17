import { HttpError } from "./http-error.js";

export function roleCodes(user) {
  return (user.roles ?? []).map((item) => item.role.code);
}

export function permissionCodes(user) {
  return new Set(
    (user.roles ?? []).flatMap((item) =>
      item.role.permissions.map((entry) => entry.permission.code),
    ),
  );
}

export function hasRole(user, ...codes) {
  const roles = roleCodes(user);
  return codes.some((code) => roles.includes(code));
}

export function hasPermission(user, code) {
  return hasRole(user, "SYSTEM_ADMIN") || permissionCodes(user).has(code);
}

export function requirePermission(user, code) {
  if (!hasPermission(user, code)) {
    throw new HttpError(
      403,
      "PERMISSION_DENIED",
      `Permission '${code}' is required`,
    );
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    employeeNumber: user.employeeNumber,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    phone: user.phone,
    jobTitle: user.jobTitle,
    status: user.status,
    departmentId: user.departmentId,
    department: user.department,
    managerId: user.managerId,
    roles: roleCodes(user),
    permissions: [...permissionCodes(user)],
    preferredLanguage: user.preferredLanguage,
    timezone: user.timezone,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
  };
}

export const userWithAccess = {
  department: true,
  roles: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
};
