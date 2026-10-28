// Public shell only. Auth and private API responses never enter Cache Storage.
const CACHE = "neoform-shell-v1";
// Build fills the public asset list so lazy views also open on an installed offline shell.
const CHUNKS = [];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch("/");
      const html = await res.clone().text();
      const paths = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g),
      ].map((m) => m[1]);
      await cache.put("/", res);
      await cache.addAll([
        ...new Set([
          "/manifest.webmanifest",
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
          "/base.css",
          ...paths,
          ...CHUNKS,
        ]),
      ]);
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((k) => k.startsWith("neoform-shell-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  ),
);
function restDeviceDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("neoform-rest-device", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {
        return;
      }
      if (
        payload?.type !== "neoform-rest" ||
        typeof payload.timerId !== "string" ||
        !Number.isSafeInteger(payload.version) ||
        typeof payload.expiresAt !== "number" ||
        Date.now() > payload.expiresAt
      )
        return;
      const database = await restDeviceDatabase();
      let display = false;
      try {
        await new Promise((resolve, reject) => {
          const tx = database.transaction("kv", "readwrite"),
            store = tx.objectStore("kv"),
            read = store.get("active");
          read.onsuccess = () => {
            const device = read.result;
            if (
              !device?.enabled ||
              !device?.allowed ||
              device.timerId !== payload.timerId ||
              device.version !== payload.version
            )
              return;
            const seen = store.get("last-shown");
            seen.onsuccess = () => {
              const key = payload.timerId + ":" + payload.version;
              if (seen.result !== key) {
                store.put(key, "last-shown");
                display = true;
              }
            };
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        database.close();
      }
      if (!display) return;
      await self.registration.showNotification("Rest finished", {
        body: "Ready when you are. Open NEOFORM to continue.",
        tag: "neoform-rest-" + payload.timerId,
        renotify: false,
        icon: "/icon-192.png",
        data: { url: "/", timerId: payload.timerId },
      });
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      windows.forEach((client) =>
        client.postMessage({
          type: "neoform-rest-finished",
          timerId: payload.timerId,
        }),
      );
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows.find(
        (w) => new URL(w.url).origin === self.location.origin,
      );
      if (client) return client.focus();
      return self.clients.openWindow("/");
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/cdn-cgi/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }
  if (
    url.pathname.startsWith("/assets/") ||
    [
      "/base.css",
      "/manifest.webmanifest",
      "/icon.svg",
      "/icon-192.png",
      "/icon-512.png",
    ].includes(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) await cache.put(event.request, res.clone());
        return res;
      })(),
    );
  }
});
