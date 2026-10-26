import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

let h;
before(async () => { h = await harness(); });
after(async () => { if (h) await h.close(); });
function ok(result, status = 200) {
  assert.equal(result.statusCode, status, result.body);
  return result.json().data;
}

test("chunked uploads preserve file bytes and enforce session ownership", async () => {
  const { employee, manager } = h.users;
  const content = "hello chunks";
  const started = ok(
    await h.call(employee, "POST", "/files/uploads", {
      name: "chunked.txt",
      sizeBytes: Buffer.byteLength(content),
      mimeType: "text/plain",
    }),
    201,
  );
  assert.equal(started.chunkSize, 8 * 1024 * 1024);
  assert.equal(
    (await h.call(manager, "POST", `/files/uploads/${started.uploadId}/complete`)).statusCode,
    404,
  );
  const boundary = "collab-chunk-test";
  const uploadedChunk = await h.app.inject({
    method: "POST",
    url: `/api/v1/files/uploads/${started.uploadId}/chunks/0`,
    headers: {
      authorization: `Bearer ${employee.accessToken}`,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.bin"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n--${boundary}--\r\n`,
    ),
  });
  ok(uploadedChunk);
  assert.equal(
    (await h.call(employee, "POST", `/files/uploads/${started.uploadId}/chunks/0`)).statusCode,
    409,
  );
  const finished = ok(
    await h.call(employee, "POST", `/files/uploads/${started.uploadId}/complete`),
    201,
  );
  assert.equal(finished.sizeBytes, Buffer.byteLength(content));
  const download = await h.call(employee, "GET", `/files/${finished.id}/download`);
  assert.equal(download.statusCode, 200);
  assert.equal(download.body, content);
});

test("messages, tasks and approvals accept multiple owned files", async () => {
  const employee = h.users.employee;
  const first = ok(await h.upload(employee, "multiple-one.txt", "first"), 201);
  const second = ok(await h.upload(employee, "multiple-two.txt", "second"), 201);
  const ids = [first.id, second.id];
  const conversation = ok(await h.call(employee, "POST", "/conversations", {
    type: "GROUP",
    name: "Multiple attachment test",
    memberIds: [h.users.admin.user.id],
  }), 201);
  const message = ok(await h.call(
    employee, "POST", `/conversations/${conversation.id}/messages`,
    { content: "", attachmentIds: ids },
  ), 201);
  assert.equal(message.attachments.length, 2);
  const task = ok(await h.call(employee, "POST", "/tasks", {
    title: "Multiple attachments", attachmentIds: ids,
  }), 201);
  assert.equal(task.attachments.length, 2);
  const approvalType = ok(await h.call(employee, "GET", "/approval-types"))[0];
  const approval = ok(await h.call(employee, "POST", "/approval-requests", {
    title: "Multiple attachment request", approvalTypeId: approvalType.id,
    data: {}, submit: false, attachmentIds: ids,
  }), 201);
  assert.equal(approval.attachments.length, 2);
});
