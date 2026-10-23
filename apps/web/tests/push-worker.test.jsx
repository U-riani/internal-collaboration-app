// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const client = {
    url: "https://collab.example/dashboard",
    focused: true,
    visibilityState: "visible",
    navigate: vi.fn(async (url) => ({ url, focus: vi.fn() })),
    focus: vi.fn(),
    postMessage: vi.fn(),
  };
  const self = {
    location: { origin: "https://collab.example" },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => [client]),
      openWindow: vi.fn(async () => ({})),
    },
    addEventListener(name, fn) { listeners[name] = fn; },
  };
  vm.runInNewContext(
    readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8"),
    { self, URL, console },
    { filename: "push-sw.js" },
  );
  return { listeners, self, client, showNotification };
}

function dispatch(listener, data) {
  const settled = [];
  const event = {
    data: data === null ? null : { json: () => data },
    waitUntil(promise) { settled.push(promise); },
  };
  listener(event);
  return Promise.all(settled);
}

describe("push service worker behavior", () => {
  it("always shows a system notification even with a focused tab (iOS requirement)", async () => {
    const { listeners, showNotification } = worker();
    await dispatch(listeners.push, {
      title: "New task", body: "Review the report",
      url: "/tasks?task=123", tag: "test",
    });
    expect(showNotification).toHaveBeenCalledOnce();
    expect(showNotification.mock.calls[0][0]).toBe("New task");
    expect(showNotification.mock.calls[0][1].data.url).toBe("/tasks?task=123");
  });

  it("does not silently swallow an empty push event", async () => {
    const { listeners, showNotification } = worker();
    await dispatch(listeners.push, null);
    expect(showNotification).toHaveBeenCalledOnce();
    expect(showNotification.mock.calls[0][0]).toBe("GTEX Collaboration");
  });

  it("rejects external URLs before creating a notification", async () => {
    const { listeners, showNotification } = worker();
    await dispatch(listeners.push, { title: "Hello", url: "//evil.example" });
    expect(showNotification.mock.calls[0][1].data.url).toBe("/notifications");
  });

  it("informs open application clients when the push subscription changes", async () => {
    const { listeners, client } = worker();
    await dispatch(listeners.pushsubscriptionchange, null);
    expect(client.postMessage).toHaveBeenCalledWith({
      type: "collab:push-subscription-changed",
    });
  });

  it("opens the intended same-origin deep link on notification click", async () => {
    const { listeners, self, client } = worker();
    const settled = [];
    listeners.notificationclick({
      notification: {
        data: { url: "/approvals?request=test" },
        close: vi.fn(),
      },
      waitUntil(p) { settled.push(p); },
    });
    await Promise.all(settled);
    expect(client.navigate).toHaveBeenCalledWith(
      "https://collab.example/approvals?request=test",
    );
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });
});
