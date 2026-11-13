// Pure workflow planning functions. All inputs are snapshotted per request.
// A tree combines ordered SEQUENCE stages with concurrent ANY / ALL groups.
export function legacyWorkflow(steps) {
  return {
    kind: "SEQUENCE",
    id: "root",
    children: steps.map((step, index) => ({
      kind: "APPROVER",
      id: `legacy-${step.stepNumber ?? index + 1}`,
      name: step.name,
      approverRule: step.approverRule,
      approverValue: step.approverValue ?? null,
    })),
  };
}

export function workflowApprovers(root) {
  if (root.kind === "APPROVER") return [root];
  return root.children.flatMap(workflowApprovers);
}

export function validateWorkflow(root) {
  const seen = new Set();
  let count = 0;
  const visit = (node, depth) => {
    if (!node || typeof node !== "object" || Array.isArray(node) || depth > 8)
      throw new Error("Approval workflow has an invalid node or excessive nesting");
    if (typeof node.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(node.id) || seen.has(node.id))
      throw new Error("Each workflow node must have a unique valid ID");
    seen.add(node.id);
    if (node.kind === "APPROVER") {
      count += 1;
      if (count > 40) throw new Error("Approval workflows allow at most 40 reviewers");
      if (typeof node.name !== "string" || !node.name.trim() || node.name.length > 150)
        throw new Error("Each reviewer needs a name");
      if (!["USER", "REQUESTER_MANAGER", "DEPARTMENT_MANAGER", "ROLE"].includes(node.approverRule))
        throw new Error("Invalid approver routing rule");
      if (["USER", "ROLE"].includes(node.approverRule) && !node.approverValue)
        throw new Error("Select the user or role for each reviewer");
      if (node.children !== undefined) throw new Error("A reviewer cannot contain child nodes");
      return;
    }
    if (!["SEQUENCE", "ANY", "ALL"].includes(node.kind) || !Array.isArray(node.children))
      throw new Error("Unknown workflow group");
    if (node.children.length < (node.kind === "SEQUENCE" ? 1 : 2) || node.children.length > 40)
      throw new Error("Approval groups require valid child counts");
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(root, 0);
  if (!count) throw new Error("Configure at least one reviewer");
  return root;
}

// Compute which leaves are eligible now. Keeps approved decisions immutable, and
// marks remaining alternatives SKIPPED after one branch of an ANY group succeeds.
export function advanceWorkflow(root, rows) {
  const status = new Map(rows.map((row) => [row.nodeId, row.status]));
  const approved = (node) => {
    if (node.kind === "APPROVER") return status.get(node.id) === "APPROVED";
    if (node.kind === "ANY") return node.children.some(approved);
    return node.children.every(approved);
  };
  const skip = (node) => {
    if (node.kind === "APPROVER") {
      if (["PENDING", "WAITING"].includes(status.get(node.id))) status.set(node.id, "SKIPPED");
    } else node.children.forEach(skip);
  };
  const settleAlternatives = (node) => {
    if (node.kind === "APPROVER") return;
    for (const child of node.children) settleAlternatives(child);
    if (node.kind === "ANY" && node.children.some(approved))
      for (const child of node.children) if (!approved(child)) skip(child);
  };
  settleAlternatives(root);

  const finished = approved(root);
  const pending = new Set();
  const visit = (node) => {
    if (approved(node)) return;
    if (node.kind === "APPROVER") {
      if (["WAITING", "PENDING"].includes(status.get(node.id))) pending.add(node.id);
      return;
    }
    if (node.kind === "SEQUENCE") {
      const next = node.children.find((child) => !approved(child));
      if (next) visit(next);
    } else {
      for (const child of node.children) if (!approved(child)) visit(child);
    }
  };
  if (!finished) visit(root);
  for (const row of rows) {
    if (["PENDING", "WAITING"].includes(status.get(row.nodeId)))
      status.set(row.nodeId, pending.has(row.nodeId) ? "PENDING" : "WAITING");
  }
  return {
    complete: finished,
    statuses: status,
    pendingNodeIds: [...pending],
  };
}
