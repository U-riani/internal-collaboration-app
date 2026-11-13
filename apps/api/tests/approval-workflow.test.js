import test from "node:test";
import assert from "node:assert/strict";
import { advanceWorkflow, legacyWorkflow, validateWorkflow, workflowApprovers } from "../src/lib/approval-workflow.js";

const person = (id) => ({ kind: "APPROVER", id, name: id, approverRule: "USER", approverValue: id });
const tree = {
  kind: "SEQUENCE", id: "root", children: [
    person("manager"),
    { kind: "ANY", id: "either", children: [person("finance"), person("operations")] },
    { kind: "ALL", id: "both", children: [person("legal"), person("controller")] },
    person("ceo"),
  ],
};
const rows = () => workflowApprovers(tree).map((n) => ({ nodeId: n.id, status: "WAITING" }));
const advance = (state) => advanceWorkflow(tree, state);
const approve = (state, id) => state.map((r) => r.nodeId === id ? { ...r, status: "APPROVED" } : r);
const update = (state, result) => state.map((r) => ({ ...r, status: result.statuses.get(r.nodeId) }));

test("workflow accepts nested sequence / any / all trees", () => {
  assert.equal(validateWorkflow(tree), tree);
  assert.equal(workflowApprovers(tree).length, 6);
});
test("workflow rejects invalid or duplicated node IDs", () => {
  assert.throws(() => validateWorkflow({ kind: "ALL", id: "x", children: [person("a"), person("a")] }));
});
test("first reviewer is the only initial approver", () => {
  const result = advance(rows());
  assert.deepEqual(result.pendingNodeIds, ["manager"]);
});
test("ANY activates both and first approval skips the alternative", () => {
  let state = update(rows(), advance(rows()));
  state = approve(state, "manager");
  state = update(state, advance(state));
  assert.deepEqual(advance(state).pendingNodeIds, ["finance", "operations"]);
  state = approve(state, "operations");
  state = update(state, advance(state));
  assert.equal(state.find((s) => s.nodeId === "finance").status, "SKIPPED");
  assert.deepEqual(advance(state).pendingNodeIds, ["legal", "controller"]);
});
test("ALL waits for both approvals before CEO and final completion", () => {
  let state = rows();
  for (const id of ["manager", "finance", "legal", "controller", "ceo"]) {
    state = update(state, advance(state));
    assert.equal(state.find((r) => r.nodeId === id).status, "PENDING");
    state = approve(state, id);
    if (id === "legal") assert.deepEqual(advance(state).pendingNodeIds, ["controller"]);
  }
  assert.equal(advance(state).complete, true);
});
test("legacy sequential steps remain supported", () => {
  const old = legacyWorkflow([{ stepNumber: 1, name: "Manager", approverRule: "REQUESTER_MANAGER" }, { stepNumber: 2, name: "CEO", approverRule: "REQUESTER_MANAGER" }]);
  validateWorkflow(old);
  const r = workflowApprovers(old).map((n) => ({ nodeId: n.id, status: "WAITING" }));
  assert.deepEqual(advanceWorkflow(old, r).pendingNodeIds, ["legacy-1"]);
});
