/* AquaKeep service worker — Cache First, Network Fallback.
   Strategy: the entire app shell is pre-cached at install, every GET is
   answered from cache first (zero-Wi-Fi tankside operation), the network is
   touched only on a cache miss, and successful responses are cached
   as-you-go so the shell heals itself after updates. */
const CACHE = "aquakeep-shell-v1";
const SHELL = ["./", "./index.html"];

self.addEventListener("install", (e) => {
  // Pre-cache the full shell so the very first offline boot succeeds.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  // Purge stale shell versions left over from previous releases.
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return; // cloud sync POSTs pass straight to network
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const clone = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, clone)); // cache-as-you-go
        return res;
      }).catch(() => caches.match("./index.html")) // offline deep-link fallback
    )
  );
});

/* Connectivity relay: when the page detects the network returning it posts
   "flush-sync"; the worker fans that out to every open client so each Store
   instance flushes its queued syncQueue mutations to the cloud handler. */
self.addEventListener("message", (e) => {
  if (e.data === "flush-sync")
    self.clients.matchAll().then((cl) => cl.forEach((c) => c.postMessage("sync-now")));
});
