import { api } from "./api.js";

const preferenceKey = (userId) => `collab:web-push:${userId}`;

export function pushSupported() {
  return typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

export function isIosHomeScreenRequired() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches) ||
    navigator.standalone === true;
  return ios && !standalone;
}

export function pushPreferenceEnabled(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(preferenceKey(userId)) === "on";
  } catch {
    return false;
  }
}

function setPushPreference(userId, enabled) {
  try {
    localStorage.setItem(preferenceKey(userId), enabled ? "on" : "off");
  } catch {
    // Browser storage can be unavailable; do not interrupt registration.
  }
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function serviceWorkerRegistration() {
  await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

function subscriptionPayload(subscription) {
  const keys = subscription.toJSON().keys;
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

export async function getWebPushConfiguration() {
  return (await api("/push/config")).data;
}

export async function browserHasPushSubscription() {
  if (!pushSupported()) return false;
  const registration = await serviceWorkerRegistration();
  return Boolean(await registration.pushManager.getSubscription());
}

// Must be called directly in a click/tap handler: iOS requires a user gesture
// for the browser's permission prompt.
export async function enableBrowserPush(userId, publicKey) {
  if (!pushSupported()) throw new Error("Push notifications are not supported in this browser.");
  if (isIosHomeScreenRequired())
    throw new Error("On iPhone, add this website to your Home Screen and open it from there.");
  if (!publicKey) throw new Error("The server has not configured Web Push yet.");
  if (Notification.permission === "denied")
    throw new Error("Notifications are blocked. Allow them in browser settings.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const registration = await serviceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  const currentKey = subscription?.options?.applicationServerKey;
  const requestedKey = fromBase64Url(publicKey);
  if (currentKey && (
    currentKey.byteLength !== requestedKey.length ||
    Array.from(new Uint8Array(currentKey)).some((v, i) => v !== requestedKey[i])
  )) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: requestedKey,
    });
  }
  try {
    await api("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscriptionPayload(subscription)),
    });
  } catch (error) {
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  setPushPreference(userId, true);
  return true;
}

export async function disableBrowserPush(userId) {
  setPushPreference(userId, false);
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await api("/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    // If offline, unsubscribe locally; expired endpoints are cleaned up by the server.
    await subscription.unsubscribe();
  }
}

// On subsequent visits, reconnect a previously opted-in browser to the current
// authenticated session, without showing a browser permission prompt.
export async function syncExistingBrowserPush(userId) {
  if (!pushSupported() || !pushPreferenceEnabled(userId) ||
      Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await api("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscriptionPayload(subscription)),
    });
  } catch {
    // An offline tab or unconfigured server should never break normal navigation.
  }
}
