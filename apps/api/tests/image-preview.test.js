import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

test("image previews use existing file access and never force downloads", async () => {
  const h = await harness();
  try {
    const { employee, manager, admin } = h.users;
    const file = await h.upload(employee, "photo.png", "preview-image-bytes");
    assert.equal(file.statusCode, 201, file.body);
    const fileId = file.json().data.id;

    // Stored MIME metadata drives previews for new and existing attachments.
    await h.prisma.fileObject.update({
      where: { id: fileId },
      data: { mimeType: "image/png" },
    });
    const path = "/files/" + fileId + "/preview";

    const unauthenticated = await h.call(null, "GET", path);
    assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

    const ownPreview = await h.call(employee, "GET", path);
    assert.equal(ownPreview.statusCode, 200, ownPreview.body);
    assert.match(ownPreview.headers["content-type"], /^image\/png/);
    assert.equal(ownPreview.headers["content-disposition"], "inline");
    assert.equal(ownPreview.headers["x-content-type-options"], "nosniff");
    assert.equal(ownPreview.headers["cache-control"], "private, no-store");
    assert.equal(ownPreview.body, "preview-image-bytes");
    assert.equal((await h.call(manager, "GET", path)).statusCode, 403);

    const conversation = await h.call(employee, "POST", "/conversations", {
      type: "GROUP", name: "Image access", memberIds: [manager.user.id],
    });
    assert.equal(conversation.statusCode, 201, conversation.body);
    const id = conversation.json().data.id;
    const posted = await h.call(employee, "POST", "/conversations/" + id + "/messages", {
      content: "", attachmentIds: [fileId],
    });
    assert.equal(posted.statusCode, 201, posted.body);

    const memberPreview = await h.call(manager, "GET", path);
    assert.equal(memberPreview.statusCode, 200, memberPreview.body);
    assert.equal((await h.call(admin, "GET", path)).statusCode, 403);

    const removed = await h.call(employee, "DELETE", "/conversations/" + id + "/members/" + manager.user.id);
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal((await h.call(manager, "GET", path)).statusCode, 403);

    const download = await h.call(employee, "GET", "/files/" + fileId + "/download");
    assert.equal(download.statusCode, 200);
    assert.match(download.headers["content-disposition"], /^attachment;/);
    assert.match(download.headers["content-type"], /application\/octet-stream/);
    assert.equal((await h.call(employee, "GET", "/files/00000000-0000-4000-8000-000000000001/preview")).statusCode, 404);
  } finally {
    await h.close();
  }
});

test("non-raster images and arbitrary files cannot be rendered inline", async () => {
  const h = await harness();
  try {
    const { employee } = h.users;
    const file = await h.upload(employee, "unsafe.svg", "<svg onload='alert(1)'/>");
    assert.equal(file.statusCode, 201, file.body);
    const fileId = file.json().data.id;

    for (const type of ["image/svg+xml", "text/html", "application/pdf", "application/octet-stream"]) {
      await h.prisma.fileObject.update({ where: { id: fileId }, data: { mimeType: type } });
      const response = await h.call(employee, "GET", "/files/" + fileId + "/preview");
      assert.equal(response.statusCode, 415, type + ": " + response.body);
      assert.equal(response.json().error.code, "FILE_PREVIEW_UNSUPPORTED");
    }
    await h.prisma.fileObject.update({ where: { id: fileId }, data: { mimeType: "IMAGE/PNG" } });
    const allowed = await h.call(employee, "GET", "/files/" + fileId + "/preview");
    assert.equal(allowed.statusCode, 200, allowed.body);
    assert.match(allowed.headers["content-type"], /^image\/png/);
  } finally {
    await h.close();
  }
});

test("gallery ZIP includes only images from the requested message and enforces membership", async () => {
  const h = await harness();
  try {
    const { employee, manager, admin } = h.users;
    const first = await h.upload(employee, "one.png", "first-image-contents");
    const second = await h.upload(employee, "two.png", "second-image-contents");
    const unrelated = await h.upload(employee, "other.png", "not-in-this-archive");
    for (const result of [first, second, unrelated])
      assert.equal(result.statusCode, 201, result.body);
    const ids = [first, second, unrelated].map((r) => r.json().data.id);
    await h.prisma.fileObject.updateMany({ where: { id: { in: ids } }, data: { mimeType: "image/png" } });

    const conversation = await h.call(employee, "POST", "/conversations", {
      type: "GROUP", name: "ZIP membership check", memberIds: [manager.user.id],
    });
    assert.equal(conversation.statusCode, 201, conversation.body);
    const conversationId = conversation.json().data.id;
    const sent = await h.call(employee, "POST", "/conversations/" + conversationId + "/messages", {
      content: "", attachmentIds: ids.slice(0, 2),
    });
    assert.equal(sent.statusCode, 201, sent.body);
    const messageId = sent.json().data.id;
    const archivePath = "/conversations/" + conversationId + "/messages/" + messageId + "/images/archive";
    assert.equal((await h.call(null, "GET", archivePath)).statusCode, 401);
    assert.equal((await h.call(admin, "GET", archivePath)).statusCode, 403);
    const archive = await h.call(manager, "GET", archivePath);
    assert.equal(archive.statusCode, 200, archive.body);
    assert.match(archive.headers["content-type"], /application\/zip/);
    assert.match(archive.headers["content-disposition"], /^attachment;/);
    assert.equal(archive.headers["cache-control"], "private, no-store");
    const bytes = archive.rawPayload;
    assert.equal(bytes.readUInt32LE(0), 0x04034b50);
    assert.ok(bytes.includes(Buffer.from("first-image-contents")));
    assert.ok(bytes.includes(Buffer.from("second-image-contents")));
    assert.ok(!bytes.includes(Buffer.from("not-in-this-archive")));
    assert.ok(bytes.includes(Buffer.from("one.png")));
    assert.ok(bytes.includes(Buffer.from("two.png")));

    const otherMessage = await h.call(employee, "POST", "/conversations/" + conversationId + "/messages", {
      content: "", attachmentIds: [ids[2]],
    });
    assert.equal(otherMessage.statusCode, 201, otherMessage.body);
    const isolated = await h.call(manager, "GET", archivePath);
    assert.equal(isolated.statusCode, 200, isolated.body);
    assert.ok(!isolated.rawPayload.includes(Buffer.from("not-in-this-archive")));

    const removed = await h.call(employee, "DELETE", "/conversations/" + conversationId + "/members/" + manager.user.id);
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal((await h.call(manager, "GET", archivePath)).statusCode, 403);
    const wrongConversation = await h.call(employee, "GET",
      "/conversations/" + ids[0] + "/messages/" + messageId + "/images/archive");
    assert.notEqual(wrongConversation.statusCode, 200);
  } finally {
    await h.close();
  }
});
