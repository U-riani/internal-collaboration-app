// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api.js", () => ({ api: vi.fn() }));
import { api } from "../src/lib/api.js";
import {
  enableBrowserPush, disableBrowserPush, pushPreferenceEnabled,
  syncExistingBrowserPush,
} from "../src/lib/pushNotifications.js";

const publicKey = Buffer.alloc(65, 1);
publicKey[0] = 4;
const key = publicKey.toString("base64url");
const endpoint = "https://fcm.googleapis.com/fcm/send/abc";

function subscription() {
  return {
    endpoint,
    options: { applicationServerKey: publicKey },
    toJSON: () => ({
      endpoint, expirationTime: null,
      keys: { p256dh: "publickey", auth: "authkey" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

let current, registration, permission;
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
  api.mockResolvedValue({ data: { subscribed: true } });
});

describe("browser Web Push subscription lifecycle", () => {
  it("registers browser keys without sending unsupported expirationTime", async () => {
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

  it("unsubscribes locally and removes server endpoint on disable", async () => {
    await enableBrowserPush("alice", key);
    const saved = current;
    await disableBrowserPush("alice");
    expect(saved.unsubscribe).toHaveBeenCalledOnce();
    expect(pushPreferenceEnabled("alice")).toBe(false);
    expect(api).toHaveBeenLastCalledWith("/push/subscriptions", {
      method: "DELETE", body: JSON.stringify({ endpoint }),
    });
  });

  it("silently rebinds opted-in existing subscriptions after login", async () => {
    await enableBrowserPush("alice", key);
    permission.permission = "granted";
    api.mockClear();
    await syncExistingBrowserPush("alice");
    expect(api).toHaveBeenCalledOnce();
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce();
  });
});
