import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  createDecipheriv, createECDH, createHmac, createPublicKey,
  randomBytes, verify,
} from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET ??= "test-secret-at-least-thirty-two-bytes-long";
process.env.MINIO_ROOT_USER ??= "test";
process.env.MINIO_ROOT_PASSWORD ??= "test-password";
process.env.STORAGE_DRIVER ??= "local";

const vapid = createECDH("prime256v1");
vapid.generateKeys();
process.env.PUSH_VAPID_PUBLIC_KEY = vapid.getPublicKey().toString("base64url");
process.env.PUSH_VAPID_PRIVATE_KEY = vapid.getPrivateKey().toString("base64url");
process.env.PUSH_VAPID_SUBJECT = "mailto:push-tests@example.com";

const { encryptWebPush, deliverWebPush, webPushConfigured } =
  await import("../src/lib/web-push.js");

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

function extract(salt, secret) {
  return createHmac("sha256", salt).update(secret).digest();
}
function expand(prk, info, length) {
  let part = Buffer.alloc(0);
  let output = Buffer.alloc(0);
  let i = 0;
  while (output.length < length) {
    part = createHmac("sha256", prk)
      .update(Buffer.concat([part, info, Buffer.from([++i])])).digest();
    output = Buffer.concat([output, part]);
  }
  return output.subarray(0, length);
}
function makeReceiver() {
  const receiver = createECDH("prime256v1");
  receiver.generateKeys();
  const auth = randomBytes(16);
  return {
    receiver, auth,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      keys: {
        p256dh: receiver.getPublicKey().toString("base64url"),
        auth: auth.toString("base64url"),
      },
    },
  };
}

// Independent decryption from the recipient's side ensures the Web Push
// aes128gcm format, ECDH ordering, record delimiter and AEAD tag are correct.
function decrypt(record, receiver, auth) {
  const salt = record.subarray(0, 16);
  assert.equal(record.readUInt32BE(16), 4096);
  assert.equal(record[20], 65);
  const senderPublic = record.subarray(21, 86);
  const ciphertext = record.subarray(86, -16);
  const tag = record.subarray(-16);
  const shared = receiver.computeSecret(senderPublic);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"), receiver.getPublicKey(), senderPublic,
  ]);
  const ikm = expand(extract(auth, shared), keyInfo, 32);
  const prk = extract(salt, ikm);
  const cek = expand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = expand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext), decipher.final(),
  ]);
  assert.equal(plaintext.at(-1), 2);
  return plaintext.subarray(0, -1).toString("utf8");
}

test("push encryption round-trips via the receiver's private key", () => {
  const { receiver, auth, subscription } = makeReceiver();
  const text = JSON.stringify({
    title: "New task", body: "October Report", url: "/tasks?task=123",
  });
  const encrypted = encryptWebPush(subscription, text);
  assert.equal(decrypt(encrypted, receiver, auth), text);
  assert.notEqual(encrypted.toString("utf8"), text);
});

test("invalid subscription keys and oversized payloads are rejected", () => {
  const { subscription } = makeReceiver();
  assert.throws(() => encryptWebPush({
    ...subscription, keys: { ...subscription.keys, auth: "invalid" },
  }, "hi"), /Invalid push subscription/);
  assert.throws(() =>
    encryptWebPush(subscription, "x".repeat(3801)), /too large/);
});

test("delivery signs VAPID ES256 and posts encrypted body", async () => {
  assert.equal(webPushConfigured(), true);
  const { receiver, auth, subscription } = makeReceiver();
  const payload = { title: "New message", body: "Hi", url: "/chat" };
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url.href || url, subscription.endpoint);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Encoding"], "aes128gcm");
    assert.equal(options.headers.TTL, "86400");
    assert.equal(decrypt(options.body, receiver, auth), JSON.stringify(payload));
    const authorization = options.headers.Authorization;
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(authorization);
    assert.ok(match);
    assert.equal(match[2], process.env.PUSH_VAPID_PUBLIC_KEY);
    const [header, claims, signature] = match[1].split(".");
    const jwtClaims = JSON.parse(Buffer.from(claims, "base64url").toString());
    assert.equal(jwtClaims.aud, "https://fcm.googleapis.com");
    assert.equal(jwtClaims.sub, process.env.PUSH_VAPID_SUBJECT);
    const pub = vapid.getPublicKey();
    const key = createPublicKey({
      key: {
        kty: "EC", crv: "P-256",
        x: pub.subarray(1, 33).toString("base64url"),
        y: pub.subarray(33).toString("base64url"),
      },
      format: "jwk",
    });
    assert.equal(verify("sha256", Buffer.from(`${header}.${claims}`), {
      key, dsaEncoding: "ieee-p1363",
    }, Buffer.from(signature, "base64url")), true);
    return { ok: true, status: 201 };
  };

  const result = await deliverWebPush(subscription, payload);
  assert.equal(result.status, 201);
  assert.equal(result.ok, true);
  assert.equal(requests, 1);
});
