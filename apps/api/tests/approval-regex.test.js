import test from "node:test";
import assert from "node:assert/strict";
import { formSchema, validateForm, validateAssignedPeople } from "../src/lib/approval-form.js";

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

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
test("single assigned person saves exactly one user ID and enforces required", () => {
  const schema = formSchema.parse({
    assignee: { type: "assigned_persons", label: "Assigned person", required: true, selectionMode: "single" },
  });
  assert.doesNotThrow(() => validateForm(schema, { assignee: alice }));
  assert.throws(() => validateForm(schema, {}), /required/);
  assert.throws(() => validateForm(schema, { assignee: "" }), /required/);
  assert.throws(() => validateForm(schema, { assignee: [alice] }), /invalid value/);
  assert.throws(() => validateForm(schema, { assignee: "not a user ID" }), /invalid value/);
});
test("multiple assigned persons validates distinct IDs and optional empties", () => {
  const schema = formSchema.parse({
    assignees: { type: "assigned_persons", label: "Assignees", selectionMode: "multiple", required: false },
  });
  assert.doesNotThrow(() => validateForm(schema, { assignees: [alice, bob] }));
  assert.doesNotThrow(() => validateForm(schema, { assignees: [] }));
  assert.doesNotThrow(() => validateForm(schema, {}));
  assert.throws(() => validateForm(schema, { assignees: alice }), /invalid value/);
  assert.throws(() => validateForm(schema, { assignees: [alice, alice] }), /invalid value/);
  assert.throws(() => validateForm(schema, { assignees: ["invalid"] }), /invalid value/);
  assert.throws(() => formSchema.parse({
    assignees: { type: "assigned_persons", label: "Assignees", validationRegex: ".*" },
  }));
});
test("assigned-person IDs must resolve to active users", async () => {
  const schema = formSchema.parse({
    members: { type: "assigned_persons", label: "Members", selectionMode: "multiple", required: true },
  });
  const prisma = {
    user: {
      findMany: async ({ where }) => {
        assert.deepEqual(where.id.in, [alice, bob]);
        assert.equal(where.status, "ACTIVE");
        return [{ id: alice }];
      },
    },
  };
  await assert.rejects(() => validateAssignedPeople(prisma, schema, { members: [alice, bob] }), /active employees/);
  await assert.doesNotReject(() => validateAssignedPeople({
    user: { findMany: async () => [{ id: alice }, { id: bob }] },
  }, schema, { members: [alice, bob] }));
  await assert.doesNotReject(() => validateAssignedPeople(prisma, schema, { members: [] }));
});
test("500 Select options are supported without changing single-Select payloads", () => {
  const options = Array.from({ length: 500 }, (_, index) => "Store " + index);
  const schema = formSchema.parse({ store: { type: "select", label: "Store", options } });
  assert.doesNotThrow(() => validateForm(schema, { store: "Store 499" }));
  assert.throws(() => formSchema.parse({
    store: { type: "select", label: "Store", options: [...options, "Store 500"] },
  }));
  assert.throws(() => formSchema.parse({
    store: { type: "select", label: "Store", options: ["Store 1", "Store 1"] },
  }));
});
