import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Check,
  FileCheck2,
  Settings2,
  ChevronDown,
  ChevronRight,
  Columns3,
  FolderPlus,
  GripVertical,
  List,
  ListFilter,
  ArrowUpDown,
  Pencil,
  Search,
  Trash2,
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
const approvalStatuses = [
  "DRAFT",
  "SUBMITTED",
  "PENDING",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];
const UNGROUPED = "__ungrouped__";

const DEFAULT_APPROVAL_FILTERS = {
  statuses: [],
  typeIds: [],
  requesterIds: [],
  groupIds: [],
  createdFrom: "",
  createdTo: "",
};

const APPROVAL_SORT_OPTIONS = [
  ["manual", "Default / manual"],
  ["created_desc", "Created · newest"],
  ["created_asc", "Created · oldest"],
  ["title_asc", "Title · A to Z"],
  ["title_desc", "Title · Z to A"],
  ["requester_asc", "Requester · A to Z"],
  ["requester_desc", "Requester · Z to A"],
  ["type_asc", "Request type · A to Z"],
  ["type_desc", "Request type · Z to A"],
  ["status", "Status"],
];

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
function nextFieldKey(fields) {
  let n = fields.length + 1;
  while (fields.some((field) => field.key === `field${n}`)) n += 1;
  return `field${n}`;
}
function Configure({ existing, onClose }) {
  const qc = useQueryClient();
  const usedCount = existing?._count?.requests || 0;
  const [name, setName] = useState(existing?.name || "");
  const [code, setCode] = useState(existing?.code || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [fields, setFields] = useState(() =>
    existing
      ? Object.entries(existing.formSchema || {}).map(([key, field]) => ({
          key,
          ...field,
        }))
      : [
          {
            key: "field1",
            label: "Reason",
            type: "textarea",
            required: true,
          },
        ],
  );
  const [steps, setSteps] = useState(() =>
    existing?.steps?.length
      ? existing.steps.map(({ name, approverRule, approverValue }) => ({
          name,
          approverRule,
          approverValue: approverValue || "",
        }))
      : [
          {
            name: "Manager review",
            approverRule: "REQUESTER_MANAGER",
            approverValue: "",
          },
        ],
  );
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: () =>
      api(existing ? `/approval-types/${existing.id}` : "/approval-types", {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          code,
          description: description || undefined,
          formSchema: Object.fromEntries(
            fields.map(({ key, label, type, required, options }) => [
              key,
              {
                label,
                type,
                required,
                ...(type === "select" ? { options } : {}),
              },
            ]),
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
      qc.invalidateQueries({ queryKey: ["approval-types-manage"] });
      onClose();
    },
  });
  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "New approval type"}
      wide
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {existing && (
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            <strong className="text-slate-700">
              Version {existing.version}
            </strong>
            {" · "}
            {usedCount} request{usedCount === 1 ? "" : "s"} created from this
            type. Saving configuration changes creates version{" "}
            {existing.version + 1}; existing requests keep their saved workflow.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div>
            <Field label="Code (letters, numbers, underscores)">
              <input
                className="input"
                required
                disabled={Boolean(existing && usedCount > 0)}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </Field>
            {existing && usedCount > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                The code is locked because this request type is already in use.
              </p>
            )}
          </div>
        </div>
        <Field label="Description">
          <textarea
            className="input min-h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <h3 className="text-sm font-bold mt-6 mb-3">Request form</h3>
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div className="rounded-xl border border-slate-200 p-3" key={f.key}>
              <div className="flex flex-wrap gap-2">
                <input
                  className="input w-32"
                  aria-label={`Field ${i + 1} key`}
                  title="Technical field key"
                  required
                  pattern="[A-Za-z][A-Za-z0-9_]*"
                  value={f.key}
                  onChange={(e) =>
                    setFields(
                      fields.map((x, j) =>
                        i === j ? { ...x, key: e.target.value } : x,
                      ),
                    )
                  }
                />
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
                        i === j
                          ? {
                              ...x,
                              type: e.target.value,
                              ...(e.target.value === "select"
                                ? {
                                    options: x.options?.length
                                      ? x.options
                                      : ["Option 1"],
                                  }
                                : { options: undefined }),
                            }
                          : x,
                      ),
                    )
                  }
                >
                  {[
                    "text",
                    "textarea",
                    "number",
                    "date",
                    "select",
                    "checkbox",
                  ].map((t) => (
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
              {f.type === "select" && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-slate-600">
                      Options
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={(f.options || []).length >= 50}
                      onClick={() =>
                        setFields(
                          fields.map((x, j) =>
                            i === j
                              ? {
                                  ...x,
                                  options: [...(x.options || []), ""],
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <Plus size={14} />
                      Add option
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(f.options || ["Option 1"]).map((option, optionIndex) => (
                      <div
                        className="flex items-center gap-2"
                        key={`option-${optionIndex}`}
                      >
                        <input
                          className="input flex-1"
                          aria-label={`Field ${i + 1} option ${optionIndex + 1}`}
                          placeholder={`Option ${optionIndex + 1}`}
                          required
                          value={option}
                          onChange={(e) =>
                            setFields(
                              fields.map((x, j) =>
                                i === j
                                  ? {
                                      ...x,
                                      options: (x.options || []).map(
                                        (value, index) =>
                                          index === optionIndex
                                            ? e.target.value
                                            : value,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        {(f.options || []).length > 1 && (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Remove field ${i + 1} option ${optionIndex + 1}`}
                            onClick={() =>
                              setFields(
                                fields.map((x, j) =>
                                  i === j
                                    ? {
                                        ...x,
                                        options: (x.options || []).filter(
                                          (_, index) => index !== optionIndex,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3"
          onClick={() =>
            setFields([
              ...fields,
              {
                key: nextFieldKey(fields),
                label: "",
                type: "text",
                required: false,
              },
            ])
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
            {existing ? "Save new version" : "Create approval type"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RequestTypesManager({ onClose }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const query = useQuery({
    queryKey: ["approval-types-manage"],
    queryFn: () => api("/approval-types/manage").then((r) => r.data),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status }) =>
      api(`/approval-types/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-types"] });
      qc.invalidateQueries({ queryKey: ["approval-types-manage"] });
    },
  });

  if (editing !== null)
    return (
      <Configure
        existing={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
    );

  const normalized = search.trim().toLowerCase();
  const items = (query.data || []).filter(
    (item) =>
      (status === "all" || item.status === status) &&
      (!normalized ||
        item.name.toLowerCase().includes(normalized) ||
        item.code.toLowerCase().includes(normalized)),
  );

  return (
    <Modal title="Request types" wide onClose={onClose}>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className="input flex-1 min-w-52"
          aria-label="Search request types"
          placeholder="Search request types…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-36"
          aria-label="Request type status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="DRAFT">Draft</option>
        </select>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          <Plus size={16} />
          New type
        </button>
      </div>
      <ErrorBox error={query.error || changeStatus.error} />
      {query.isLoading ? (
        <Loading />
      ) : items.length ? (
        <div className="space-y-2">
          {items.map((item) => {
            const requestCount = item._count?.requests || 0;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-52">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{item.name}</h3>
                    <Badge value={item.status} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {item.code} · v{item.version} · {requestCount} request
                    {requestCount === 1 ? "" : "s"}
                    {item.createdBy?.displayName
                      ? ` · Created by ${item.createdBy.displayName}`
                      : ""}
                  </p>
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => setEditing(item)}
                >
                  Edit
                </button>
                <button
                  className="btn-secondary"
                  disabled={changeStatus.isPending}
                  onClick={() =>
                    changeStatus.mutate({
                      id: item.id,
                      status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                    })
                  }
                >
                  {item.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No request types"
          text="Create a request type or change the current filter."
        />
      )}
    </Modal>
  );
}
function ApprovalGroupForm({ existing, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name || "");
  const save = useMutation({
    mutationFn: () =>
      api(existing ? `/approval-groups/${existing.id}` : "/approval-groups", {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-groups"] });
      onClose();
    },
  });

  return (
    <Modal
      title={existing ? "Rename approval group" : "New approval group"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field
          label="Group name"
          required
          minLength={1}
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : existing ? "Save" : "Create group"}
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
      qc.invalidateQueries({ queryKey: ["approval-bases"] });
      qc.invalidateQueries({ queryKey: ["approval-base-records"] });
      if (existing?.id)
        qc.invalidateQueries({ queryKey: ["approval", existing.id] });
      onClose();
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["approval-base-records"] });
      if (existing?.id)
        qc.invalidateQueries({ queryKey: ["approval", existing.id] });
    },
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
export function RequestDetail({ item, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const groups = useQuery({
    queryKey: ["approval-groups"],
    queryFn: () => api("/approval-groups").then((response) => response.data),
  });
  const updateLayout = useMutation({
    mutationFn: (groupId) =>
      api(`/approval-requests/${item.id}/layout`, {
        method: "PUT",
        body: JSON.stringify({ groupId: groupId || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["approval-groups"] });
    },
  });

  useEffect(() => {
    let active = true;
    api("/notifications/read-related", {
      method: "POST",
      body: JSON.stringify({
        entityType: "APPROVAL_REQUEST",
        entityId: item.id,
      }),
    })
      .then(() => {
        if (active) qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [item.id, qc]);
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
      qc.invalidateQueries({ queryKey: ["approval-bases"] });
      qc.invalidateQueries({ queryKey: ["approval-base-records"] });
      qc.invalidateQueries({ queryKey: ["approval", item.id] });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["approval-base-records"] });
      qc.invalidateQueries({ queryKey: ["approval", item.id] });
    },
  });
  return (
    <Modal title={item.title} onClose={onClose} wide>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {item.requester.displayName} ·{" "}
          {item.workflowSnapshot?.type?.name || item.approvalType.name} · v
          {item.workflowSnapshot?.type?.version || item.approvalTypeVersion} ·{" "}
          {prettyDate(item.createdAt)}
        </p>
        <Badge value={item.status} />
      </div>
      <div className="mt-5 max-w-xs">
        <Field label="My group">
          <select
            className="input"
            value={item.personalLayout?.groupId || ""}
            disabled={updateLayout.isPending}
            onChange={(event) => updateLayout.mutate(event.target.value)}
          >
            <option value="">Ungrouped</option>
            {(groups.data || []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </Field>
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
      <ErrorBox error={save.error || updateLayout.error || groups.error} />
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedRequestId = searchParams.get("request");
  const [involvement, setInvolvement] = useState("all");
  const [search, setSearch] = useState("");
  const [board, setBoard] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState(
    DEFAULT_APPROVAL_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("manual");
  const [modal, setModal] = useState(null);
  const [groupForm, setGroupForm] = useState(null);
  const [selectedId, setSelectedId] = useState(linkedRequestId);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [draggingId, setDraggingId] = useState(null);
  const [draggingGroupId, setDraggingGroupId] = useState(null);

  const query = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api("/approval-requests").then((response) => response.data),
  });
  const groups = useQuery({
    queryKey: ["approval-groups"],
    queryFn: () => api("/approval-groups").then((response) => response.data),
  });
  const moveLayout = useMutation({
    mutationFn: ({ requestId, groupId }) =>
      api(`/approval-requests/${requestId}/layout`, {
        method: "PUT",
        body: JSON.stringify({ groupId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["approval-groups"] });
    },
  });
  const reorderGroup = useMutation({
    mutationFn: async ({ sourceId, targetId }) => {
      const source = (groups.data || []).find((group) => group.id === sourceId);
      const target = (groups.data || []).find((group) => group.id === targetId);
      if (!source || !target || source.id === target.id) return;
      await Promise.all([
        api(`/approval-groups/${source.id}`, {
          method: "PATCH",
          body: JSON.stringify({ position: target.position }),
        }),
        api(`/approval-groups/${target.id}`, {
          method: "PATCH",
          body: JSON.stringify({ position: source.position }),
        }),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-groups"] }),
  });
  const deleteGroup = useMutation({
    mutationFn: (groupId) =>
      api(`/approval-groups/${groupId}`, { method: "DELETE" }),
    onSuccess: (_data, groupId) => {
      setAdvancedFilters((current) => ({
        ...current,
        groupIds: current.groupIds.filter((id) => id !== groupId),
      }));
      qc.invalidateQueries({ queryKey: ["approval-groups"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  useEffect(() => {
    if (linkedRequestId) setSelectedId(linkedRequestId);
  }, [linkedRequestId]);

  const closeRequest = () => {
    setSelectedId(null);
    if (linkedRequestId) {
      const next = new URLSearchParams(searchParams);
      next.delete("request");
      setSearchParams(next, { replace: true });
    }
  };

  const allRequests = query.data || [];
  const typeOptions = useMemo(() => {
    const byId = new Map();
    for (const request of allRequests) {
      if (byId.has(request.approvalTypeId)) continue;
      byId.set(request.approvalTypeId, {
        id: request.approvalTypeId,
        name: request.workflowSnapshot?.type?.name || request.approvalType.name,
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allRequests]);
  const requesterOptions = useMemo(() => {
    const byId = new Map();
    for (const request of allRequests)
      byId.set(request.requester.id, request.requester);
    return [...byId.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }, [allRequests]);

  const visibleRequests = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return allRequests.filter((request) => {
      const typeName =
        request.workflowSnapshot?.type?.name || request.approvalType.name;
      const currentApprover = request.steps.some(
        (step) => step.status === "PENDING" && step.approverId === user.id,
      );
      const involved =
        request.requesterId === user.id ||
        request.steps.some((step) => step.approverId === user.id);
      const involvementMatch =
        involvement === "all" ||
        (involvement === "review" && currentApprover) ||
        (involvement === "mine" && request.requesterId === user.id) ||
        (involvement === "involved" && involved);
      const textMatch =
        !normalized ||
        `${request.title} ${typeName} ${request.requester.displayName}`
          .toLowerCase()
          .includes(normalized);
      const statusMatch =
        !advancedFilters.statuses.length ||
        advancedFilters.statuses.includes(request.status);
      const typeMatch =
        !advancedFilters.typeIds.length ||
        advancedFilters.typeIds.includes(request.approvalTypeId);
      const requesterMatch =
        !advancedFilters.requesterIds.length ||
        advancedFilters.requesterIds.includes(request.requesterId);
      const requestGroupId = request.personalLayout?.groupId || UNGROUPED;
      const groupMatch =
        !advancedFilters.groupIds.length ||
        advancedFilters.groupIds.includes(requestGroupId);
      const createdAt = request.createdAt ? new Date(request.createdAt) : null;
      const createdFromMatch =
        !advancedFilters.createdFrom ||
        (createdAt &&
          createdAt >= new Date(`${advancedFilters.createdFrom}T00:00:00`));
      const createdToMatch =
        !advancedFilters.createdTo ||
        (createdAt &&
          createdAt <= new Date(`${advancedFilters.createdTo}T23:59:59.999`));

      return (
        involvementMatch &&
        textMatch &&
        statusMatch &&
        typeMatch &&
        requesterMatch &&
        groupMatch &&
        createdFromMatch &&
        createdToMatch
      );
    });
  }, [allRequests, search, involvement, advancedFilters, user.id]);

  const compareManualPosition = (left, right) =>
    (left.personalLayout?.position ?? Number.MAX_SAFE_INTEGER) -
    (right.personalLayout?.position ?? Number.MAX_SAFE_INTEGER);

  const requestTypeName = (request) =>
    request.workflowSnapshot?.type?.name || request.approvalType.name;

  const sortRequests = (items) =>
    items.slice().sort((left, right) => {
      let result = 0;

      if (sortBy === "created_desc")
        result =
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime();
      else if (sortBy === "created_asc")
        result =
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime();
      else if (sortBy === "title_asc")
        result = left.title.localeCompare(right.title);
      else if (sortBy === "title_desc")
        result = right.title.localeCompare(left.title);
      else if (sortBy === "requester_asc")
        result = left.requester.displayName.localeCompare(
          right.requester.displayName,
        );
      else if (sortBy === "requester_desc")
        result = right.requester.displayName.localeCompare(
          left.requester.displayName,
        );
      else if (sortBy === "type_asc")
        result = requestTypeName(left).localeCompare(requestTypeName(right));
      else if (sortBy === "type_desc")
        result = requestTypeName(right).localeCompare(requestTypeName(left));
      else if (sortBy === "status")
        result =
          approvalStatuses.indexOf(left.status) -
          approvalStatuses.indexOf(right.status);
      else result = compareManualPosition(left, right);

      return (
        result ||
        compareManualPosition(left, right) ||
        new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
      );
    });

  const groupSections = useMemo(() => {
    const sections = (groups.data || []).map((group) => ({
      ...group,
      requests: sortRequests(
        visibleRequests.filter(
          (request) => request.personalLayout?.groupId === group.id,
        ),
      ),
    }));

    sections.push({
      id: UNGROUPED,
      name: "Ungrouped",
      canManage: false,
      canUse: true,
      requests: sortRequests(
        visibleRequests.filter((request) => !request.personalLayout?.groupId),
      ),
    });

    return advancedFilters.groupIds.length
      ? sections.filter((group) => advancedFilters.groupIds.includes(group.id))
      : sections;
    // sortRequests depends on sortBy and the static ordering above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.data, visibleRequests, advancedFilters.groupIds, sortBy]);

  const item = allRequests.find((request) => request.id === selectedId);

  const toggleAdvancedValue = (key, value) => {
    setAdvancedFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  };

  const setAdvancedValues = (key, event) => {
    const values = [...event.target.selectedOptions].map(
      (option) => option.value,
    );
    setAdvancedFilters((current) => ({ ...current, [key]: values }));
  };

  const setAdvancedValue = (key, value) =>
    setAdvancedFilters((current) => ({ ...current, [key]: value }));

  const clearAdvancedFilters = () =>
    setAdvancedFilters(DEFAULT_APPROVAL_FILTERS);

  const toggleGroup = (groupId) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  const resetFilters = () => {
    setSearch("");
    setInvolvement("all");
    clearAdvancedFilters();
  };

  const approvalCard = (request) => {
    const typeName =
      request.workflowSnapshot?.type?.name || request.approvalType.name;
    const current = request.steps.find((step) => step.status === "PENDING");
    return (
      <button
        key={request.id}
        draggable
        onDragStart={(event) => {
          setDraggingId(request.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", request.id);
        }}
        onDragEnd={() => setDraggingId(null)}
        onClick={() => setSelectedId(request.id)}
        className={`card w-full p-4 text-left transition hover:border-blue-300 ${
          draggingId === request.id ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">
            {request.title}
          </span>
          <Badge value={request.status} />
        </div>
        <p className="mt-2 truncate text-xs font-medium text-slate-500">
          {typeName}
        </p>
        <p className="mt-3 text-xs text-slate-400">
          Requested by {request.requester.displayName}
        </p>
        {current && (
          <p className="mt-2 truncate text-[11px] text-slate-400">
            Current review · {current.approver.displayName}
          </p>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          {prettyDate(request.createdAt)}
        </p>
      </button>
    );
  };

  const approvalRow = (request) => {
    const typeName =
      request.workflowSnapshot?.type?.name || request.approvalType.name;
    const current = request.steps.find((step) => step.status === "PENDING");
    return (
      <button
        className="approval-list-row grid min-w-[900px] w-full grid-cols-[minmax(280px,1.8fr)_180px_190px_145px_160px] items-center gap-4 border-t border-slate-100 px-5 py-3.5 text-left transition hover:bg-slate-50"
        key={request.id}
        onClick={() => setSelectedId(request.id)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-blue-50 p-2 text-blue-500">
            <FileCheck2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-700">
              {request.title}
            </p>
            <p className="mt-1 truncate text-xs text-slate-400">
              {current
                ? `Current review · ${current.approver.displayName}`
                : "No active reviewer"}
            </p>
          </div>
        </div>
        <span className="truncate text-sm text-slate-600">
          {request.requester.displayName}
        </span>
        <span className="truncate text-sm text-slate-500">{typeName}</span>
        <span>
          <Badge value={request.status} />
        </span>
        <span className="text-sm text-slate-400">
          {prettyDate(request.createdAt)}
        </span>
      </button>
    );
  };

  const advancedFilterCount = [
    advancedFilters.statuses.length,
    advancedFilters.typeIds.length,
    advancedFilters.requesterIds.length,
    advancedFilters.groupIds.length,
    Boolean(advancedFilters.createdFrom),
    Boolean(advancedFilters.createdTo),
  ].filter(Boolean).length;

  const activeFilterCount =
    (involvement !== "all" ? 1 : 0) +
    advancedFilterCount +
    (search.trim() ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Approvals"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={() => setGroupForm({})}>
              <FolderPlus size={17} />
              New group
            </button>
            <button
              className="btn-secondary"
              onClick={() => navigate("/approvals/bases")}
            >
              <Columns3 size={17} />
              Approval bases
            </button>
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

      <div className="relative">
        <div className="approval-toolbar toolbar flex items-center gap-4 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="approval-toolbar-primary min-w-0 flex-1">
            <div className="tabs" aria-label="Approval quick filters">
              {[
                ["all", "All"],
                ["review", "Needs my review"],
                ["mine", "My requests"],
                ["involved", "I'm involved"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={involvement === value ? "active" : ""}
                  onClick={() => setInvolvement(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="approval-toolbar-secondary ml-auto flex items-center gap-2">
            <div className="approval-search relative">
              <Search
                className="absolute right-3 top-3 text-slate-400"
                size={15}
              />
              <input
                aria-label="Search approvals"
                className="input w-full pl-9 pe-8! sm:w-56"
                placeholder="Search approvals"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="relative">
              <button
                type="button"
                className={`btn-secondary relative ${
                  advancedFilterCount
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : ""
                }`}
                onClick={() => setFiltersOpen((current) => !current)}
                aria-expanded={filtersOpen}
              >
                <ListFilter size={16} />
                <span className="hidden xl:inline">Filter</span>
                {advancedFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                    {advancedFilterCount}
                  </span>
                )}
              </button>

              {filtersOpen && (
                <div className="approval-filter-panel fixed left-1/2 top-2 z-50 w-[680px] max-w-[calc(100vw-48px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white px-5 shadow-xl max-h-[calc(100vh-1rem)]">
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white pb-3 pt-5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">
                        Filter approvals
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        These filters refine the selected quick filter.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setFiltersOpen(false)}
                    >
                      x
                    </button>
                  </div>

                  <div className="relative mb-4 flex min-h-8 items-center pt-3">
                    {advancedFilterCount > 0 && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                        onClick={clearAdvancedFilters}
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Status
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {approvalStatuses.map((status) => (
                          <label
                            key={status}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={advancedFilters.statuses.includes(
                                status,
                              )}
                              onChange={() =>
                                toggleAdvancedValue("statuses", status)
                              }
                            />
                            <span>{status.replaceAll("_", " ")}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <label className="text-xs font-semibold text-slate-500">
                      Request type
                      <select
                        multiple
                        className="input mt-1.5 h-28"
                        value={advancedFilters.typeIds}
                        onChange={(event) =>
                          setAdvancedValues("typeIds", event)
                        }
                      >
                        {typeOptions.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-500">
                      Requester
                      <select
                        multiple
                        className="input mt-1.5 h-28"
                        value={advancedFilters.requesterIds}
                        onChange={(event) =>
                          setAdvancedValues("requesterIds", event)
                        }
                      >
                        {requesterOptions.map((requester) => (
                          <option key={requester.id} value={requester.id}>
                            {requester.displayName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-500 md:col-span-2">
                      Personal group
                      <select
                        multiple
                        className="input mt-1.5 h-28"
                        value={advancedFilters.groupIds}
                        onChange={(event) =>
                          setAdvancedValues("groupIds", event)
                        }
                      >
                        <option value={UNGROUPED}>Ungrouped</option>
                        {(groups.data || []).map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2">
                      <label className="text-xs font-semibold text-slate-500">
                        Created from
                        <input
                          type="date"
                          className="input mt-1.5"
                          value={advancedFilters.createdFrom}
                          onChange={(event) =>
                            setAdvancedValue("createdFrom", event.target.value)
                          }
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-500">
                        Created to
                        <input
                          type="date"
                          className="input mt-1.5"
                          value={advancedFilters.createdTo}
                          onChange={(event) =>
                            setAdvancedValue("createdTo", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-100 bg-white py-3 pt-4">
                    <span className="hidden text-xs text-slate-400 sm:inline">
                      Hold Ctrl/Cmd to select multiple values.
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setFiltersOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
              <ArrowUpDown size={15} className="text-slate-400" />
              <select
                aria-label="Sort approvals"
                className="max-w-44 bg-transparent outline-none"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                {APPROVAL_SORT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div
              className="inline-flex rounded-xl border border-slate-200 bg-white p-1"
              aria-label="Approval view"
            >
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  !board
                    ? "bg-slate-100 text-slate-800"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setBoard(false)}
              >
                <List size={15} />
                <span className="hidden xl:inline">List</span>
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  board
                    ? "bg-slate-100 text-slate-800"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setBoard(true)}
              >
                <Columns3 size={15} />
                <span className="hidden xl:inline">Board</span>
              </button>
            </div>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
            </span>
            <button
              type="button"
              className="font-semibold text-slate-500 hover:text-slate-800"
              onClick={resetFilters}
            >
              Clear
            </button>
          </div>
        )}

        <ErrorBox
          error={
            query.error ||
            groups.error ||
            moveLayout.error ||
            deleteGroup.error ||
            reorderGroup.error
          }
        />

        {query.isLoading || groups.isLoading ? (
          <Loading />
        ) : board ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {groupSections.map((group) => (
              <section
                key={group.id}
                className="approval-board-column w-[300px] min-w-[300px] rounded-xl bg-slate-100 p-3"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceGroupId = event.dataTransfer.getData(
                    "application/x-approval-group",
                  );
                  if (
                    sourceGroupId &&
                    group.id !== UNGROUPED &&
                    sourceGroupId !== group.id
                  ) {
                    reorderGroup.mutate({
                      sourceId: sourceGroupId,
                      targetId: group.id,
                    });
                    setDraggingGroupId(null);
                    return;
                  }

                  const requestId =
                    draggingId || event.dataTransfer.getData("text/plain");
                  if (!requestId) return;
                  moveLayout.mutate({
                    requestId,
                    groupId: group.id === UNGROUPED ? null : group.id,
                  });
                  setDraggingId(null);
                }}
              >
                <div className="mb-4 flex items-center gap-2 px-1">
                  {group.canManage && (
                    <span
                      draggable
                      title="Drag to reorder group"
                      className={`cursor-grab text-slate-400 ${
                        draggingGroupId === group.id ? "opacity-40" : ""
                      }`}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        setDraggingGroupId(group.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-approval-group",
                          group.id,
                        );
                      }}
                      onDragEnd={() => setDraggingGroupId(null)}
                    >
                      <GripVertical size={14} />
                    </span>
                  )}
                  <h3 className="min-w-0 flex-1 truncate text-xs font-bold text-slate-600">
                    {group.name}
                  </h3>
                  <span className="text-xs text-slate-400">
                    {group.requests.length}
                  </span>
                  {group.canManage && (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Rename ${group.name}`}
                        onClick={() => setGroupForm(group)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn hover:text-red-600"
                        aria-label={`Delete ${group.name}`}
                        disabled={deleteGroup.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete “${group.name}”? Your approvals in this group will move to Ungrouped. Other users are not affected.`,
                            )
                          )
                            deleteGroup.mutate(group.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
                <div className="min-h-24 space-y-3">
                  {group.requests.map(approvalCard)}
                  {!group.requests.length && (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-400">
                      Drop approvals here
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="approval-list-card card h-[calc(100vh-18.6rem)] md:h-[calc(100vh-11.6rem)] overflow-auto">
            <div className="">
              <div className="approval-list-header sticky -top-[0.1px] z-5 grid min-w-[900px] grid-cols-[minmax(280px,1.8fr)_180px_190px_145px_160px] items-center gap-4 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                <span>Request</span>
                <span>Requester</span>
                <span>Request type</span>
                <span>Status</span>
                <span>Created</span>
              </div>
              {groupSections.map((group) => {
                const collapsed = collapsedGroups.has(group.id);
                return (
                  <section key={group.id}>
                    <div
                      className="approval-group-header sticky top-0 md:top-10 flex min-w-[900px] items-center gap-2 border-t border-slate-200 bg-slate-100 px-4 py-2.5"
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceGroupId = event.dataTransfer.getData(
                          "application/x-approval-group",
                        );
                        if (
                          sourceGroupId &&
                          group.id !== UNGROUPED &&
                          sourceGroupId !== group.id
                        ) {
                          reorderGroup.mutate({
                            sourceId: sourceGroupId,
                            targetId: group.id,
                          });
                          setDraggingGroupId(null);
                        }
                      }}
                    >
                      {group.canManage && (
                        <span
                          draggable
                          title="Drag to reorder group"
                          className={`cursor-grab text-slate-400 ${
                            draggingGroupId === group.id ? "opacity-40" : ""
                          }`}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            setDraggingGroupId(group.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "application/x-approval-group",
                              group.id,
                            );
                          }}
                          onDragEnd={() => setDraggingGroupId(null)}
                        >
                          <GripVertical size={14} />
                        </span>
                      )}
                      <button
                        type="button"
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => toggleGroup(group.id)}
                        aria-label={
                          collapsed
                            ? `Expand ${group.name}`
                            : `Collapse ${group.name}`
                        }
                      >
                        {collapsed ? (
                          <ChevronRight size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                      <span className="font-semibold text-sm text-slate-700">
                        {group.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {group.requests.length} request
                        {group.requests.length === 1 ? "" : "s"}
                      </span>
                      {group.canManage && (
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Rename ${group.name}`}
                            onClick={() => setGroupForm(group)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn hover:text-red-600"
                            aria-label={`Delete ${group.name}`}
                            disabled={deleteGroup.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete “${group.name}”? Your approvals in this group will move to Ungrouped. Other users are not affected.`,
                                )
                              )
                                deleteGroup.mutate(group.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    {!collapsed &&
                      (group.requests.length ? (
                        group.requests.map(approvalRow)
                      ) : (
                        <div className="approval-empty-row min-w-[900px] border-t border-slate-100 px-14 py-4 text-sm text-slate-400">
                          No approvals in this group.
                        </div>
                      ))}
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {!query.isLoading &&
          !groups.isLoading &&
          !visibleRequests.length &&
          !(groups.data || []).length && (
            <div className="card mt-4">
              <Empty
                title="No approvals to show"
                text="Create a group, submit a request, or try another filter."
              />
            </div>
          )}

        {modal === "create" && <RequestForm onClose={() => setModal(null)} />}
        {modal === "configure" && (
          <RequestTypesManager onClose={() => setModal(null)} />
        )}
        {groupForm && (
          <ApprovalGroupForm
            existing={groupForm.id ? groupForm : null}
            onClose={() => setGroupForm(null)}
          />
        )}
        {item && <RequestDetail item={item} onClose={closeRequest} />}
      </div>
    </>
  );
}
