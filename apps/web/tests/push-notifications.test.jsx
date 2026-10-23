// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api.js", () => ({ api: vi.fn() }));
import { api } from "../src/lib/api.js";
import {
  browserPushStatus,
  clearForeignBrowserSubscription,
  enableBrowserPush,
  disableBrowserPush,
  pushPreferenceEnabled,
  sendTestPush,
  syncExistingBrowserPush,
} from "../src/lib/pushNotifications.js";

const publicKey = Buffer.alloc(65, 1);
publicKey[0] = 4;
const key = publicKey.toString("base64url");
const endpoint = "https://fcm.googleapis.com/fcm/send/abc";

let current;
function subscription() {
  return {
    endpoint,
    options: { applicationServerKey: publicKey },
    toJSON: () => ({
      endpoint, expirationTime: null,
      keys: { p256dh: "publickey", auth: "authkey" },
    }),
    unsubscribe: vi.fn(async () => {
      current = null;
      return true;
    }),
  };
}

let registration, permission;
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  Object.defineProperty(window, "isSecureContext", {
    configurable: true, value: true,
  });
  permission = { permission: "default", requestPermission: vi.fn(async () => {
    permission.permission = "granted";
    return "granted";
  }) };
  vi.stubGlobal("Notification", permission);
  vi.stubGlobal("PushManager", class {});
  current = null;
  registration = {
    pushManager: {
      getSubscription: vi.fn(async () => current),
      subscribe: vi.fn(async () => {
        current = subscription();
        return current;
      }),
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(async () => registration),
    },
  });
  api.mockImplementation(async (path) => {
    if (path === "/push/config")
      return { data: { enabled: true, publicKey: key } };
    if (path === "/push/status")
      return { data: { linked: true, currentSession: true } };
    return { data: { subscribed: true } };
  });
});

describe("browser Web Push subscription lifecycle", () => {
  it("registers the browser keys without unsupported expirationTime", async () => {
    await enableBrowserPush("alice", key);
    expect(permission.requestPermission).toHaveBeenCalledOnce();
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce();
    expect(pushPreferenceEnabled("alice")).toBe(true);
    const [path, options] = api.mock.calls[0];
    expect(path).toBe("/push/subscriptions");
    expect(JSON.parse(options.body)).toEqual({
      endpoint, keys: { p256dh: "publickey", auth: "authkey" },
    });
  });

  it("unsubscribes locally and removes the server endpoint on disable", async () => {
    await enableBrowserPush("alice", key);
    const saved = current;
    await disableBrowserPush("alice");
    expect(saved.unsubscribe).toHaveBeenCalledOnce();
    expect(pushPreferenceEnabled("alice")).toBe(false);
    expect(api).toHaveBeenLastCalledWith("/push/subscriptions", {
      method: "DELETE", body: JSON.stringify({ endpoint }),
    });
  });

  it("silently rebinds a previously opted-in browser after login", async () => {
    await enableBrowserPush("alice", key);
    permission.permission = "granted";
    api.mockClear();
    await syncExistingBrowserPush("alice");
    expect(api.mock.calls.map(([path]) => path)).toEqual([
      "/push/config", "/push/status", "/push/subscriptions",
    ]);
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce();
  });

  it("revokes a foreign subscription when another account signs in", async () => {
    await enableBrowserPush("alice", key);
    const first = current;
    expect(await clearForeignBrowserSubscription("bob")).toBe(true);
    expect(first.unsubscribe).toHaveBeenCalledOnce();
    expect(pushPreferenceEnabled("alice")).toBe(false);
    expect(await clearForeignBrowserSubscription("bob")).toBe(false);
  });

  it("reports registration state and sends a direct diagnostic push", async () => {
    await enableBrowserPush("alice", key);
    api.mockResolvedValueOnce({ data: { linked: true, currentSession: true } });
    const status = await browserPushStatus("alice");
    expect(status.browserSubscribed).toBe(true);
    expect(status.linked).toBe(true);
    expect(api).toHaveBeenLastCalledWith("/push/status", {
      method: "POST", body: JSON.stringify({ endpoint }),
    });

    api.mockResolvedValueOnce({ data: { gatewayAccepted: true, status: 201 } });
    const outcome = await sendTestPush("alice");
    expect(outcome.gatewayAccepted).toBe(true);
    expect(api).toHaveBeenLastCalledWith("/push/test", {
      method: "POST", body: JSON.stringify({ endpoint }),
    });
  });

  it("renews an expired or server-deleted endpoint on the next visit", async () => {
    await enableBrowserPush("alice", key);
    const expired = current;
    api.mockClear();
    api.mockImplementation(async (path) => {
      if (path === "/push/config")
        return { data: { enabled: true, publicKey: key } };
      if (path === "/push/status")
        return { data: { linked: false, currentSession: false } };
      return { data: { subscribed: true } };
    });
    permission.permission = "granted";
    permission.requestPermission.mockClear();
    await syncExistingBrowserPush("alice");
    expect(expired.unsubscribe).toHaveBeenCalledOnce();
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(2);
    expect(permission.requestPermission).not.toHaveBeenCalled();
    expect(api.mock.calls.map(([path]) => path)).toEqual([
      "/push/config", "/push/status", "/push/subscriptions",
    ]);
  });

  it("does not prompt for push permission in a non-user-gesture sync", async () => {
    await enableBrowserPush("alice", key);
    permission.requestPermission.mockClear();
    permission.permission = "granted";
    await syncExistingBrowserPush("alice");
    expect(permission.requestPermission).not.toHaveBeenCalled();
  });
});
