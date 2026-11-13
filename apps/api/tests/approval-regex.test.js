import test from "node:test";
import assert from "node:assert/strict";
import { formSchema, validateForm } from "../src/lib/approval-form.js";

const schema = {
  mobile: {
    type: "text", label: "Mobile", required: true,
    validationRegex: String.raw`^\+9955\d{8}$`,
    validationMessage: "Enter a Georgian mobile number beginning with +9955",
  },
  id: { type: "text", label: "Personal ID", required: false, validationRegex: String.raw`^\d{11}$` },
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

test("multi select accepts one or several configured options as an array", () => {
  const schema = formSchema.parse({
    equipment: {
      type: "multi_select",
      label: "Required Equipment",
      options: ["Laptop", "Monitor", "Mouse"],
      required: true,
    },
  });
  assert.doesNotThrow(() => validateForm(schema, { equipment: ["Laptop"] }));
  assert.doesNotThrow(() => validateForm(schema, { equipment: ["Laptop", "Mouse"] }));
  assert.throws(() => validateForm(schema, { equipment: [] }), /required/);
  assert.throws(() => validateForm(schema, {}), /required/);
  assert.throws(() => validateForm(schema, { equipment: "Laptop" }), /invalid value/);
  assert.throws(() => validateForm(schema, { equipment: ["Laptop", "Laptop"] }), /invalid value/);
  assert.throws(() => validateForm(schema, { equipment: ["Camera"] }), /invalid value/);
  assert.throws(() => validateForm(schema, { equipment: ["Laptop", 42] }), /invalid value/);
});

test("optional multi select accepts missing or empty choices but rejects invalid selections", () => {
  const schema = formSchema.parse({
    equipment: {
      type: "multi_select", label: "Optional equipment",
      options: ["Laptop", "Monitor"], required: false,
    },
  });
  assert.doesNotThrow(() => validateForm(schema, {}));
  assert.doesNotThrow(() => validateForm(schema, { equipment: [] }));
  assert.doesNotThrow(() => validateForm(schema, { equipment: ["Monitor"] }));
  assert.throws(() => validateForm(schema, { equipment: ["Unknown"] }), /invalid value/);
});

test("multi select requires unique configured options and validates regex for every selected entry", () => {
  assert.throws(() => formSchema.parse({
    equipment: { type: "multi_select", label: "Equipment", options: ["Laptop", "Laptop"] },
  }));
  assert.throws(() => formSchema.parse({
    equipment: { type: "multi_select", label: "Equipment" },
  }));
  const schema = formSchema.parse({
    code: {
      type: "multi_select", label: "Code", options: ["A1", "B2", "WRONG"],
      validationRegex: "^[A-Z][0-9]$",
    },
  });
  assert.doesNotThrow(() => validateForm(schema, { code: ["A1", "B2"] }));
  assert.throws(() => validateForm(schema, { code: ["A1", "WRONG"] }), /required format/);
});

test("legacy single Select still accepts a string and not an array", () => {
  const schema = formSchema.parse({
    one: { type: "select", label: "Choose one", required: true, options: ["A", "B"] },
  });
  assert.doesNotThrow(() => validateForm(schema, { one: "A" }));
  assert.throws(() => validateForm(schema, { one: ["A"] }), /invalid value/);
});
