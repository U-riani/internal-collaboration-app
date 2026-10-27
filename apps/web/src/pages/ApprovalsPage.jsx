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
  X,
  CheckCircle2,
  CalendarDays,
  Ban,
} from "lucide-react";
import { api, uploadFile } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import FilterMultiSelect from "../components/FilterMultiSelect.jsx";
import {
  Modal,
  Field,
  ErrorBox,
  Badge,
  Empty,
  Loading,
  Attachments,
  Avatar,
  prettyDate,
} from "../components/UI.jsx";
import "./tasks-page.css";
import "./approvals-page.css";

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

function ApprovalStepProgress({ steps }) {
  if (!steps?.length) return null;

  const orderedSteps = [...steps].sort(
    (left, right) => (left.stepNumber || 0) - (right.stepNumber || 0),
  );
  const approvedCount = orderedSteps.filter(
    (step) => step.status === "APPROVED",
  ).length;
  const progressLabel = `${approvedCount}/${orderedSteps.length} approval steps completed`;

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1"
      aria-label={progressLabel}
      title={progressLabel}
    >
      {orderedSteps.map((step) => (
        <span
          key={step.id || step.stepNumber}
          className={`h-2.5 w-2.5 rounded-full ${
            step.status === "APPROVED" ? "bg-emerald-500" : "bg-slate-200"
          }`}
        />
      ))}
      <span className="ml-1 text-[10px] font-medium text-slate-400">
        {approvedCount}/{orderedSteps.length}
      </span>
    </div>
  );
}

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
      title={
        <span className="approval-config-heading">
          <span className="approval-config-heading-icon" aria-hidden="true">
            <FileCheck2 size={20} />
          </span>
          <span className="approval-config-heading-copy">
            <span className="approval-config-heading-title">
              {existing ? `Edit ${existing.name}` : "New approval type"}
            </span>
            <span className="approval-config-heading-subtitle">
              Configure intake form fields and hierarchical approval chain routing
            </span>
          </span>
        </span>
      }
      wide
      onClose={onClose}
    >
      <form
        className="task-form approval-config-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!save.isPending) save.mutate();
        }}
      >
        <div className="task-form-scroll approval-config-scroll">
          {existing && (
            <div className="approval-config-version">
              <strong>Version {existing.version}</strong>
              {" · "}
              {usedCount} request{usedCount === 1 ? "" : "s"} created from this
              type. Saving configuration changes creates version{" "}
              {existing.version + 1}; existing requests keep their saved workflow.
            </div>
          )}

          <div className="task-form-row approval-config-main-fields grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              required
              placeholder="e.g. Travel & Expense Claim"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="approval-config-code-field">
              <Field label="Code (letters, numbers, underscores)">
                <input
                  className="input"
                  placeholder="e.g. EXPENSE_APPROVAL_V2"
                  required
                  disabled={Boolean(existing && usedCount > 0)}
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                />
              </Field>
              {existing && usedCount > 0 && (
                <p className="approval-config-help">
                  The code is locked because this request type is already in use.
                </p>
              )}
            </div>
          </div>

          <Field label="Description">
            <textarea
              className="input task-form-description approval-config-description"
              placeholder="Describe when this approval type should be requested and any policy constraints..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <section className="approval-config-section" aria-label="Request form">
            <div className="approval-config-section-heading">
              <h3>Request form</h3>
              <span className="approval-config-section-hint">Define intake inputs</span>
            </div>
            <div className="approval-config-items">
              {fields.map((field, index) => (
                <div className="approval-config-field-card" key={index}>
                  <div className="approval-config-field-stack">
                    <input
                      className="input"
                      aria-label={`Field ${index + 1} key`}
                      title="Technical field key"
                      placeholder="Field key"
                      required
                      pattern="[A-Za-z][A-Za-z0-9_]*"
                      value={field.key}
                      onChange={(event) =>
                        setFields(
                          fields.map((current, i) =>
                            index === i ? { ...current, key: event.target.value } : current,
                          ),
                        )
                      }
                    />
                    <input
                      className="input"
                      aria-label={`Field ${index + 1} label`}
                      placeholder="Field label"
                      required
                      value={field.label}
                      onChange={(event) =>
                        setFields(
                          fields.map((current, i) =>
                            index === i ? { ...current, label: event.target.value } : current,
                          ),
                        )
                      }
                    />
                    <select
                      className="input app-modern-select"
                      aria-label={`Field ${index + 1} type`}
                      value={field.type}
                      onChange={(event) =>
                        setFields(
                          fields.map((current, i) =>
                            index === i
                              ? {
                                  ...current,
                                  type: event.target.value,
                                  ...(event.target.value === "select"
                                    ? {
                                        options: current.options?.length
                                          ? current.options
                                          : ["Option 1"],
                                      }
                                    : { options: undefined }),
                                }
                              : current,
                          ),
                        )
                      }
                    >
                      {["text", "textarea", "number", "date", "select", "checkbox"].map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="approval-config-field-actions">
                    <label className="task-filter-choice approval-config-required">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          setFields(
                            fields.map((current, i) =>
                              index === i ? { ...current, required: event.target.checked } : current,
                            ),
                          )
                        }
                      />
                      <span>Required</span>
                    </label>
                    <button
                      type="button"
                      className="icon-btn approval-config-remove"
                      aria-label={`Remove field ${index + 1}`}
                      title="Remove field"
                      onClick={() => setFields(fields.filter((_, i) => i !== index))}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {field.type === "select" && (
                    <div className="approval-config-options">
                      <div className="approval-config-options-heading">
                        <span>Options</span>
                        <button
                          type="button"
                          className="btn-secondary approval-config-secondary"
                          disabled={(field.options || []).length >= 50}
                          onClick={() =>
                            setFields(
                              fields.map((current, i) =>
                                index === i
                                  ? { ...current, options: [...(current.options || []), ""] }
                                  : current,
                              ),
                            )
                          }
                        >
                          <Plus size={14} />
                          Add option
                        </button>
                      </div>
                      <div className="approval-config-option-list">
                        {(field.options || ["Option 1"]).map((option, optionIndex) => (
                          <div className="approval-config-option-row" key={optionIndex}>
                            <input
                              className="input"
                              aria-label={`Field ${index + 1} option ${optionIndex + 1}`}
                              placeholder={`Option ${optionIndex + 1}`}
                              required
                              value={option}
                              onChange={(event) =>
                                setFields(
                                  fields.map((current, i) =>
                                    index === i
                                      ? {
                                          ...current,
                                          options: (current.options || []).map((value, j) =>
                                            j === optionIndex ? event.target.value : value,
                                          ),
                                        }
                                      : current,
                                  ),
                                )
                              }
                            />
                            {(field.options || []).length > 1 && (
                              <button
                                type="button"
                                className="icon-btn approval-config-remove"
                                aria-label={`Remove field ${index + 1} option ${optionIndex + 1}`}
                                onClick={() =>
                                  setFields(
                                    fields.map((current, i) =>
                                      index === i
                                        ? {
                                            ...current,
                                            options: (current.options || []).filter((_, j) => j !== optionIndex),
                                          }
                                        : current,
                                    ),
                                  )
                                }
                              >
                                <X size={15} />
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
              className="btn-secondary approval-config-secondary approval-config-add"
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
              <Plus size={14} />
              Add field
            </button>
          </section>

          <section className="approval-config-section" aria-label="Approval steps">
            <div className="approval-config-section-heading">
              <h3>Approval steps, in order</h3>
              <span className="approval-config-section-hint">Sequential step triggers</span>
            </div>
            <div className="approval-config-items">
              {steps.map((step, index) => (
                <div className="approval-config-step-row" key={index}>
                  <span className="approval-config-step-number">{index + 1}</span>
                  <input
                    className="input approval-config-step-name"
                    aria-label={`Step ${index + 1} name`}
                    placeholder="Step name"
                    required
                    value={step.name}
                    onChange={(event) =>
                      setSteps(
                        steps.map((current, i) =>
                          index === i ? { ...current, name: event.target.value } : current,
                        ),
                      )
                    }
                  />
                  <select
                    className="input app-modern-select approval-config-step-approver"
                    aria-label={`Step ${index + 1} approver`}
                    value={step.approverRule === "USER" ? step.approverValue : step.approverRule}
                    onChange={(event) =>
                      setSteps(
                        steps.map((current, i) =>
                          index === i
                            ? {
                                ...current,
                                approverRule: [
                                  "REQUESTER_MANAGER",
                                  "DEPARTMENT_MANAGER",
                                ].includes(event.target.value)
                                  ? event.target.value
                                  : "USER",
                                approverValue: [
                                  "REQUESTER_MANAGER",
                                  "DEPARTMENT_MANAGER",
                                ].includes(event.target.value)
                                  ? ""
                                  : event.target.value,
                              }
                            : current,
                        ),
                      )
                    }
                  >
                    <option value="REQUESTER_MANAGER">Requester’s manager</option>
                    <option value="DEPARTMENT_MANAGER">Department manager</option>
                    {users.data
                      ?.filter((person) => person.status === "ACTIVE")
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName}
                        </option>
                      ))}
                  </select>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn approval-config-remove approval-config-step-remove"
                      aria-label={`Remove step ${index + 1}`}
                      title="Remove step"
                      onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary approval-config-secondary approval-config-add"
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
              <Plus size={14} />
              Add step
            </button>
          </section>
          <ErrorBox error={save.error} />
        </div>
        <div className="task-form-footer approval-config-footer">
          <span className="task-form-footer-note">
            {existing
              ? "Existing requests keep their saved workflow."
              : "Define your fields and approval steps before saving."}
          </span>
          <button className="btn-primary" type="submit" disabled={save.isPending}>
            {save.isPending
              ? "Saving…"
              : existing
                ? "Save new version"
                : "Create approval type"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export { Configure as ApprovalTypeConfigure };

function ApprovalDateField({ label, value, onChange }) {
  const displayValue = value
    ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`
    : "mm/dd/yyyy";

  return (
    <label className="approval-date-field">
      <span className="approval-date-label">{label}</span>
      <span className="approval-date-control">
        <span
          className={`approval-date-preview ${value ? "approval-date-preview--filled" : ""}`}
          aria-hidden="true"
        >
          {displayValue}
        </span>
        <CalendarDays size={17} className="approval-date-icon" aria-hidden="true" />
        <input
          type="date"
          className="approval-date-native"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            // The native date picker remains the only source of selected dates.
            // The visual overlay hides Chrome's separately highlighted mm/dd/yyyy segments.
            if (typeof event.currentTarget.showPicker === "function") {
              try {
                event.currentTarget.showPicker();
              } catch {
                // Other browsers can open their own native picker normally.
              }
            }
          }}
        />
      </span>
    </label>
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
    <Modal
      title={
        <span className="approval-types-modal-title">
          <span className="approval-types-title-icon" aria-hidden="true">
            <FileCheck2 size={20} />
          </span>
          <span>Request types</span>
        </span>
      }
      wide
      onClose={onClose}
    >
      <div className="approval-types-manager">
        <div className="approval-types-toolbar">
          <label className="task-search-bar approval-types-search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              aria-label="Search request types"
              placeholder="Search request types..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="approval-types-status-control task-sort-control">
            <select
              className="input app-modern-select task-sort-select"
              aria-label="Request type status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="DRAFT">Draft</option>
            </select>
          </label>
          <button
            type="button"
            className="btn-primary approval-types-create task-style-primary"
            onClick={() => setEditing("new")}
          >
            <Plus size={16} />
            New type
          </button>
        </div>

        <ErrorBox error={query.error || changeStatus.error} />
        {query.isLoading ? (
          <Loading />
        ) : items.length ? (
          <div className="approval-types-list">
            {items.map((item) => {
              const requestCount = item._count?.requests || 0;
              const isActive = item.status === "ACTIVE";
              return (
                <div key={item.id} className="approval-type-row">
                  <span
                    className={`approval-type-row-icon approval-type-row-icon--${item.status.toLowerCase()}`}
                    aria-hidden="true"
                  >
                    <FileCheck2 size={17} />
                  </span>
                  <div className="approval-type-info">
                    <div className="approval-type-name-line">
                      <h3 className="approval-type-name" title={item.name}>
                        {item.name}
                      </h3>
                      <Badge value={item.status} />
                    </div>
                    <p className="approval-type-meta">
                      <span>{item.code}</span>
                      <span aria-hidden="true">·</span>
                      <span>v{item.version}</span>
                      <span aria-hidden="true">·</span>
                      <span>{requestCount} request{requestCount === 1 ? "" : "s"}</span>
                      {item.createdBy?.displayName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Created by {item.createdBy.displayName}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="approval-type-actions">
                    <button
                      type="button"
                      className="btn-secondary approval-type-edit task-style-secondary"
                      onClick={() => setEditing(item)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary approval-type-status-action task-style-secondary ${isActive ? "approval-type-deactivate" : "approval-type-activate"}`}
                      disabled={changeStatus.isPending}
                      onClick={() =>
                        changeStatus.mutate({
                          id: item.id,
                          status: isActive ? "INACTIVE" : "ACTIVE",
                        })
                      }
                    >
                      {isActive ? <Ban size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                      {isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
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
      </div>
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
        className="approval-group-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && !save.isPending) save.mutate();
        }}
      >
        <Field label="Group name">
          <input
            className="input approval-group-name-input"
            type="text"
            required
            minLength={1}
            maxLength={120}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <ErrorBox error={save.error} />
        <div className="form-actions approval-group-form-actions">
          <button type="submit" className="btn-primary" disabled={save.isPending || !name.trim()}>
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
  const selectedGroupName =
    (groups.data || []).find((group) => group.id === item.personalLayout?.groupId)?.name ||
    item.personalLayout?.group?.name ||
    "Ungrouped";

  const canComment =
    !canAct &&
    (mine ||
      user.roles.includes("SYSTEM_ADMIN") ||
      item.steps.some((step) => step.approverId === user.id));

  return (
    <Modal title={item.title} onClose={onClose} wide>
      <div className="task-detail approval-detail">
        <div className="task-detail-intro approval-detail-intro">
          <div className="approval-detail-request-meta">
            <span className="approval-detail-request-icon" aria-hidden="true">
              <FileCheck2 size={18} />
            </span>
            <div className="approval-detail-request-copy">
              <span className="approval-detail-requester">{item.requester.displayName}</span>
              <span className="approval-detail-meta-separator" aria-hidden="true">·</span>
              <span>{item.workflowSnapshot?.type?.name || item.approvalType.name}</span>
              <span className="approval-detail-version">
                v{item.workflowSnapshot?.type?.version || item.approvalTypeVersion}
              </span>
              <span className="approval-detail-meta-separator" aria-hidden="true">·</span>
              <span>{prettyDate(item.createdAt)}</span>
            </div>
          </div>
          <Badge value={item.status} />
        </div>

        <div className="approval-detail-group">
          <p className="task-detail-meta-label">My group</p>
          <div className="task-detail-select-wrap" title={selectedGroupName}>
            <select
              className="input app-modern-select task-detail-select task-detail-group-select"
              aria-label="My approval group"
              title={selectedGroupName}
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
            <span className="task-detail-select-preview" aria-hidden="true">
              <span className="task-detail-select-preview-label">
                {selectedGroupName}
              </span>
              <ChevronDown size={15} />
            </span>
          </div>
        </div>

        {Object.entries(schema || {}).length > 0 && (
          <section className="task-detail-section approval-detail-fields" aria-label="Request fields">
            <div className="approval-detail-fields-grid">
              {Object.entries(schema).map(([key, field]) => (
                <div className="approval-detail-field" key={key}>
                  <p className="approval-detail-field-label">{field.label}</p>
                  <p className="approval-detail-field-value">
                    {typeof item.data[key] === "boolean"
                      ? item.data[key] ? "Yes" : "No"
                      : String(item.data[key] ?? "—")}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="approval-detail-attachments">
          <Attachments items={item.attachments} />
        </div>

        <section className="approval-detail-progress" aria-label="Approval progress">
          <h3 className="task-detail-discussion-title approval-detail-section-title">
            Approval progress
          </h3>
          <div className="approval-detail-timeline">
            {item.steps.map((step) => (
              <div className="approval-detail-timeline-item" key={step.id}>
                <span
                  className={`approval-detail-step-indicator approval-detail-step-indicator--${step.status.toLowerCase()}`}
                  aria-hidden="true"
                >
                  {step.status === "APPROVED" ? <Check size={15} /> : step.stepNumber}
                </span>
                <div className="approval-detail-step-info">
                  <div className="approval-detail-step-top">
                    <span className="approval-detail-step-name">{step.stepName}</span>
                    <Badge value={step.status} />
                  </div>
                  <p className="approval-detail-step-approver">{step.approver.displayName}</p>
                  {step.comment && (
                    <p className="approval-detail-step-comment">{step.comment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {mine && ["DRAFT", "CHANGES_REQUESTED"].includes(item.status) && (
          <div className="approval-detail-edit-actions">
            <button
              type="button"
              className="btn-secondary task-detail-edit"
              onClick={() => setEdit(true)}
            >
              <Pencil size={15} />
              Edit and submit
            </button>
          </div>
        )}

        {canAct && (
          <section className="task-detail-section approval-detail-review" aria-label="Approval decision">
            <div className="task-detail-section-header">
              <h3>Your review is needed</h3>
              <p>Select a decision and include a reason when required.</p>
            </div>
            <div className="approval-detail-review-body">
              <label className="approval-detail-review-field">
                <span>Decision</span>
                <select
                  className="input app-modern-select task-detail-select"
                  aria-label="Decision"
                  value={decision}
                  onChange={(event) => setDecision(event.target.value)}
                >
                  <option value="APPROVE">Approve</option>
                  <option value="REQUEST_CHANGES">Request changes</option>
                  <option value="REJECT">Reject</option>
                </select>
              </label>
              <label className="approval-detail-review-field">
                <span>Comment</span>
                <textarea
                  className="input task-detail-comment-input"
                  aria-label="Review comment"
                  placeholder={
                    decision === "APPROVE"
                      ? "Comment (optional)"
                      : "Explain your decision (required)"
                  }
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-primary task-detail-comment-submit approval-detail-confirm"
                disabled={save.isPending || (decision !== "APPROVE" && !comment.trim())}
                onClick={() => save.mutate({})}
              >
                <Check size={15} />
                Confirm decision
              </button>
            </div>
          </section>
        )}

        <ErrorBox error={save.error || updateLayout.error || groups.error} />

        <section className="approval-detail-discussion" aria-label="Comments">
          <h3 className="task-detail-discussion-title approval-detail-section-title">
            Comments{item.comments.length ? ` · ${item.comments.length}` : ""}
          </h3>
          {item.comments.length > 0 && (
            <div className="task-detail-comments approval-detail-comments">
              {item.comments.map((entry) => (
                <div className="task-detail-comment approval-detail-comment" key={entry.id}>
                  <Avatar small name={entry.author.displayName} />
                  <div className="approval-detail-comment-copy">
                    <div className="approval-detail-comment-byline">
                      <span>{entry.author.displayName}</span>
                      {entry.createdAt && (
                        <span className="approval-detail-comment-date">
                          {prettyDate(entry.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="approval-detail-comment-body">{entry.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {canComment && (
            <form
              className="approval-detail-comment-form"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate({ commentOnly: true });
              }}
            >
              <input
                className="input approval-detail-comment-input"
                aria-label="Approval comment"
                required
                placeholder="Add a comment..."
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <button
                type="submit"
                className="btn-primary task-detail-comment-submit approval-detail-send"
                disabled={save.isPending}
              >
                Send
              </button>
            </form>
          )}
        </section>

        {item.rounds?.length > 0 && (
          <details className="task-detail-history approval-detail-history">
            <summary className="cursor-pointer font-semibold">
              Earlier review rounds ({item.rounds.length})
            </summary>
            <div className="approval-detail-rounds">
              {item.rounds.map((round, index) => (
                <div key={index} className="approval-detail-round">
                  <strong>Round {index + 1}</strong>
                  {round.steps.map((step) => (
                    <p key={step.id}>
                      {step.stepName}: {step.status.toLowerCase()}{" "}
                      {step.comment && `— ${step.comment}`}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}

        {mine && !["APPROVED", "REJECTED", "CANCELLED"].includes(item.status) && (
          <button
            type="button"
            className="approval-detail-cancel"
            disabled={save.isPending}
            onClick={() => save.mutate({ action: "CANCEL" })}
          >
            <X size={15} />
            Cancel request
          </button>
        )}
        {edit && <RequestForm existing={item} onClose={() => setEdit(false)} />}
      </div>
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
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
    refetchInterval: 60000,
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
  const unreadApprovalIds = useMemo(
    () =>
      new Set(
        (notifications.data?.data || [])
          .filter(
            (notification) =>
              !notification.isRead &&
              notification.relatedEntityType === "APPROVAL_REQUEST" &&
              notification.relatedEntityId,
          )
          .map((notification) => notification.relatedEntityId),
      ),
    [notifications.data],
  );
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
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
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
    const hasUnread = unreadApprovalIds.has(request.id);
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
        className={`card task-board-card approval-board-card relative w-full p-4 text-left transition ${
          draggingId === request.id ? "opacity-50" : ""
        }`}
      >
        {hasUnread && (
          <span
            aria-label="Unread approval notification"
            title="New notification"
            className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white"
          />
        )}
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
    const hasUnread = unreadApprovalIds.has(request.id);
    return (
      <button
        className="task-list-row approval-list-row relative grid min-w-[900px] w-full grid-cols-[minmax(280px,1.8fr)_180px_190px_145px_160px] items-center gap-4 border-t border-slate-100 px-5 py-3.5 text-left transition hover:bg-slate-50"
        key={request.id}
        onClick={() => setSelectedId(request.id)}
      >
        {hasUnread && (
          <span
            aria-label="Unread approval notification"
            title="New notification"
            className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500"
          />
        )}
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
            <ApprovalStepProgress steps={request.steps} />
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


  return (
    <>
      <div className="tasks-page approvals-page">
      <PageHeader
        title="Approvals"
        description="Review requests, track decisions, and keep approvals moving."
        action={
          <div className="task-header-actions flex flex-wrap items-center gap-2">
            <button
              className="btn-secondary"
              onClick={() => setGroupForm({})}
            >
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
        <div className="approval-toolbar toolbar task-toolbar task-toolbar--refresh">
          <div className="approval-toolbar-primary min-w-0 flex-1">
            <div className="tabs task-quick-tabs" aria-label="Approval quick filters">
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
                  aria-pressed={involvement === value}
                  onClick={() => setInvolvement(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="approval-toolbar-secondary task-toolbar-actions ml-auto flex items-center gap-2">
            <label className="task-search-bar">
              <Search size={16} aria-hidden="true" />
              <input
                aria-label="Search approvals"
                className="input"
                placeholder="Search approvals..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <div className="relative">
              <button
                type="button"
                className={`btn-secondary task-filter-trigger relative ${
                  advancedFilterCount ? "task-filter-trigger--active" : ""
                }`}
                onClick={() => setFiltersOpen((current) => !current)}
                aria-expanded={filtersOpen}
              >
                <ListFilter size={16} />
                <span className="hidden xl:inline">Filter</span>
                {advancedFilterCount > 0 && (
                  <span className="task-filter-count-badge">
                    {advancedFilterCount}
                  </span>
                )}
              </button>

              {filtersOpen && (
                <div className="approval-filter-panel task-filter-panel fixed left-1/2 top-2 z-50 w-[760px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white px-5 shadow-xl max-h-[calc(100dvh-1rem)]">
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
                      <X size={16} aria-hidden="true" />
                      <span className="sr-only">Close filters</span>
                    </button>
                  </div>

                  <div className="task-filter-utilities">
                    <span className="task-filter-count">
                      {advancedFilterCount > 0
                        ? `${advancedFilterCount} active filter${advancedFilterCount === 1 ? "" : "s"}`
                        : "Refine the approval list"}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary task-filter-clear"
                      onClick={clearAdvancedFilters}
                      disabled={advancedFilterCount === 0}
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="task-filter-fields grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Status
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {approvalStatuses.map((status) => (
                          <label
                            key={status}
                            className="task-filter-choice flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs text-slate-600"
                          >
                            <input
                              type="checkbox"
                              className="task-filter-checkbox"
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

                    <FilterMultiSelect
                      label="Request type"
                      kind="group"
                      options={typeOptions.map((type) => ({ value: type.id, label: type.name }))}
                      values={advancedFilters.typeIds}
                      onToggle={(value) => toggleAdvancedValue("typeIds", value)}
                    />

                    <FilterMultiSelect
                      label="Requester"
                      options={requesterOptions.map((requester) => ({
                        value: requester.id,
                        label: requester.displayName,
                      }))}
                      values={advancedFilters.requesterIds}
                      onToggle={(value) => toggleAdvancedValue("requesterIds", value)}
                    />

                    <div className="md:col-span-2">
                      <FilterMultiSelect
                        label="Personal group"
                        kind="group"
                        options={[
                          { value: UNGROUPED, label: "Ungrouped" },
                          ...(groups.data || []).map((group) => ({
                            value: group.id,
                            label: group.name,
                          })),
                        ]}
                        values={advancedFilters.groupIds}
                        onToggle={(value) => toggleAdvancedValue("groupIds", value)}
                      />
                    </div>

                    <div className="approval-filter-dates grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2">
                      <ApprovalDateField
                        label="Created from"
                        value={advancedFilters.createdFrom}
                        onChange={(value) => setAdvancedValue("createdFrom", value)}
                      />
                      <ApprovalDateField
                        label="Created to"
                        value={advancedFilters.createdTo}
                        onChange={(value) => setAdvancedValue("createdTo", value)}
                      />
                    </div>
                  </div>

                  <div className="task-filter-footer sticky bottom-0 flex items-center justify-between border-t border-slate-100 bg-white">
                    <span className="hidden text-xs text-slate-400 sm:inline">
                      Select multiple values with checkboxes.
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

            <label className="task-sort-control">
              <ArrowUpDown size={15} className="text-slate-400" />
              <select
                aria-label="Sort approvals"
                className="input app-modern-select task-sort-select"
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
              className="task-view-toggle"
              role="group"
              aria-label="Approval view"
            >
              <button
                type="button"
                className={`task-view-button ${!board ? "task-view-button--active" : ""}`}
                aria-label="List view"
                aria-pressed={!board}
                onClick={() => setBoard(false)}
              >
                <List size={15} />
                <span className="hidden xl:inline">List</span>
              </button>
              <button
                type="button"
                className={`task-view-button ${board ? "task-view-button--active" : ""}`}
                aria-label="Board view"
                aria-pressed={board}
                onClick={() => setBoard(true)}
              >
                <Columns3 size={15} />
                <span className="hidden xl:inline">Board</span>
              </button>
            </div>
          </div>
        </div>

        {/* {activeFilterCount > 0 && (
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
        )} */}

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
          <div className="approval-board flex gap-4 overflow-x-auto pb-4">
            {groupSections.map((group) => (
              <section
                key={group.id}
                className="task-board-column approval-board-column w-[300px] min-w-[300px] rounded-xl p-3"
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
          <div className="task-list-card approval-list-card">
            <div className="task-groups-stack">
              {groupSections.map((group) => {
                const collapsed = collapsedGroups.has(group.id);
                return (
                  <section key={group.id} className="task-group-card approval-group-card">
                    <div
                      className="task-group-header approval-group-header flex min-w-0 items-center gap-2 px-4 py-2.5"
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
                      <span className="task-group-count">
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
                    {!collapsed && (
                      <div className="task-group-content">
                        {group.requests.length ? (
                          <>
                            <div className="task-list-header approval-list-header grid min-w-[900px] grid-cols-[minmax(280px,1.8fr)_180px_190px_145px_160px] items-center gap-4 px-5 py-3 text-[11px] font-bold uppercase tracking-wide">
                              <span>Request</span>
                              <span>Requester</span>
                              <span>Request type</span>
                              <span>Status</span>
                              <span>Created</span>
                            </div>
                            {group.requests.map(approvalRow)}
                          </>
                        ) : (
                          <div className="task-empty-row approval-empty-row">
                            <FileCheck2 size={16} aria-hidden="true" />
                            <span>No approvals match the selected filters in this group.</span>
                          </div>
                        )}
                      </div>
                    )}
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
      </div>
    </>
  );
}
