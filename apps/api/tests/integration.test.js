import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";
let h;
before(async () => {
  try {
    h = await harness();
  } catch (error) {
    console.error(error);
    throw error;
  }
});
after(async () => {
  if (h) await h.close();
});
function ok(result, status = 200) {
  assert.equal(result.statusCode, status, result.body);
  return result.json().data;
}

test("private task API and events exclude unrelated employees", async () => {
  const { admin, employee } = h.users;
  const outsider = ok(
    await h.call(admin, "POST", "/users", {
      email: "outsider@example.com",
      password: "Outsider123!",
      firstName: "Other",
      lastName: "Employee",
    }),
    201,
  );
  const actor = await h.login(outsider.email, "Outsider123!");
  const task = ok(
    await h.call(employee, "POST", "/tasks", { title: "Private task" }),
    201,
  );
  assert.equal(
    (await h.call(actor, "GET", `/tasks/${task.id}`)).statusCode,
    403,
  );
  const { emitTaskEvent } = await import("../src/lib/task-events.js");
  const recorded = [];
  await emitTaskEvent(
    {
      prisma: h.prisma,
      io: {
        to: (rooms) => ({
          emit: (event, payload) => recorded.push({ rooms, event, payload }),
        }),
      },
    },
    task.id,
    "task:updated",
  );
  assert.ok(recorded[0].rooms.includes(`user:${employee.user.id}`));
  assert.ok(!recorded[0].rooms.includes(`user:${outsider.id}`));
  assert.deepEqual(Object.keys(recorded[0].payload).sort(), ["id", "taskId"]);
});

test("foreign attachments cannot grant access through tasks, chat or approvals", async () => {
  const file = ok(await h.upload(h.users.manager), 201);
  assert.equal(
    (await h.call(h.users.employee, "GET", `/files/${file.id}/download`))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await h.call(h.users.employee, "POST", "/tasks", {
        title: "Stolen attachment",
        attachmentIds: [file.id],
      })
    ).statusCode,
    403,
  );
  const conversation = ok(
    await h.call(h.users.employee, "POST", "/conversations", {
      type: "DIRECT",
      memberIds: [h.users.admin.user.id],
    }),
    201,
  );
  assert.equal(
    (
      await h.call(
        h.users.employee,
        "POST",
        `/conversations/${conversation.id}/messages`,
        { content: "Foreign file", attachmentIds: [file.id] },
      )
    ).statusCode,
    403,
  );
  const type = ok(await h.call(h.users.employee, "GET", "/approval-types"))[0];
  assert.equal(
    (
      await h.call(h.users.employee, "POST", "/approval-requests", {
        title: "Stolen attachment",
        approvalTypeId: type.id,
        data: {},
        attachmentIds: [file.id],
      })
    ).statusCode,
    403,
  );
  const own = ok(await h.upload(h.users.employee, "მოხსენება.txt"), 201);
  const msg = ok(
    await h.call(
      h.users.employee,
      "POST",
      `/conversations/${conversation.id}/messages`,
      { content: "", attachmentIds: [own.id] },
    ),
    201,
  );
  assert.equal(msg.attachments.length, 1);
  const download = await h.call(
    h.users.admin,
    "GET",
    `/files/${own.id}/download`,
  );
  assert.equal(download.statusCode, 200);
  assert.equal(download.body, "Internal report");
});

test("Drive inheritance, viewers, editors, revocation, trash and cycle prevention", async () => {
  const { employee, manager, admin } = h.users;
  const root = ok(
    await h.call(employee, "POST", "/drive", { name: "Private folder" }),
    201,
  );
  const child = ok(
    await h.call(employee, "POST", "/drive", {
      name: "Nested",
      parentId: root.id,
    }),
    201,
  );
  const upload = ok(await h.upload(employee), 201);
  const file = ok(
    await h.call(employee, "POST", "/drive", {
      name: "Report",
      parentId: child.id,
      fileId: upload.id,
    }),
    201,
  );
  assert.equal(
    (await h.call(admin, "GET", `/files/${upload.id}/download`)).statusCode,
    403,
    "system administrator is not a private Drive reader",
  );
  ok(
    await h.call(employee, "POST", `/drive/${root.id}/shares`, {
      userId: manager.user.id,
      access: "VIEWER",
    }),
  );
  assert.equal(
    (await h.call(manager, "GET", `/files/${upload.id}/download`)).statusCode,
    200,
  );
  assert.equal(
    (
      await h.call(manager, "POST", "/drive", {
        name: "Not allowed",
        parentId: child.id,
      })
    ).statusCode,
    403,
  );
  ok(
    await h.call(employee, "POST", `/drive/${root.id}/shares`, {
      userId: manager.user.id,
      access: "EDITOR",
    }),
  );
  const edited = ok(
    await h.call(manager, "POST", "/drive", {
      name: "Editor folder",
      parentId: child.id,
    }),
    201,
  );
  assert.equal(edited.ownerId, employee.user.id);
  assert.equal(
    (
      await h.call(manager, "POST", `/drive/${child.id}/shares`, {
        userId: admin.user.id,
        access: "VIEWER",
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await h.call(employee, "PATCH", `/drive/${root.id}`, {
        parentId: child.id,
      })
    ).statusCode,
    400,
  );
  ok(await h.call(employee, "DELETE", `/drive/${root.id}`));
  assert.equal(
    (await h.call(manager, "GET", `/files/${upload.id}/download`)).statusCode,
    403,
  );
  assert.equal(
    (await h.call(employee, "GET", `/files/${upload.id}/download`)).statusCode,
    403,
  );
  ok(await h.call(employee, "POST", `/drive/${root.id}/restore`));
  const grants = ok(await h.call(employee, "GET", `/drive/${root.id}/shares`));
  ok(
    await h.call(
      employee,
      "DELETE",
      `/drive/${root.id}/shares/${grants[0].id}`,
    ),
  );
  assert.equal(
    (await h.call(manager, "GET", `/files/${upload.id}/download`)).statusCode,
    403,
  );
  assert.equal(
    (await h.call(manager, "GET", `/drive?parentId=${edited.id}`)).statusCode,
    403,
  );
  assert.equal(
    (
      await h.call(employee, "POST", "/tasks", {
        title: "Redistribute Drive",
        attachmentIds: [upload.id],
      })
    ).statusCode,
    403,
  );
});

test("approval fields, sequential permissions, concurrency, corrections and frozen schema", async () => {
  const { employee, manager, admin } = h.users;
  const type = ok(await h.call(employee, "GET", "/approval-types"))[0];
  const payload = {
    title: "New laptop",
    approvalTypeId: type.id,
    submit: true,
    data: {
      equipmentType: "Laptop",
      businessReason: "ERP work",
      estimatedCost: 1500,
    },
  };
  assert.equal(
    (
      await h.call(employee, "POST", "/approval-requests", {
        ...payload,
        data: {},
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await h.call(employee, "POST", "/approval-requests", {
        ...payload,
        data: { ...payload.data, estimatedCost: "not a number" },
      })
    ).statusCode,
    400,
  );
  let request = ok(
    await h.call(employee, "POST", "/approval-requests", payload),
    201,
  );
  assert.equal(
    (
      await h.call(admin, "POST", `/approval-requests/${request.id}/actions`, {
        revision: request.revision,
        action: "APPROVE",
      })
    ).statusCode,
    403,
  );
  const pair = await Promise.all(
    [1, 2].map(() =>
      h.call(manager, "POST", `/approval-requests/${request.id}/actions`, {
        revision: request.revision,
        action: "APPROVE",
      }),
    ),
  );
  assert.deepEqual(pair.map((r) => r.statusCode).sort(), [200, 409]);
  request = ok(
    await h.call(employee, "GET", `/approval-requests/${request.id}`),
  );
  request = ok(
    await h.call(admin, "POST", `/approval-requests/${request.id}/actions`, {
      revision: request.revision,
      action: "REQUEST_CHANGES",
      comment: "Include a model",
    }),
  );
  ok(
    await h.call(employee, "PATCH", `/approval-requests/${request.id}`, {
      title: request.title,
      data: { ...payload.data, equipmentType: "ThinkPad" },
      revision: request.revision,
    }),
  );
  request = ok(
    await h.call(employee, "GET", `/approval-requests/${request.id}`),
  );
  request = ok(
    await h.call(employee, "POST", `/approval-requests/${request.id}/submit`, {
      revision: request.revision,
    }),
  );
  assert.equal(request.rounds.length, 1);
  assert.equal(request.steps[0].status, "PENDING");
  request = ok(
    await h.call(manager, "POST", `/approval-requests/${request.id}/actions`, {
      revision: request.revision,
      action: "APPROVE",
    }),
  );
  request = ok(
    await h.call(admin, "POST", `/approval-requests/${request.id}/actions`, {
      revision: request.revision,
      action: "APPROVE",
    }),
  );
  assert.equal(request.status, "APPROVED");
  assert.equal(
    (
      await h.call(employee, "PATCH", `/approval-requests/${request.id}`, {
        title: request.title,
        data: {},
        revision: request.revision,
      })
    ).statusCode,
    409,
  );
});

test("related approval notifications can be marked read together", async () => {
  const { employee, manager } = h.users;
  const type = ok(await h.call(employee, "GET", "/approval-types"))[0];
  const request = ok(
    await h.call(employee, "POST", "/approval-requests", {
      approvalTypeId: type.id,
      title: "Notification read test",
      data: {},
      submit: false,
    }),
    201,
  );

  const first = await h.prisma.notification.create({
    data: {
      userId: employee.user.id,
      type: "APPROVAL_UPDATED",
      title: "Approval updated",
      body: request.title,
      relatedEntityType: "APPROVAL_REQUEST",
      relatedEntityId: request.id,
    },
  });
  const second = await h.prisma.notification.create({
    data: {
      userId: employee.user.id,
      type: "APPROVAL_PENDING",
      title: "Approval pending",
      body: request.title,
      relatedEntityType: "APPROVAL_REQUEST",
      relatedEntityId: request.id,
    },
  });
  const other = await h.prisma.notification.create({
    data: {
      userId: manager.user.id,
      type: "APPROVAL_PENDING",
      title: "Approval pending",
      body: request.title,
      relatedEntityType: "APPROVAL_REQUEST",
      relatedEntityId: request.id,
    },
  });

  const result = ok(
    await h.call(employee, "POST", "/notifications/read-related", {
      entityType: "APPROVAL_REQUEST",
      entityId: request.id,
    }),
  );
  assert.equal(result.count, 2);

  const rows = await h.prisma.notification.findMany({
    where: { id: { in: [first.id, second.id, other.id] } },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byId.get(first.id).isRead, true);
  assert.equal(byId.get(second.id).isRead, true);
  assert.equal(byId.get(other.id).isRead, false);
});

test("approval type management versions edits and preserves existing request snapshots", async () => {
  const { employee, admin } = h.users;
  assert.equal(
    (await h.call(employee, "GET", "/approval-types/manage")).statusCode,
    403,
  );
  const created = ok(
    await h.call(admin, "POST", "/approval-types", {
      code: "TRAVEL_TEST",
      name: "Travel request",
      description: "Original configuration",
      formSchema: {},
      steps: [
        {
          stepNumber: 1,
          name: "Manager review",
          approverRule: "REQUESTER_MANAGER",
          approverValue: null,
        },
      ],
    }),
    201,
  );
  const request = ok(
    await h.call(employee, "POST", "/approval-requests", {
      approvalTypeId: created.id,
      title: "Conference travel",
      data: {},
      submit: false,
    }),
    201,
  );
  assert.equal(request.workflowSnapshot.type.name, "Travel request");
  assert.equal(request.workflowSnapshot.type.version, 1);

  const managed = ok(await h.call(admin, "GET", "/approval-types/manage"));
  const managedCreated = managed.find((item) => item.id === created.id);
  assert.equal(managedCreated._count.requests, 1);

  const updated = ok(
    await h.call(admin, "PATCH", `/approval-types/${created.id}`, {
      code: created.code,
      name: "Business travel request",
      description: "Updated configuration",
      formSchema: {
        destination: {
          label: "Destination",
          type: "text",
          required: false,
        },
      },
      steps: [
        {
          stepNumber: 1,
          name: "Manager approval",
          approverRule: "REQUESTER_MANAGER",
          approverValue: null,
        },
      ],
    }),
  );
  assert.equal(updated.version, 2);
  assert.equal(updated.name, "Business travel request");

  assert.equal(
    (
      await h.call(admin, "PATCH", `/approval-types/${created.id}`, {
        code: "TRAVEL_TEST_RENAMED",
        name: updated.name,
        description: updated.description,
        formSchema: updated.formSchema,
        steps: updated.steps.map(
          ({ stepNumber, name, approverRule, approverValue }) => ({
            stepNumber,
            name,
            approverRule,
            approverValue,
          }),
        ),
      })
    ).statusCode,
    409,
  );

  const historical = ok(
    await h.call(employee, "GET", `/approval-requests/${request.id}`),
  );
  assert.equal(historical.workflowSnapshot.type.name, "Travel request");
  assert.equal(historical.workflowSnapshot.type.version, 1);

  const inactive = ok(
    await h.call(admin, "PATCH", `/approval-types/${created.id}/status`, {
      status: "INACTIVE",
    }),
  );
  assert.equal(inactive.status, "INACTIVE");
  assert.equal(inactive.version, 2);
  const activeTypes = ok(await h.call(employee, "GET", "/approval-types"));
  assert.ok(!activeTypes.some((item) => item.id === created.id));
  assert.equal(
    (
      await h.call(employee, "POST", "/approval-requests", {
        approvalTypeId: created.id,
        title: "Blocked new request",
        data: {},
      })
    ).statusCode,
    404,
  );

  const restored = ok(
    await h.call(admin, "PATCH", `/approval-types/${created.id}/status`, {
      status: "ACTIVE",
    }),
  );
  assert.equal(restored.status, "ACTIVE");
  assert.equal(restored.version, 2);
});

test("group membership is enforced on messages and attachments after removal", async () => {
  const { employee, manager, admin } = h.users;
  const group = ok(
    await h.call(employee, "POST", "/conversations", {
      type: "GROUP",
      name: "Working group",
      memberIds: [manager.user.id],
    }),
    201,
  );
  assert.equal(
    (await h.call(admin, "GET", `/conversations/${group.id}/messages`))
      .statusCode,
    403,
  );
  const file = ok(await h.upload(employee), 201);
  ok(
    await h.call(employee, "POST", `/conversations/${group.id}/messages`, {
      content: "Team file",
      attachmentIds: [file.id],
    }),
    201,
  );
  assert.equal(
    (await h.call(manager, "GET", `/files/${file.id}/download`)).statusCode,
    200,
  );
  ok(
    await h.call(
      employee,
      "DELETE",
      `/conversations/${group.id}/members/${manager.user.id}`,
    ),
  );
  assert.equal(
    (await h.call(manager, "GET", `/files/${file.id}/download`)).statusCode,
    403,
  );
  assert.equal(
    (
      await h.call(manager, "POST", `/conversations/${group.id}/messages`, {
        content: "No longer a member",
      })
    ).statusCode,
    403,
  );
});

test("revoked sessions invalidate access tokens immediately", async () => {
  const actor = await h.login("manager@example.com", "Manager123!");
  const logout = await h.app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: { cookie: actor.cookie },
  });
  assert.equal(logout.statusCode, 200);
  assert.equal((await h.call(actor, "GET", "/auth/me")).statusCode, 401);
  const disabled = await h.login("outsider@example.com", "Outsider123!");
  ok(
    await h.call(h.users.admin, "PATCH", `/users/${disabled.user.id}`, {
      status: "INACTIVE",
    }),
  );
  assert.equal((await h.call(disabled, "GET", "/auth/me")).statusCode, 401);
});

test("changing a password verifies the old secret and revokes every session", async () => {
  ok(
    await h.call(h.users.admin, "POST", "/users", {
      email: "password@example.com",
      password: "InitialSecret123!",
      firstName: "Password",
      lastName: "Test",
    }),
    201,
  );
  const actor = await h.login("password@example.com", "InitialSecret123!");
  const second = await h.login("password@example.com", "InitialSecret123!");
  assert.equal(
    (
      await h.call(actor, "POST", "/auth/password", {
        currentPassword: "incorrect",
        newPassword: "NewPassword123!",
      })
    ).statusCode,
    400,
  );
  ok(
    await h.call(actor, "POST", "/auth/password", {
      currentPassword: "InitialSecret123!",
      newPassword: "NewPassword123!",
    }),
  );
  assert.equal((await h.call(second, "GET", "/auth/me")).statusCode, 401);
  assert.equal((await h.call(actor, "GET", "/auth/me")).statusCode, 401);
  const renewed = await h.login("password@example.com", "NewPassword123!");
  ok(await h.call(renewed, "GET", "/auth/me"));
});

test("local storage readiness and upload limits work without an object-storage server", async () => {
  assert.equal(
    (await h.app.inject({ method: "GET", url: "/health/ready" })).statusCode,
    200,
  );
  assert.equal((await h.upload(h.users.employee, "run.exe")).statusCode, 400);
  assert.equal(
    (await h.upload(h.users.employee, "empty.txt", "")).statusCode,
    400,
  );
  assert.equal(
    (await h.upload(h.users.employee, "large.txt", "a".repeat(3 * 1024 * 1024)))
      .statusCode,
    413,
  );
});
