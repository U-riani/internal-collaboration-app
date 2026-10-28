import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tasksPage = readFileSync(new URL("../src/pages/TasksPage.jsx", import.meta.url), "utf8");
const taskStyles = readFileSync(new URL("../src/pages/tasks-page.css", import.meta.url), "utf8");
const approvalsPage = readFileSync(new URL("../src/pages/ApprovalsPage.jsx", import.meta.url), "utf8");
const approvalStyles = readFileSync(new URL("../src/pages/approvals-page.css", import.meta.url), "utf8");

describe("Group Add Task and New Request design-system regression", () => {
  it("uses the shared primary button for group task creation without Tailwind white hover", () => {
    expect(tasksPage).toContain('className="btn-primary task-group-add"');
    expect(tasksPage).toContain('openCreateForGroup(event, group.id)');
    expect(tasksPage).not.toContain('text-slate-500 hover:bg-white hover:text-slate-800');
    expect(taskStyles).toContain('.task-group-add.btn-primary:hover:not(:disabled)');
    expect(taskStyles).toContain('color: var(--app-ui-accent-label, #fff)');
    expect(taskStyles).toContain('filter: brightness(1.045);');
    expect(taskStyles).toContain('outline: 2px solid var(--app-ui-focus-ring, #918bff)');
  });

  it("reuses the common modal and select for create and revise requests", () => {
    expect(approvalsPage).toContain('title={existing ? "Revise request" : "New request"}');
    expect(approvalsPage).toContain('className="approval-request-form"');
    expect(approvalsPage).toContain('className="approval-request-fields"');
    expect(approvalsPage).toContain('className="input app-modern-select approval-request-type"');
    expect(approvalsPage).toContain('className="input app-modern-select"');
    expect(approvalsPage).toContain('className="input approval-request-title"');
    expect(approvalsPage).toContain('className="input approval-request-file"');
    expect(approvalsPage).toContain('className="approval-request-checkbox h-5 w-5"');
    expect(approvalsPage).toContain('className="form-actions approval-request-actions"');
  });

  it("preserves request submission, draft, attachments and dynamic form data", () => {
    expect(approvalsPage).toContain('onSubmit={(e) => {');
    expect(approvalsPage).toContain('save.mutate(true);');
    expect(approvalsPage).toContain('onClick={() => save.mutate(false)}');
    expect(approvalsPage).toContain('data: values,');
    expect(approvalsPage).toContain('attachmentIds: await uploadFiles(files, attachmentUploads.current)');
    expect(approvalsPage).toContain('onChange={addFiles}');
    expect(approvalsPage).toContain('onRemove={removeFile}');
    expect(approvalsPage).toContain('<FormFields schema={schema} values={values} setValues={setValues} />');
  });

  it("keeps Save draft readable and prevents hover changes while disabled", () => {
    expect(approvalsPage).toContain('disabled={save.isPending || !typeId || title.trim().length < 2}');
    expect(approvalsPage).toContain('onClick={() => save.mutate(false)}');
    expect(approvalStyles).toContain('.app-theme-dark .approval-request-actions .btn-secondary:hover:not(:disabled)');
    expect(approvalStyles).toContain('.app-theme-dark .approval-request-actions .btn-secondary:disabled:hover');
    expect(approvalStyles).toContain('opacity: 1;');
    expect(approvalStyles).toContain('color: var(--app-muted);');
    expect(approvalStyles).toContain('background: var(--app-interactive-hover);');
    expect(approvalStyles).toContain('color: var(--app-interactive-hover-text);');
    expect(approvalStyles).toContain('background: var(--app-surface-raised);');
  });

  it("keeps the request dialog themed, scrollable and readable in all dark themes", () => {
    expect(approvalStyles).toContain('.modal[open]:has(> .modal-body > .approval-request-form)');
    expect(approvalStyles).toContain('background: var(--app-surface);');
    expect(approvalStyles).toContain('background: var(--app-surface-input);');
    expect(approvalStyles).toContain('color: var(--app-text);');
    expect(approvalStyles).toContain('border-color: var(--app-ui-focus-ring, #918bff)');
    expect(approvalStyles).toContain('overflow-y: auto;');
    expect(approvalStyles).toContain('.approval-request-file::file-selector-button');
    expect(approvalStyles).toContain('position: static;');
    expect(approvalStyles).toContain('background: linear-gradient(110deg, var(--app-ui-accent-start, #867afa), var(--app-ui-accent-end, #6465ef))');
    expect(approvalStyles).toContain('color: var(--app-ui-accent-label, #fff)');
  });
});
