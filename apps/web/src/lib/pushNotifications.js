import { api } from "./api.js";

const preferenceKey = (userId) => `collab:web-push:${userId}`;
const ownerKey = "collab:web-push:owner";

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

function getOwner() {
  try {
    return localStorage.getItem(ownerKey);
  } catch {
    return null;
  }
}

function setPushPreference(userId, enabled) {
  if (!userId) return;
  try {
    localStorage.setItem(preferenceKey(userId), enabled ? "on" : "off");
    if (enabled) localStorage.setItem(ownerKey, userId);
    else if (localStorage.getItem(ownerKey) === userId)
      localStorage.removeItem(ownerKey);
  } catch {
    // Private-mode browsers may disable storage; registration is still safe.
  }
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function subscriptionPayload(subscription) {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys?.auth)
    throw new Error("This browser did not provide valid push subscription keys.");
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

async function serviceWorkerRegistration() {
  await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function existingSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) || null;
}

export async function getWebPushConfiguration() {
  return (await api("/push/config")).data;
}

export async function browserHasPushSubscription() {
  return Boolean(await existingSubscription());
}

// A browser origin has one subscription, regardless of how many application
// accounts share it. Revoke foreign subscriptions locally on account changes
// before receiving background notifications for a previous signed-in user.
export async function clearForeignBrowserSubscription(userId) {
  if (!pushSupported() || !userId) return false;
  const owner = getOwner();
  const subscription = await existingSubscription();
  if (!subscription) return false;
  if (owner === userId && pushPreferenceEnabled(userId)) return false;
  // If ownership cannot be proven, do not keep another account's endpoint
  // active on a shared machine. Old server endpoint will expire (404/410).
  await subscription.unsubscribe();
  if (owner) setPushPreference(owner, false);
  return true;
}

export async function browserPushStatus(userId) {
  if (!pushSupported()) return { browserSubscribed: false, linked: false };
  const subscription = await existingSubscription();
  if (!subscription) return { browserSubscribed: false, linked: false };
  if (getOwner() && getOwner() !== userId)
    return { browserSubscribed: false, linked: false };
  const status = (await api("/push/status", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })).data;
  return {
    browserSubscribed: true,
    ...status,
    linked: status.linked && status.currentSession,
  };
}

// Keep this function inside an actual user click/tap callback. Safari requires
// notification permission to be requested while handling a user gesture.
export async function enableBrowserPush(userId, publicKey) {
  if (!pushSupported())
    throw new Error("Web Push is not supported in this browser or context.");
  if (isIosHomeScreenRequired())
    throw new Error("On iPhone, add this website to your Home Screen and open it from there.");
  if (!publicKey) throw new Error("Web Push is not configured on the server.");
  if (Notification.permission === "denied")
    throw new Error("Notifications are blocked. Allow them in browser settings.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notification permission was not granted.");

  const registration = await serviceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  const expectedKey = fromBase64Url(publicKey);
  const currentKey = subscription?.options?.applicationServerKey;
  const keyChanged = currentKey && (
    currentKey.byteLength !== expectedKey.length ||
    Array.from(new Uint8Array(currentKey)).some((v, i) => v !== expectedKey[i])
  );
  if (subscription && (keyChanged ||
      (getOwner() && getOwner() !== userId))) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKey,
    });
  }

  try {
    await api("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscriptionPayload(subscription)),
    });
  } catch (error) {
    await subscription.unsubscribe().catch(() => {});
    // Next attempt obtains a clean browser endpoint.
    throw error;
  }
  setPushPreference(userId, true);
  return true;
}

export async function disableBrowserPush(userId) {
  setPushPreference(userId, false);
  if (!pushSupported()) return;
  const subscription = await existingSubscription();
  if (!subscription) return;
  try {
    await api("/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    await subscription.unsubscribe();
  }
}

export async function sendTestPush(userId) {
  if (!pushSupported()) throw new Error("Web Push is not supported.");
  const subscription = await existingSubscription();
  if (!subscription || !pushPreferenceEnabled(userId))
    throw new Error("Enable browser push notifications before sending a test.");
  return (await api("/push/test", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })).data;
}

// Rebind a valid, previously opted-in browser after a refreshed login.
// Never show browser permission dialogs during automatic synchronization.
export async function syncExistingBrowserPush(userId) {
  if (!pushSupported()) return;
  try {
    if (await clearForeignBrowserSubscription(userId)) return;
    if (!pushPreferenceEnabled(userId) ||
        Notification.permission !== "granted") return;

    const config = await getWebPushConfiguration();
    if (!config.enabled || !config.publicKey) return;

    const expectedKey = fromBase64Url(config.publicKey);
    let subscription = await existingSubscription();

    if (subscription) {
      const previousKey = subscription.options?.applicationServerKey;
      const keyMismatch = previousKey && (
        previousKey.byteLength !== expectedKey.length ||
        Array.from(new Uint8Array(previousKey)).some((v, i) => v !== expectedKey[i])
      );
      let orphaned = false;
      if (!keyMismatch) {
        // If the gateway expired an endpoint (HTTP 404/410), the backend
        // deleted it. Don't re-register that stale endpoint; rotate it.
        const status = (await api("/push/status", {
          method: "POST",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })).data;
        orphaned = !status.linked;
      }
      if (keyMismatch || orphaned) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    if (!subscription) {
      // The user already granted permission. This is a best-effort
      // re-subscription without calling Notification.requestPermission().
      // Browsers that require another gesture can recover from My Account.
      const registration = await serviceWorkerRegistration();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey,
      });
    }
    await api("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscriptionPayload(subscription)),
    });
    setPushPreference(userId, true);
  } catch {
    // Offline or temporarily unavailable API should not break navigation.
    // Users can run the diagnostic test in My Account.
  }
}
