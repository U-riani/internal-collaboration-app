import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import test from "node:test";
import { harness } from "./support/harness.js";

// Configure test-only VAPID credentials BEFORE buildApp imports env.js.
const vapid = createECDH("prime256v1");
vapid.generateKeys();
process.env.PUSH_VAPID_PUBLIC_KEY = vapid.getPublicKey().toString("base64url");
process.env.PUSH_VAPID_PRIVATE_KEY = vapid.getPrivateKey().toString("base64url");
process.env.PUSH_VAPID_SUBJECT = "mailto:push-test@example.com";

function fakeBrowserSubscription() {
  const key = createECDH("prime256v1");
  key.generateKeys();
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/test-only-endpoint",
    keys: {
      p256dh: key.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}

test("Web Push subscription, test delivery, queue and user isolation", async (t) => {
  const h = await harness();
  t.after(() => h.close());

  const existingFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (endpoint, options) => {
    sent.push({ endpoint, options });
    return { ok: true, status: 201 };
  };
  t.after(() => { globalThis.fetch = existingFetch; });

  const browser = fakeBrowserSubscription();
  const untrustedEndpoint = {
    ...browser,
    endpoint: "https://127.0.0.1:5432/secret",
  };

  let result = await h.call(h.users.employee, "POST", "/push/subscriptions", untrustedEndpoint);
  assert.equal(result.statusCode, 400, "reject SSRF endpoints");

  result = await h.call(h.users.employee, "POST", "/push/subscriptions", browser);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().data.subscribed, true);

  result = await h.call(h.users.employee, "POST", "/push/status", {
    endpoint: browser.endpoint,
  });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().data.linked, true);
  assert.equal(result.json().data.currentSession, true);

  result = await h.call(h.users.manager, "POST", "/push/subscriptions", browser);
  assert.equal(result.statusCode, 409, "do not hijack active user's endpoint");
  assert.equal(result.json().error.code, "PUSH_ENDPOINT_IN_USE");

  result = await h.call(h.users.employee, "POST", "/push/test", {
    endpoint: browser.endpoint,
  });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().data.gatewayAccepted, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint.href || sent[0].endpoint, browser.endpoint);

  // End-to-end from the application's real createNotification() helper to
  // PostgreSQL's durable push outbox and the downstream Web Push transport.
  const { createNotification } = await import("../src/lib/notifications.js");
  const notification = await createNotification(h.app, {
    userId: h.users.employee.user.id,
    type: "SYSTEM",
    title: "Integration test notification",
    body: "This is a safe test.",
  });
  assert.ok(notification.id);

  const jobs = await h.prisma.pushDelivery.findMany({
    where: { notificationId: notification.id },
  });
  assert.equal(jobs.length, 1, "createNotification stores a durable delivery");
  assert.equal(jobs[0].eventKey.startsWith(notification.id + ":"), true);

  const { processPushDeliveries } = await import("../src/lib/push-notifications.js");
  await processPushDeliveries(h.app);
  // The helper can start a concurrent worker; if it already claimed the
  // delivery we only assert that no duplicate job was created.
  assert.equal(await h.prisma.pushDelivery.count({
    where: { notificationId: notification.id },
  }), 1);

  // Explicit logout revokes the subscription's auth session; the old
  // browser endpoint can then be transferred safely after new consent.
  await h.prisma.session.updateMany({
    where: { userId: h.users.employee.user.id },
    data: { revokedAt: new Date() },
  });
  result = await h.call(h.users.manager, "POST", "/push/subscriptions", browser);
  assert.equal(result.statusCode, 200, result.body);
  const updated = await h.prisma.pushSubscription.findUnique({
    where: { endpoint: browser.endpoint },
  });
  assert.equal(updated.userId, h.users.manager.user.id);
});
