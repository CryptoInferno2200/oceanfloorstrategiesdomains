const CACHE = "ofs-domains-v24";
const PRECACHE = [
  "./home.html",
  "./auto.html",
  "./bind.html",
  "./drop.html",
  "./bundle.html",
  "./checkout.html",
  "./everything.html",
  "./profile.html",
  "./reef.html",
  "./sauce.html",
  "./live.html",
  "./index.html",
  "./verify.html",
  "./reset.html",
  "./host.html",
  "./site.html",
  "./name.html",
  "./oauth.html",
  "./privacy.html",
  "./rights.html",
  "./vault.html",
  "./auth.js",
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
  "./reef-bg.css",
  "./manifest.webmanifest",
  "./icon.svg",
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
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith(".html") || url.pathname === "/") {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((h) => h || fetch(e.request)));
});
