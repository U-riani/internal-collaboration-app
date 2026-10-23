import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from "node:crypto";
import { env } from "../config/env.js";

let configurationCache;

export function webPushConfigured() {
  if (configurationCache !== undefined) return configurationCache;
  try {
    const { PUSH_VAPID_PUBLIC_KEY: publicValue,
      PUSH_VAPID_PRIVATE_KEY: privateValue, PUSH_VAPID_SUBJECT: subject } = env;
    const hasValidSubject = (
      (subject.startsWith("mailto:") && subject.slice(7).includes("@")) ||
      subject.startsWith("https://")
    ) && !subject.split("").some((character) => character.charCodeAt(0) <= 32);
    if (!publicValue || !privateValue || !hasValidSubject ||
      !/^[A-Za-z0-9_-]+$/.test(publicValue) ||
      !/^[A-Za-z0-9_-]+$/.test(privateValue)) {
      configurationCache = false;
      return false;
    }
    const publicKey = decode(publicValue);
    const privateKey = decode(privateValue);
    if (publicKey.length !== 65 || publicKey[0] !== 4 ||
      privateKey.length !== 32) {
      configurationCache = false;
      return false;
    }
    const derived = createECDH("prime256v1");
    derived.setPrivateKey(privateKey);
    configurationCache = derived.getPublicKey().equals(publicKey);
    return configurationCache;
  } catch {
    configurationCache = false;
    return false;
  }
}

function decode(value) {
  return Buffer.from(value, "base64url");
}

function expand(prk, info, length) {
  let previous = Buffer.alloc(0);
  const blocks = [];
  for (let counter = 1; Buffer.concat(blocks).length < length; counter++) {
    previous = createHmac("sha256", prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    blocks.push(previous);
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function extract(salt, secret) {
  return createHmac("sha256", salt).update(secret).digest();
}

// RFC 8291 / RFC 8188: aes128gcm, one encrypted record per Web Push.
export function encryptWebPush(subscription, plaintext) {
  const receiverPublic = decode(subscription.keys.p256dh);
  const authSecret = decode(subscription.keys.auth);
  if (receiverPublic.length !== 65 || receiverPublic[0] !== 4 ||
      authSecret.length !== 16) {
    throw new Error("Invalid push subscription encryption keys");
  }

  const payload = Buffer.from(plaintext, "utf8");
  if (payload.length > 3800) throw new Error("Push payload is too large");

  const sender = createECDH("prime256v1");
  sender.generateKeys();
  const senderPublic = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(receiverPublic);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    receiverPublic,
    senderPublic,
  ]);
  const ikm = expand(extract(authSecret, sharedSecret), keyInfo, 32);
  const salt = randomBytes(16);
  const prk = extract(salt, ikm);
  const cek = expand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = expand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.concat([payload, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([senderPublic.length]),
    senderPublic,
    encrypted,
  ]);
}

function vapidToken(endpoint) {
  const publicKey = decode(env.PUSH_VAPID_PUBLIC_KEY);
  const privateKey = decode(env.PUSH_VAPID_PRIVATE_KEY);
  if (publicKey.length !== 65 || publicKey[0] !== 4 ||
      privateKey.length !== 32) {
    throw new Error("Invalid VAPID key pair");
  }
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: publicKey.subarray(1, 33).toString("base64url"),
      y: publicKey.subarray(33, 65).toString("base64url"),
      d: privateKey.toString("base64url"),
    },
    format: "jwk",
  });
  const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" }))
    .toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: env.PUSH_VAPID_SUBJECT,
  })).toString("base64url");
  const input = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(input), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${input}.${signature}`;
}

export async function deliverWebPush(subscription, payload) {
  if (!webPushConfigured()) return { skipped: true };
  const url = new URL(subscription.endpoint);
  if (url.protocol !== "https:") throw new Error("Invalid push endpoint");
  const body = encryptWebPush(subscription, JSON.stringify(payload));
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `vapid t=${vapidToken(url.href)}, k=${env.PUSH_VAPID_PUBLIC_KEY}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  return { status: response.status, ok: response.ok };
}
