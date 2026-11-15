// Service worker do GoTransfer.
// Não guarda páginas autenticadas nem dados: só os ícones e a tela de "sem conexão".
const CACHE = "gotransfer-shell-v1";
const SHELL = ["/offline.html", "/icons/logo-360.png", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
