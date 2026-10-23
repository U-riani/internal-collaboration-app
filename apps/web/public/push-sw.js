// Handles background notifications for desktop browsers and installed
// Android/iOS web apps. Foreground realtime updates remain on Socket.IO.
//
// IMPORTANT: Do not silently consume a push event. Safari/iOS requires
// user-visible notification handling and may revoke permission otherwise.
function sameOriginPath(value) {
  try {
    if (typeof value !== "string" || !value.startsWith("/")) return "/notifications";
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin
      ? url.pathname + url.search + url.hash
      : "/notifications";
  } catch {
    return "/notifications";
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      // Even malformed payloads must produce a visible notification.
    }
    try {
      await self.registration.showNotification(
        String(data.title || "GTEX Collaboration").slice(0, 160),
        {
          body: String(data.body || "You have a new notification.").slice(0, 500),
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: typeof data.tag === "string" ? data.tag : undefined,
          data: { url: sameOriginPath(data.url) },
        },
      );
    } catch (error) {
      // Surface errors in the service worker console for browser diagnostics.
      console.error("Unable to display a push notification", error);
      throw error;
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(
    sameOriginPath(event.notification.data?.url),
    self.location.origin,
  ).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window", includeUncontrolled: true,
    });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try {
        await client.navigate(destination);
        return await client.focus();
      } catch {
        // If navigating a window fails, open a fresh one instead.
      }
    }
    return self.clients.openWindow(destination);
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    // A service worker has no access to the logged-in user's bearer token.
    // Ask any open application window to securely re-register the subscription
    // with the authenticated API; closed pages will recover on the next visit.
    const windows = await self.clients.matchAll({
      type: "window", includeUncontrolled: true,
    });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin)
        client.postMessage({ type: "collab:push-subscription-changed" });
    }
  })());
});
