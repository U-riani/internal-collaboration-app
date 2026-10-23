import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { env } from "../config/env.js";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
let cachedCredentials;
let cachedOAuth;
let configured;

export function nativePushConfigured() {
  if (configured !== undefined) return configured;
  try {
    if (!env.FCM_PROJECT_ID || !env.FCM_SERVICE_ACCOUNT_FILE) return configured = false;
    const data = JSON.parse(readFileSync(env.FCM_SERVICE_ACCOUNT_FILE, "utf8"));
    if (data.type !== "service_account" || data.project_id !== env.FCM_PROJECT_ID ||
        !data.client_email || !data.private_key ||
        !data.token_uri || data.token_uri !== "https://oauth2.googleapis.com/token") {
      return configured = false;
    }
    createPrivateKey(data.private_key);
    cachedCredentials = data;
    return configured = true;
  } catch {
    return configured = false;
  }
}

function jwtAssertion(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = [
    encoded({ alg: "RS256", typ: "JWT" }),
    encoded({ iss: serviceAccount.client_email, sub: serviceAccount.client_email,
      aud: serviceAccount.token_uri, scope: SCOPE, iat: now, exp: now + 3600 }),
  ].join(".");
  const signature = sign("RSA-SHA256", Buffer.from(payload), serviceAccount.private_key)
    .toString("base64url");
  return payload + "." + signature;
}

async function oauthToken() {
  if (cachedOAuth && Date.now() < cachedOAuth.expiresAt) return cachedOAuth.token;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtAssertion(cachedCredentials),
    }),
  });
  if (!response.ok) throw new Error("FCM OAuth token request failed (" + response.status + ")");
  const body = await response.json();
  if (!body.access_token || !body.expires_in) throw new Error("Invalid FCM OAuth response");
  cachedOAuth = { token: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in - 180) * 1000 };
  return cachedOAuth.token;
}

export async function sendNativePush(device, notification, url) {
  if (!nativePushConfigured()) return { skipped: true };
  const accessToken = await oauthToken();
  const response = await fetch(
    "https://fcm.googleapis.com/v1/projects/" +
      encodeURIComponent(env.FCM_PROJECT_ID) + "/messages:send",
    {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ message: {
        token: device.token,
        notification: {
          title: String(notification.title || "GTEX Collaboration").slice(0, 160),
          body: String(notification.body || "").slice(0, 500),
        },
        data: { notificationId: notification.id,
          type: notification.type, targetUrl: url || "/notifications" },
        android: { priority: "HIGH", ttl: "86400s", notification: {
          sound: "default", tag: notification.id,
        } },
      } }),
    },
  );
  if (response.ok) return { ok: true };
  if (response.status === 401) cachedOAuth = null;
  const body = await response.json().catch(() => ({}));
  const code = body?.error?.details?.find?.((x) =>
    x["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError")?.errorCode;
  return {
    ok: false,
    status: response.status,
    invalid: code === "UNREGISTERED" ||
      (response.status === 404 && code === "UNREGISTERED"),
    error: String(code || body?.error?.status || "FCM_ERROR").slice(0, 100),
  };
}
