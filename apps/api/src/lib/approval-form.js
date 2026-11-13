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
          "checkbox",
        ]),
        label: z.string().trim().min(1).max(120),
        required: z.boolean().default(false),
        validationRegex: z.string().min(1).max(256).optional(),
        validationMessage: z.string().trim().min(1).max(250).optional(),
        options: z.array(z.string().min(1).max(120)).min(1).max(50).optional(),
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
      if (!field.validationRegex) continue;
      if (field.type === "checkbox") {
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
      (field.type === "multi_select" && Array.isArray(value) && value.length === 0);
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
