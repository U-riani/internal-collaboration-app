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
