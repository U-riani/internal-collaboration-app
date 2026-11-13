import { z } from "zod";
import { HttpError } from "./http-error.js";

export const formSchema = z
  .record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/),
    z
      .object({
        type: z.enum([
          "text",
          "textarea",
          "number",
          "date",
          "select",
          "multi_select",
          "assigned_persons",
          "checkbox",
        ]),
        label: z.string().trim().min(1).max(120),
        required: z.boolean().default(false),
        validationRegex: z.string().min(1).max(256).optional(),
        validationMessage: z.string().trim().min(1).max(250).optional(),
        options: z.array(z.string().min(1).max(120)).min(1).max(500).optional(),
        selectionMode: z.enum(["single", "multiple"]).optional(),
      })
      .strict(),
  )
  .refine(
    (fields) =>
      Object.keys(fields).length <= 40 &&
      Object.values(fields).every(
        (f) => !["select", "multi_select"].includes(f.type) || f.options?.length,
      ),
    "Use at most 40 fields and provide options for select fields",
  )
  .superRefine((fields, ctx) => {
    for (const [key, field] of Object.entries(fields)) {
      if (["select", "multi_select"].includes(field.type) && field.options && new Set(field.options).size !== field.options.length) {
        ctx.addIssue({ code: "custom", path: [key, "options"], message: "Multi Select options must be unique" });
      }
      if (field.type === "assigned_persons" && field.options) {
        ctx.addIssue({ code: "custom", path: [key, "options"], message: "Person fields use the employee directory, not custom options" });
      }
      if (!field.validationRegex) continue;
      if (["checkbox", "assigned_persons"].includes(field.type)) {
        ctx.addIssue({ code: "custom", path: [key, "validationRegex"], message: "Regex validation does not apply to checkboxes" });
        continue;
      }
      // Avoid patterns with nested repetition and backreferences in request handling.
      const p = field.validationRegex;
      if (/\\[1-9]/.test(p) || /\([^)]*[+*][^)]*\)[+*{]/.test(p)) {
        ctx.addIssue({ code: "custom", path: [key, "validationRegex"], message: "Unsupported potentially expensive regex pattern" });
        continue;
      }
      try { new RegExp(p); } catch {
        ctx.addIssue({ code: "custom", path: [key, "validationRegex"], message: "Invalid regular expression" });
      }
    }
  });

export function validateForm(schema, data, { draft = false } = {}) {
  const errors = [];
  for (const key of Object.keys(data))
    if (!Object.hasOwn(schema, key)) errors.push(`Unknown field: ${key}`);
  for (const [key, field] of Object.entries(schema)) {
    const value = data[key];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim()) ||
      (["multi_select", "assigned_persons"].includes(field.type) && Array.isArray(value) && value.length === 0);
    if (empty) {
      if (field.required && !draft) errors.push(`${field.label} is required`);
      continue;
    }
    let valid;
    switch (field.type) {
      case "number":
        valid = typeof value === "number" && Number.isFinite(value);
        break;
      case "checkbox":
        valid = typeof value === "boolean";
        break;
      case "date":
        valid =
          typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !Number.isNaN(Date.parse(value)) &&
          new Date(value).toISOString().slice(0, 10) === value;
        break;
      case "select":
        valid = typeof value === "string" && field.options?.includes(value);
        break;
      case "assigned_persons": {
        const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        valid = field.selectionMode === "multiple"
          ? Array.isArray(value) && value.length > 0 && value.length <= 100 &&
            value.every((id) => typeof id === "string" && idPattern.test(id)) &&
            new Set(value).size === value.length
          : typeof value === "string" && idPattern.test(value);
        break;
      }
      case "multi_select":
        valid =
          Array.isArray(value) &&
          value.length > 0 &&
          value.length <= (field.options?.length ?? 0) &&
          value.every((option) => typeof option === "string" && field.options?.includes(option)) &&
          new Set(value).size === value.length;
        break;
      default:
        valid =
          typeof value === "string" &&
          value.length <= (field.type === "textarea" ? 10000 : 1000);
    }
    if (valid && field.validationRegex) {
      try {
        const pattern = new RegExp(field.validationRegex);
        valid = Array.isArray(value)
          ? value.every((option) => pattern.test(option))
          : pattern.test(String(value));
      } catch { valid = false; }
      if (!valid) {
        errors.push(field.validationMessage || `${field.label} does not match the required format`);
        continue;
      }
    }
    if (!valid) errors.push(`${field.label} has an invalid value`);
  }
  if (errors.length)
    throw new HttpError(400, "APPROVAL_FORM_INVALID", errors.join("; "));
}

/**
 * Resolve selected people against the directory rather than trusting submitted IDs.
 * This deliberately does not create task assignments or add approval reviewers.
 * Called for draft edits and submissions; existing historical requests remain readable.
 */
export async function validateAssignedPeople(prisma, schema, data) {
  const ids = new Set();
  for (const [key, field] of Object.entries(schema)) {
    if (field.type !== "assigned_persons") continue;
    const value = data[key];
    if (typeof value === "string" && value) ids.add(value);
    else if (Array.isArray(value)) for (const id of value) ids.add(id);
  }
  if (!ids.size) return;
  const matches = await prisma.user.findMany({
    where: { id: { in: [...ids] }, status: "ACTIVE" },
    select: { id: true },
  });
  const existing = new Set(matches.map((user) => user.id));
  if ([...ids].some((id) => !existing.has(id))) {
    throw new HttpError(400, "APPROVAL_PERSON_INVALID", "Select active employees from the directory");
  }
}
