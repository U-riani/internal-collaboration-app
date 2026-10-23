// Background Web Push only. The application's realtime Socket.IO logic
// remains responsible for active-tab notifications and custom sounds.
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = {};
    }

    // Avoid showing a second notification when the user is already looking
    // at the application. Hidden tabs and closed pages still get system push.
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    if (windows.some((client) => client.focused &&
        client.visibilityState === "visible")) return;

    const title = String(data.title || "GTEX Collaboration").slice(0, 160);
    const url = typeof data.url === "string" &&
      /^\/(?!\/)/.test(data.url) ? data.url : "/notifications";
    await self.registration.showNotification(title, {
      body: String(data.body || "").slice(0, 500),
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url;
  const path = typeof rawUrl === "string" && /^\/(?!\/)/.test(rawUrl)
    ? rawUrl : "/notifications";
  const destination = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try {
        await client.navigate(destination);
        return await client.focus();
      } catch {
        // A newly opened window is a safe fallback.
      }
    }
    return self.clients.openWindow(destination);
  })());
});
