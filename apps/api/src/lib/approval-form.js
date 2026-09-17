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
          "checkbox",
        ]),
        label: z.string().trim().min(1).max(120),
        required: z.boolean().default(false),
        options: z.array(z.string().min(1).max(120)).min(1).max(50).optional(),
      })
      .strict(),
  )
  .refine(
    (fields) =>
      Object.keys(fields).length <= 40 &&
      Object.values(fields).every(
        (f) => f.type !== "select" || f.options?.length,
      ),
    "Use at most 40 fields and provide options for select fields",
  );

export function validateForm(schema, data, { draft = false } = {}) {
  const errors = [];
  for (const key of Object.keys(data))
    if (!Object.hasOwn(schema, key)) errors.push(`Unknown field: ${key}`);
  for (const [key, field] of Object.entries(schema)) {
    const value = data[key];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim());
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
        valid = typeof value === "string" && field.options.includes(value);
        break;
      default:
        valid =
          typeof value === "string" &&
          value.length <= (field.type === "textarea" ? 10000 : 1000);
    }
    if (!valid) errors.push(`${field.label} has an invalid value`);
  }
  if (errors.length)
    throw new HttpError(400, "APPROVAL_FORM_INVALID", errors.join("; "));
}
