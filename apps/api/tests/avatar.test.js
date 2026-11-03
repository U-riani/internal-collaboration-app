import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

let h;
before(async () => { h = await harness(); });
after(async () => { if (h) await h.close(); });

// A valid tiny PNG; keep the binary payload separate from multipart headers.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3dQfQAAAAASUVORK5CYII=",
  "base64",
);

function uploadAvatar(actor, bytes = png, mime = "image/png", filename = "photo.png") {
  const boundary = "collab-avatar-test";
  const payload = Buffer.concat([
    Buffer.from(
      "--" + boundary + "\r\n" +
      'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
      "Content-Type: " + mime + "\r\n\r\n",
    ),
    bytes,
    Buffer.from("\r\n--" + boundary + "--\r\n"),
  ]);
  return h.app.inject({
    method: "POST",
    url: "/api/v1/users/me/avatar",
    headers: {
      authorization: "Bearer " + actor.accessToken,
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload,
  });
}

test("a colleague's avatar is uploaded, viewed privately, replaced and removed", async () => {
  const { employee, manager } = h.users;
  const url = "/users/" + employee.user.id + "/avatar";

  assert.equal((await h.call(employee, "GET", url)).statusCode, 404);
  assert.equal((await h.call(null, "GET", url)).statusCode, 401);
  const initialManifest = await h.call(employee, "GET", "/users/avatars");
  assert.equal(initialManifest.statusCode, 200, initialManifest.body);
  assert.equal(initialManifest.json().data[employee.user.id], undefined);
  assert.equal((await h.call(null, "GET", "/users/avatars")).statusCode, 401);

  const upload = await uploadAvatar(employee);
  assert.equal(upload.statusCode, 201, upload.body);
  const first = upload.json().data;
  assert.match(first.avatarUrl, /^\/api\/v1\/users\//);
  assert.equal(first.id, employee.user.id);
  const original = await h.prisma.user.findUnique({ where: { id: employee.user.id } });
  assert.equal(original.avatarMimeType, "image/png");
  assert.ok(original.avatarObjectKey);

  const manifest = await h.call(manager, "GET", "/users/avatars");
  assert.equal(manifest.statusCode, 200, manifest.body);
  assert.equal(manifest.json().data[employee.user.id], first.avatarUrl);
  assert.equal(manifest.headers["cache-control"], "private, no-store");
  assert.equal(JSON.stringify(manifest.json()).includes(original.avatarObjectKey), false);

  const image = await h.call(manager, "GET", url);
  assert.equal(image.statusCode, 200, image.body);
  assert.equal(image.headers["content-type"], "image/png");
  assert.equal(image.headers["cache-control"], "private, no-store");
  assert.deepEqual(image.rawPayload, png);

  const replacement = await uploadAvatar(employee);
  assert.equal(replacement.statusCode, 201, replacement.body);
  const changed = await h.prisma.user.findUnique({ where: { id: employee.user.id } });
  assert.notEqual(changed.avatarObjectKey, original.avatarObjectKey);

  const removed = await h.call(employee, "DELETE", "/users/me/avatar");
  assert.equal(removed.statusCode, 200, removed.body);
  assert.equal(removed.json().data.avatarUrl, null);
  assert.equal((await h.call(manager, "GET", url)).statusCode, 404);
  const afterRemoval = await h.prisma.user.findUnique({ where: { id: employee.user.id } });
  assert.equal(afterRemoval.avatarObjectKey, null);
  assert.equal(afterRemoval.avatarMimeType, null);
  const clearedManifest = await h.call(manager, "GET", "/users/avatars");
  assert.equal(clearedManifest.statusCode, 200, clearedManifest.body);
  assert.equal(clearedManifest.json().data[employee.user.id], undefined);

  const events = await h.prisma.auditLog.findMany({
    where: { actorId: employee.user.id, entityId: employee.user.id },
    orderBy: { createdAt: "asc" },
  });
  const actions = events.map((event) => event.actionType);
  assert.ok(actions.includes("USER_AVATAR_UPLOADED"));
  assert.ok(actions.includes("USER_AVATAR_CHANGED"));
  assert.ok(actions.includes("USER_AVATAR_REMOVED"));
});

test("avatar upload rejects unsupported types and forged image headers", async () => {
  const actor = h.users.employee;
  const plainText = await uploadAvatar(actor, Buffer.from("not a photo"), "text/plain", "note.txt");
  assert.equal(plainText.statusCode, 415, plainText.body);
  const forged = await uploadAvatar(actor, Buffer.from("not a png"), "image/png", "fake.png");
  assert.equal(forged.statusCode, 415, forged.body);
  const user = await h.prisma.user.findUnique({ where: { id: actor.user.id } });
  assert.equal(user.avatarObjectKey, null);
});
