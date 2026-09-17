import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowRight,
  Check,
  Clock,
  FileCheck2,
  Settings2,
} from "lucide-react";
import { api, uploadFile } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import {
  Modal,
  Field,
  ErrorBox,
  Badge,
  Empty,
  Loading,
  Attachments,
  prettyDate,
} from "../components/UI.jsx";
function FormFields({ schema, values, setValues, draft = false }) {
  return (
    <>
      {Object.entries(schema || {}).map(([key, field]) => (
        <Field key={key} label={`${field.label}${field.required ? " *" : ""}`}>
          {field.type === "textarea" ? (
            <textarea
              className="input min-h-24"
              required={field.required && !draft}
              value={values[key] ?? ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          ) : field.type === "select" ? (
            <select
              className="input"
              required={field.required && !draft}
              value={values[key] ?? ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            >
              <option value="">Choose…</option>
              {field.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : field.type === "checkbox" ? (
            <input
              type="checkbox"
              className="w-5 h-5"
              checked={values[key] ?? false}
              onChange={(e) =>
                setValues({ ...values, [key]: e.target.checked })
              }
            />
          ) : (
            <input
              className="input"
              type={
                ["number", "date"].includes(field.type) ? field.type : "text"
              }
              step="any"
              required={field.required && !draft}
              value={values[key] ?? ""}
              onChange={(e) =>
                setValues({
                  ...values,
                  [key]:
                    field.type === "number" && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          )}
        </Field>
      ))}
    </>
  );
}
function Configure({ onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [fields, setFields] = useState([
    { label: "Reason", type: "textarea", required: true },
  ]);
  const [steps, setSteps] = useState([
    {
      name: "Manager review",
      approverRule: "REQUESTER_MANAGER",
      approverValue: "",
    },
  ]);
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: () =>
      api("/approval-types", {
        method: "POST",
        body: JSON.stringify({
          name,
          code,
          formSchema: Object.fromEntries(
            fields.map((f, i) => [`field${i + 1}`, f]),
          ),
          steps: steps.map((s, i) => ({
            ...s,
            stepNumber: i + 1,
            approverValue: s.approverValue || null,
          })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-types"] });
      onClose();
    },
  });
  return (
    <Modal title="New approval type" wide onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            label="Code (letters, numbers, underscores)"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <h3 className="text-sm font-bold mt-6 mb-3">Request form</h3>
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div className="flex flex-wrap gap-2" key={i}>
              <input
                className="input flex-1 min-w-40"
                aria-label={`Field ${i + 1} label`}
                placeholder="Field label"
                required
                value={f.label}
                onChange={(e) =>
                  setFields(
                    fields.map((x, j) =>
                      i === j ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
              />
              <select
                className="input w-32"
                aria-label={`Field ${i + 1} type`}
                value={f.type}
                onChange={(e) =>
                  setFields(
                    fields.map((x, j) =>
                      i === j ? { ...x, type: e.target.value } : x,
                    ),
                  )
                }
              >
                {["text", "textarea", "number", "date", "checkbox"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <label className="flex gap-2 items-center text-xs">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) =>
                    setFields(
                      fields.map((x, j) =>
                        i === j ? { ...x, required: e.target.checked } : x,
                      ),
                    )
                  }
                />
                Required
              </label>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove field ${i + 1}`}
                onClick={() => setFields(fields.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3"
          onClick={() =>
            setFields([...fields, { label: "", type: "text", required: false }])
          }
        >
          Add field
        </button>
        <h3 className="text-sm font-bold mt-6 mb-3">
          Approval steps, in order
        </h3>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div
              className="rounded-xl border border-slate-200 p-3 flex flex-wrap gap-2"
              key={i}
            >
              <span className="text-xs pt-3">{i + 1}.</span>
              <input
                className="input flex-1 min-w-36"
                aria-label={`Step ${i + 1} name`}
                required
                value={s.name}
                onChange={(e) =>
                  setSteps(
                    steps.map((x, j) =>
                      i === j ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <select
                className="input flex-1 min-w-44"
                aria-label={`Step ${i + 1} approver`}
                value={
                  s.approverRule === "USER" ? s.approverValue : s.approverRule
                }
                onChange={(e) =>
                  setSteps(
                    steps.map((x, j) =>
                      i === j
                        ? {
                            ...x,
                            approverRule: [
                              "REQUESTER_MANAGER",
                              "DEPARTMENT_MANAGER",
                            ].includes(e.target.value)
                              ? e.target.value
                              : "USER",
                            approverValue: [
                              "REQUESTER_MANAGER",
                              "DEPARTMENT_MANAGER",
                            ].includes(e.target.value)
                              ? ""
                              : e.target.value,
                          }
                        : x,
                    ),
                  )
                }
              >
                <option value="REQUESTER_MANAGER">Requester’s manager</option>
                <option value="DEPARTMENT_MANAGER">Department manager</option>
                {users.data
                  ?.filter((u) => u.status === "ACTIVE")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
              </select>
              {steps.length > 1 && (
                <button
                  className="icon-btn"
                  aria-label={`Remove step ${i + 1}`}
                  type="button"
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3"
          onClick={() =>
            setSteps([
              ...steps,
              {
                name: "Review",
                approverRule: "REQUESTER_MANAGER",
                approverValue: "",
              },
            ])
          }
        >
          Add step
        </button>
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button className="btn-primary" disabled={save.isPending}>
            Create approval type
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RequestForm({ existing, onClose }) {
  const qc = useQueryClient();
  const [typeId, setTypeId] = useState(existing?.approvalTypeId || "");
  const [title, setTitle] = useState(existing?.title || "");
  const [values, setValues] = useState(existing?.data || {});
  const [file, setFile] = useState(null);
  const types = useQuery({
    queryKey: ["approval-types"],
    queryFn: () => api("/approval-types").then((r) => r.data),
  });
  const type = types.data?.find((x) => x.id === typeId);
  const schema = existing?.workflowSnapshot?.formSchema || type?.formSchema;
  const save = useMutation({
    mutationFn: async (submit) => {
      if (existing) {
        await api(`/approval-requests/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title,
            data: values,
            revision: existing.revision,
          }),
        });
        if (submit) {
          const fresh = (await api(`/approval-requests/${existing.id}`)).data;
          await api(`/approval-requests/${existing.id}/submit`, {
            method: "POST",
            body: JSON.stringify({ revision: fresh.revision }),
          });
        }
      } else
        await api("/approval-requests", {
          method: "POST",
          body: JSON.stringify({
            approvalTypeId: typeId,
            title,
            data: values,
            submit,
            attachmentIds: file ? [(await uploadFile(file)).id] : [],
          }),
        });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      onClose();
    },
    onError: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
  return (
    <Modal
      title={existing ? "Revise request" : "New request"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(true);
        }}
      >
        <Field label="Request type">
          <select
            className="input"
            disabled={Boolean(existing)}
            required
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setValues({});
            }}
          >
            <option value="">Choose a type</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Title"
          required
          minLength={2}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <FormFields schema={schema} values={values} setValues={setValues} />
        {!existing && (
          <Field
            label="Attachment (optional)"
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
          />
        )}
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button
            className="btn-secondary"
            type="button"
            disabled={save.isPending || !typeId || title.trim().length < 2}
            onClick={() => save.mutate(false)}
          >
            Save draft
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            Submit request
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RequestDetail({ item, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [edit, setEdit] = useState(false);
  const [decision, setDecision] = useState("APPROVE");
  const current = item.steps.find((s) => s.status === "PENDING");
  const mine = item.requesterId === user.id;
  const canAct = item.status === "PENDING" && current?.approverId === user.id;
  const schema =
    item.workflowSnapshot?.formSchema || item.approvalType.formSchema;
  const save = useMutation({
    mutationFn: ({ action, commentOnly } = {}) =>
      api(
        `/approval-requests/${item.id}/${commentOnly ? "comments" : action === "CANCEL" ? "cancel" : action === "SUBMIT" ? "submit" : "actions"}`,
        {
          method: "POST",
          body: JSON.stringify(
            commentOnly
              ? { content: comment }
              : {
                  revision: item.revision,
                  action: action || decision,
                  comment,
                },
          ),
        },
      ),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
  return (
    <Modal title={item.title} onClose={onClose} wide>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {item.requester.displayName} · {prettyDate(item.createdAt)}
        </p>
        <Badge value={item.status} />
      </div>
      <div className="grid sm:grid-cols-2 gap-5 my-6 rounded-xl bg-slate-50 p-5">
        {Object.entries(schema).map(([key, field]) => (
          <div key={key}>
            <p className="text-xs text-slate-400 mb-1">{field.label}</p>
            <p className="text-sm whitespace-pre-wrap break-words">
              {typeof item.data[key] === "boolean"
                ? item.data[key]
                  ? "Yes"
                  : "No"
                : String(item.data[key] ?? "—")}
            </p>
          </div>
        ))}
      </div>
      <Attachments items={item.attachments} />
      <h3 className="font-semibold text-sm mt-6 mb-4">Approval progress</h3>
      <div className="space-y-3">
        {item.steps.map((s) => (
          <div key={s.id} className="flex gap-3 items-start">
            <span
              className={`rounded-full w-7 h-7 flex items-center justify-center text-xs ${s.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
            >
              {s.status === "APPROVED" ? <Check size={15} /> : s.stepNumber}
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{s.stepName}</span>
                <Badge value={s.status} />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {s.approver.displayName}
              </p>
              {s.comment && (
                <p className="mt-2 text-sm text-slate-500">{s.comment}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {mine && ["DRAFT", "CHANGES_REQUESTED"].includes(item.status) && (
        <div className="mt-6">
          <button className="btn-primary" onClick={() => setEdit(true)}>
            Edit and submit
          </button>
        </div>
      )}
      {canAct && (
        <div className="mt-6 rounded-xl bg-blue-50 p-4">
          <p className="font-semibold text-sm mb-3">Your review is needed</p>
          <select
            className="input mb-3"
            aria-label="Decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="APPROVE">Approve</option>
            <option value="REQUEST_CHANGES">Request changes</option>
            <option value="REJECT">Reject</option>
          </select>
          <textarea
            className="input mb-3"
            aria-label="Review comment"
            placeholder={
              decision === "APPROVE"
                ? "Comment (optional)"
                : "Explain your decision (required)"
            }
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={
              save.isPending || (decision !== "APPROVE" && !comment.trim())
            }
            onClick={() => save.mutate({})}
          >
            Confirm decision
          </button>
        </div>
      )}
      <ErrorBox error={save.error} />
      <h3 className="text-sm font-semibold mt-6 mb-3">Comments</h3>
      {item.comments.map((c) => (
        <p key={c.id} className="text-sm my-3">
          <strong className="text-xs">{c.author.displayName}</strong>
          <br />
          {c.content}
        </p>
      ))}
      {!canAct &&
        (mine ||
          user.roles.includes("SYSTEM_ADMIN") ||
          item.steps.some((step) => step.approverId === user.id)) && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ commentOnly: true });
            }}
          >
            <input
              className="input"
              aria-label="Approval comment"
              required
              placeholder="Add a comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button className="btn-secondary" disabled={save.isPending}>
              Send
            </button>
          </form>
        )}
      {item.rounds?.length > 0 && (
        <details className="mt-5 text-xs text-slate-500">
          <summary>Earlier review rounds ({item.rounds.length})</summary>
          {item.rounds.map((r, i) => (
            <div key={i} className="mt-3">
              Round {i + 1}
              {r.steps.map((s) => (
                <p key={s.id} className="ml-3 mt-1">
                  {s.stepName}: {s.status.toLowerCase()}{" "}
                  {s.comment && `— ${s.comment}`}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
      {mine && !["APPROVED", "REJECTED", "CANCELLED"].includes(item.status) && (
        <button
          className="mt-6 text-xs text-red-600"
          disabled={save.isPending}
          onClick={() => save.mutate({ action: "CANCEL" })}
        >
          Cancel request
        </button>
      )}
      {edit && <RequestForm existing={item} onClose={() => setEdit(false)} />}
    </Modal>
  );
}
export default function ApprovalsPage() {
  const { user, hasPermission } = useAuth();
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const query = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api("/approval-requests").then((r) => r.data),
  });
  const requests = (query.data || []).filter(
    (r) =>
      filter === "all" ||
      (filter === "mine" && r.requesterId === user.id) ||
      (filter === "review" &&
        r.status === "PENDING" &&
        r.steps.some(
          (s) => s.status === "PENDING" && s.approverId === user.id,
        )),
  );
  const item = query.data?.find((r) => r.id === selectedId);
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Clear requests. The right reviewers. Every decision recorded."
        action={
          <div className="flex gap-2">
            {hasPermission("approvals.configure") && (
              <button
                className="btn-secondary"
                onClick={() => setModal("configure")}
              >
                <Settings2 size={17} />
                Request types
              </button>
            )}
            {hasPermission("approvals.submit") && (
              <button
                className="btn-primary"
                onClick={() => setModal("create")}
              >
                <Plus size={17} />
                New request
              </button>
            )}
          </div>
        }
      />
      <div className="toolbar">
        <div className="tabs">
          {[
            ["all", "All requests"],
            ["review", "Needs my review"],
            ["mine", "My requests"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={filter === v ? "active" : ""}
              onClick={() => setFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox error={query.error} />
      <div className="card overflow-hidden">
        {query.isLoading ? (
          <Loading />
        ) : requests.length ? (
          requests.map((r) => (
            <button
              className="list-row w-full text-left"
              key={r.id}
              onClick={() => setSelectedId(r.id)}
            >
              <span className="p-3 rounded-xl bg-blue-50 text-blue-500">
                <FileCheck2 size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{r.title}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {r.approvalType.name} · {r.requester.displayName}
                </p>
              </div>
              <span className="hidden sm:block text-xs text-slate-400">
                {prettyDate(r.createdAt)}
              </span>
              <Badge value={r.status} />
              <ArrowRight className="text-slate-300" size={15} />
            </button>
          ))
        ) : (
          <Empty
            title="No requests here"
            text="Submit a request or choose another view."
          />
        )}
      </div>
      {modal === "create" && <RequestForm onClose={() => setModal(null)} />}{" "}
      {modal === "configure" && <Configure onClose={() => setModal(null)} />}{" "}
      {item && (
        <RequestDetail item={item} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}
