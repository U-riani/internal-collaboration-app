import { HttpError } from "./http-error.js";

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      result.error.issues,
    );
  }
  return result.data;
}
