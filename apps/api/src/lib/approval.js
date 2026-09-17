import { HttpError } from "./http-error.js";

export async function resolveApprover(app, rule, value, requester) {
  if (rule === "USER") return value;
  if (rule === "REQUESTER_MANAGER") return requester.managerId;
  if (rule === "DEPARTMENT_MANAGER") return requester.department?.managerId;
  if (rule === "ROLE") {
    const matches = await app.prisma.userRole.findMany({
      where: { role: { code: value }, user: { status: "ACTIVE" } },
      select: { userId: true },
      take: 2,
    });
    if (matches.length > 1)
      throw new HttpError(
        409,
        "AMBIGUOUS_APPROVER",
        "This role has multiple users. Configure a specific approver",
      );
    return matches[0]?.userId;
  }
  return null;
}

export function requireResolvedApprover(approverId, stepName) {
  if (!approverId) {
    throw new HttpError(
      409,
      "APPROVAL_APPROVER_NOT_RESOLVED",
      `No approver could be resolved for step '${stepName}'`,
    );
  }
}
