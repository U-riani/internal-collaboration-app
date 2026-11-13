import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

// Editor uses the same existing form/input palette as the approval type modal.
const newId = () => `node-${crypto.randomUUID()}`;
export const newReviewer = () => ({
  id: newId(), kind: "APPROVER", name: "Review",
  approverRule: "REQUESTER_MANAGER", approverValue: null,
});
export const newGroup = (kind = "ANY") => ({
  id: newId(), kind, children: [newReviewer(), newReviewer()],
});
export const fromLegacySteps = (steps = []) => ({
  id: "root", kind: "SEQUENCE",
  children: steps.length
    ? steps.map((step, index) => ({
        id: `legacy-${step.stepNumber ?? index + 1}`,
        kind: "APPROVER", name: step.name,
        approverRule: step.approverRule, approverValue: step.approverValue ?? null,
      }))
    : [newReviewer()],
});

function updateNode(node, id, updater) {
  if (node.id === id) return updater(node);
  if (node.kind === "APPROVER") return node;
  return { ...node, children: node.children.map((child) => updateNode(child, id, updater)) };
}
function editChildren(node, parentId, edit) {
  return updateNode(node, parentId, (parent) => ({
    ...parent, children: edit(parent.children),
  }));
}

export default function ApprovalWorkflowEditor({ workflow, onChange, users = [] }) {
  const patch = (id, fields) => onChange(updateNode(workflow, id, (n) => ({ ...n, ...fields })));
  const add = (id, node) => onChange(editChildren(workflow, id, (children) => [...children, node]));
  const remove = (parentId, id) => onChange(editChildren(workflow, parentId, (children) => children.filter((c) => c.id !== id)));
  const move = (parentId, id, direction) => onChange(editChildren(workflow, parentId, (children) => {
    const copy = [...children], index = copy.findIndex((n) => n.id === id), other = index + direction;
    if (index < 0 || other < 0 || other >= copy.length) return copy;
    [copy[index], copy[other]] = [copy[other], copy[index]];
    return copy;
  }));
  const draw = (node, parent = null, index = 0, siblings = 1, depth = 0) => {
    const isReviewer = node.kind === "APPROVER";
    return (
      <div key={node.id} className="approval-tree-node" style={{ marginLeft: depth ? 14 : 0 }}>
        <div className="approval-tree-header">
          <span className="approval-tree-node-tag">{isReviewer ? "Reviewer" : node.kind === "SEQUENCE" ? "Sequential" : node.kind === "ANY" ? "Any one · OR" : "All · AND"}</span>
          {parent && (
            <div className="approval-tree-actions">
              <button type="button" className="icon-btn" aria-label="Move approval up" title="Move up" disabled={index === 0} onClick={() => move(parent.id, node.id, -1)}><ArrowUp size={15}/></button>
              <button type="button" className="icon-btn" aria-label="Move approval down" title="Move down" disabled={index === siblings - 1} onClick={() => move(parent.id, node.id, 1)}><ArrowDown size={15}/></button>
              <button type="button" className="icon-btn approval-config-remove" aria-label="Remove approval node" title="Remove" disabled={siblings <= (parent.kind === "SEQUENCE" ? 1 : 2)} onClick={() => remove(parent.id, node.id)}><Trash2 size={15}/></button>
            </div>
          )}
        </div>
        {isReviewer ? (
          <div className="approval-tree-reviewer">
            <input className="input" aria-label="Reviewer step name" required maxLength={150}
              value={node.name} onChange={(e) => patch(node.id, { name: e.target.value })} placeholder="Step name"/>
            <select className="input app-modern-select" aria-label="Reviewer assignment"
              value={node.approverRule === "USER" ? node.approverValue ?? "" : node.approverRule === "ROLE" ? `ROLE:${node.approverValue ?? ""}` : node.approverRule}
              onChange={(e) => {
                const value = e.target.value;
                if (value.startsWith("ROLE:")) patch(node.id, { approverRule: "ROLE", approverValue: value.slice(5) });
                else if (["REQUESTER_MANAGER", "DEPARTMENT_MANAGER"].includes(value)) patch(node.id, { approverRule: value, approverValue: null });
                else patch(node.id, { approverRule: "USER", approverValue: value });
              }}>
              <option value="REQUESTER_MANAGER">Requester’s manager</option>
              <option value="DEPARTMENT_MANAGER">Department manager</option>
              {node.approverRule === "ROLE" && <option value={`ROLE:${node.approverValue}`}>Role: {node.approverValue}</option>}
              {users.filter((person) => person.status === "ACTIVE").map((person) => (
                <option key={person.id} value={person.id}>{person.displayName}</option>
              ))}
            </select>
          </div>
        ) : (
          <>
            {node.id !== "root" && (
              <div className="approval-tree-kind">
                <label>Group rule</label>
                <select className="input app-modern-select" aria-label="Approval group rule" value={node.kind}
                  onChange={(e) => patch(node.id, { kind: e.target.value })}>
                  <option value="SEQUENCE">Sequential — in order</option>
                  <option value="ANY">Any one — OR</option>
                  <option value="ALL">All reviewers — AND</option>
                </select>
              </div>
            )}
            <div className="approval-tree-children">
              {node.children.map((child, i) => draw(child, node, i, node.children.length, depth + 1))}
            </div>
            <div className="approval-tree-add">
              <button type="button" className="btn-secondary approval-config-secondary" onClick={() => add(node.id, newReviewer())}><Plus size={14}/> Add reviewer</button>
              <button type="button" className="btn-secondary approval-config-secondary" onClick={() => add(node.id, newGroup("ANY"))}><Plus size={14}/> Add approval group</button>
            </div>
          </>
        )}
      </div>
    );
  };
  return (
    <div className="approval-tree-editor">
      <p className="approval-config-help">Stages execute in order. Within an OR group the first approval is enough; within an AND group all reviewers must approve. Groups may be nested.</p>
      {draw(workflow)}
    </div>
  );
}
