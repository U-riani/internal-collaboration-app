import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";
import { audit } from "../src/lib/audit.js";

test("audit events expose searchable, paginated, permission-protected history", async () => {
  const h = await harness();
  try {
    const { admin, employee } = h.users;
    const created = await h.call(employee, "POST", "/conversations", {
      type: "GROUP",
      name: "Audit testing team",
      memberIds: [admin.user.id],
    });
    assert.equal(created.statusCode, 201, created.body);
    const groupId = created.json().data.id;
    const denied = await h.call(employee, "GET", "/audit/events");
    assert.equal(denied.statusCode, 403);

    const history = await h.call(admin, "GET", "/audit/events?module=MESSAGES&q=GROUP_CREATED&limit=5");
    assert.equal(history.statusCode, 200, history.body);
    const item = history.json().data.find((event) => event.entityId === groupId);
    assert.equal(item?.actionType, "GROUP_CREATED");
    assert.equal(item?.outcome, "SUCCESS");
    assert.equal(item?.actor?.displayName, employee.user.displayName);
    assert.ok(item?.requestId);
    assert.equal(history.json().meta.limit, 5);

    const summary = await h.call(admin, "GET", "/audit/summary");
    assert.equal(summary.statusCode, 200, summary.body);
    assert.ok(summary.json().data.totalEvents > 0);
    assert.ok(summary.json().data.activeUsers >= 2);

    const security = await h.call(admin, "GET", "/audit/events?category=security");
    assert.equal(security.statusCode, 200, security.body);
    assert.ok(security.json().data.every((entry) =>
      /^(AUTH_|ROLE_|USER_PASSWORD_)/.test(entry.actionType) || entry.outcome === "DENIED"));
  } finally {
    await h.close();
  }
});

test("notification priority is stored as application state with an audit trail", async () => {
  const h = await harness();
  try {
    const { admin, employee } = h.users;
    const created = await h.prisma.notification.create({
      data: { userId: employee.user.id, type: "SYSTEM", title: "Priority", body: "Test" },
    });
    const updated = await h.call(employee, "PATCH", "/notifications/" + created.id + "/priority", { priority: "URGENT" });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().data.priority, "URGENT");

    const current = await h.prisma.notification.findUnique({ where: { id: created.id } });
    assert.equal(current.priority, "URGENT");
    const log = await h.prisma.auditLog.findFirst({
      where: { entityType: "NOTIFICATION", entityId: created.id, actionType: "NOTIFICATION_PRIORITY_SET" },
    });
    assert.deepEqual(log.afterData, { priority: "URGENT" });
    const listed = await h.call(employee, "GET", "/notifications");
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal(listed.json().data.find((item) => item.id === created.id).priority, "URGENT");

    const diagnosticDenied = await h.call(employee, "GET", "/audit/diagnostics");
    assert.equal(diagnosticDenied.statusCode, 403);
    assert.equal((await h.call(admin, "GET", "/audit/diagnostics")).statusCode, 200);
  } finally {
    await h.close();
  }
});

test("audit writer removes sensitive fields from snapshots and metadata", async () => {
  const h = await harness();
  try {
    const request = {
      authUser: { id: h.users.admin.user.id },
      id: "audit-redaction-test",
      ip: "192.0.2.55",
      headers: { "user-agent": "Test Client" },
      raw: { url: "/api/v1/users" },
    };
    const created = await audit(h.app, request, {
      actionType: "USER_UPDATED",
      entityType: "USER",
      entityId: h.users.admin.user.id,
      beforeData: { displayName: "Old Name", passwordHash: "secret-hash", nested: { accessToken: "top-secret" } },
      afterData: { displayName: "New Name", password: "private-password" },
      metadata: { authorization: "Bearer secret", safe: "retained" },
    });
    assert.deepEqual(created.beforeData, { displayName: "Old Name", nested: {} });
    assert.deepEqual(created.afterData, { displayName: "New Name" });
    assert.deepEqual(created.metadata, { safe: "retained" });
    assert.equal(created.requestId, "audit-redaction-test");
  } finally {
    await h.close();
  }
});

test("denied access creates a correlated diagnostic incident without exposing secrets", async () => {
  const h = await harness();
  try {
    const response = await h.call(h.users.employee, "GET", "/audit/events");
    assert.equal(response.statusCode, 403, response.body);
    const requestId = response.headers["x-request-id"];
    let incident = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      incident = await h.prisma.diagnosticEvent.findFirst({ where: { requestId } });
      if (incident) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.ok(incident, "diagnostic record should be correlated by request ID");
    assert.equal(incident.eventType, "PERMISSION_DENIED");
    assert.equal(incident.httpStatus, 403);
    assert.equal(incident.severity, "WARNING");
    assert.ok(!JSON.stringify(incident).includes(h.users.employee.accessToken));

    const deniedLogin = await h.app.inject({
      method: "POST", url: "/api/v1/auth/login",
      payload: { email: "employee@example.com", password: "WrongPassword!" },
    });
    assert.equal(deniedLogin.statusCode, 401);
    const event = await h.prisma.auditLog.findFirst({
      where: { actionType: "AUTH_LOGIN_FAILED", requestId: deniedLogin.headers["x-request-id"] },
    });
    assert.equal(event?.outcome, "DENIED");
    assert.ok(!JSON.stringify(event).includes("WrongPassword!"));
  } finally {
    await h.close();
  }
});
