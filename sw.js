const CACHE = "ofs-domains-v45";
const PRECACHE = [
  "./home.html",
  "./auto.html",
  "./bind.html",
  "./drop.html",
  "./bundle.html",
  "./checkout.html",
  "./everything.html",
  "./profile.html",
  "./sauce.html",
  "./live.html",
  "./index.html",
  "./host.html",
  "./site.html",
  "./name.html",
  "./privacy.html",
  "./rights.html",
  "./terms.html",
  "./vault.html",
  "./workspace.html",
  "./app.html",
  "./auth.js",
  "./avatar.js",
  "./host.js",
  "./mail.js",
  "./oauth.js",
  "./pricing.js",
  "./purchases.js",
  "./reef-bg.js",
  "./run.js",
  "./support.js",
  "./sync.js",
  "./zip.js",
  "./assets/js/auto-inline-1.js",
  "./assets/js/bind-inline-1.js",
  "./assets/js/bundle-inline-1.js",
  "./assets/js/checkout-inline-1.js",
  "./assets/js/drop-inline-1.js",
  "./assets/js/home-inline-1.js",
  "./assets/js/host-inline-1.js",
  "./assets/js/index-inline-1.js",
  "./assets/js/live-inline-1.js",
  "./assets/js/name-inline-1.js",
  "./assets/js/profile-inline-1.js",
  "./assets/js/profile-account.js",
  "./assets/js/site-inline-1.js",
  "./assets/js/sauce.js",
  "./assets/js/vault-inline-1.js",
  "./assets/js/workspace.js",
  "./assets/js/app-install.js",
  "./assets/js/intro.js",
  "./assets/css/intro.css",
  "./reef-bg.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-192.png",
  "./assets/icons/maskable-512.png",
  "./dns.txt",
  "./ssl.txt",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
// Network-first for pages, scripts, and styles so fresh HTML never runs against stale JS; cache is the offline fallback.
function networkFirst(request, fallback) {
  return fetch(request).then((res) => {
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(fallback || request, copy));
    }
    return res;
  }).catch(() => caches.match(fallback || request, { ignoreSearch: true }).then((h) => h || Response.error()));
}
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/sandbox/") || url.pathname.startsWith("/s/")) return;
  // "/" and "/index.html" serve home.html, so they share its cache entry.
  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/home.html") {
    e.respondWith(networkFirst(e.request, "./home.html"));
    return;
  }
  if (e.request.mode === "navigate" || /\.(html|js|mjs|css|webmanifest)$/.test(url.pathname)) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  e.respondWith(caches.match(e.request).then((h) => h || fetch(e.request)));
});
