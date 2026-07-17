/* Service worker аудиогида: cache-first + обработка Range-запросов для iOS-аудио.
   Все пути относительные — scope равен каталогу, где лежит sw.js. */
"use strict";

const SHELL_CACHE = "shell-v6";
const SHELL_FILES = [
  "./",
  "index.html",
  "player.html",
  "app.js",
  "styles.css",
  "manifest.json",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "locations/locations.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.headers.has("range")) {
    e.respondWith(rangeResponse(req));
  } else if (url.pathname.endsWith(".json")) {
    e.respondWith(jsonResponse(e));
  } else {
    e.respondWith(cacheFirst(req));
  }
});

/* JSON (библиотека, главы, тайминги): кэш отдаём МГНОВЕННО, сеть — фоном
   для обновления копии. Иначе при выключенной или медленной сети (Китай!)
   запрос висит и приложение застревает на «Загружаю…». */
async function jsonResponse(e) {
  const req = e.request;
  const cached = await caches.match(req);

  const refresh = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cached ? 7000 : 20000);
    try {
      // no-cache: ревалидируем у сервера, а не берём из HTTP-кэша браузера
      const resp = await fetch(req, { cache: "no-cache", signal: ctrl.signal });
      if (resp.ok) {
        // освежаем копию в том кэше, где файл уже лежит (shell или loc-*)
        for (const name of await caches.keys()) {
          const c = await caches.open(name);
          if (await c.match(req)) { await c.put(req, resp.clone()); break; }
        }
      }
      return resp;
    } finally {
      clearTimeout(timer);
    }
  })();

  if (cached) {
    e.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  try {
    return await refresh;
  } catch (err) {
    return new Response("offline", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: false });
  if (cached) return cached;
  try {
    return await fetch(req);
  } catch (err) {
    // офлайн и в кэше нет: для навигации отдаём библиотеку из shell-кэша
    if (req.mode === "navigate") {
      const shell = await caches.match("index.html");
      if (shell) return shell;
    }
    return new Response("offline", { status: 503, statusText: "Offline" });
  }
}

/* iOS Safari запрашивает аудио Range-запросами; отвечаем 206 со срезом
   закэшированного файла, иначе офлайн-аудио не заиграет и сломается перемотка. */
async function rangeResponse(req) {
  const cached = await caches.match(req.url);
  if (!cached) {
    try {
      return await fetch(req);
    } catch (err) {
      return new Response("offline", { status: 503, statusText: "Offline" });
    }
  }

  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get("range") || "");
  let start = m ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;

  if (start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  const chunk = buf.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(chunk.byteLength),
      "Accept-Ranges": "bytes",
    },
  });
}
