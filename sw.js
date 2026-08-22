const CACHE_NAME = "compukit-cache-v26";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia Network-First para archivos locales.
// Las peticiones a Google Apps Script y sus redirecciones NUNCA son cacheadas por el Service Worker.
self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  const isGoogleScript = url.includes("script.google.com") || 
                         url.includes("googleusercontent.com") ||
                         url.includes("script.google");

  if (event.request.method === "GET" && !isGoogleScript) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (event.request.headers.get("accept")?.includes("text/html")) {
              return caches.match("./index.html");
            }
          });
        })
    );
  }
});


