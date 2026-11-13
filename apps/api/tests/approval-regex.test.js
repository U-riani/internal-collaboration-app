import test from "node:test";
import assert from "node:assert/strict";
import { formSchema, validateForm } from "../src/lib/approval-form.js";

const schema = {
  mobile: {
    type: "text", label: "Mobile", required: true,
    validationRegex: String.raw`^\\+9955\\d{8}$`,
    validationMessage: "Enter a Georgian mobile number beginning with +9955",
  },
  id: { type: "text", label: "Personal ID", required: false, validationRegex: String.raw`^\\d{11}$` },
};
test("validates configured regex and custom error message", () => {
  const validated = formSchema.parse(schema);
  assert.doesNotThrow(() => validateForm(validated, { mobile: "+995599123456", id: "01234567890" }));
  assert.throws(() => validateForm(validated, { mobile: "599123456" }), /Georgian mobile number/);
});
test("optional fields can be empty but nonempty values must match regex", () => {
  const validated = formSchema.parse(schema);
  assert.doesNotThrow(() => validateForm(validated, { mobile: "+995599123456" }));
  assert.throws(() => validateForm(validated, { mobile: "+995599123456", id: "1234" }), /required format/);
});
test("invalid syntax and risky nested repeated groups are blocked on type creation", () => {
  assert.throws(() => formSchema.parse({ a: { type: "text", label: "A", validationRegex: "(" } }));
  assert.throws(() => formSchema.parse({ a: { type: "text", label: "A", validationRegex: "^(a+)+$" } }));
});
test("regex on checkbox is rejected and legacy fields remain valid", () => {
  assert.throws(() => formSchema.parse({ check: { type: "checkbox", label: "Check", validationRegex: "true" } }));
  assert.doesNotThrow(() => formSchema.parse({ note: { type: "textarea", label: "Note", required: false } }));
});
