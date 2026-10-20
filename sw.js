// Офлайн-режим: всё приложение кешируется при первой загрузке.
// При изменении файлов увеличьте VERSION — клиенты получат обновление.
const VERSION = 'incation-v10';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/ui.js',
  'js/presets.js',
  'js/gl.js',
  'js/renderer.js',
  'js/compare.js',
  'js/fronts.js',
  'js/export.js',
  'js/sample.js',
  'js/shaders/common.js',
  'js/shaders/field.js',
  'js/shaders/blur.js',
  'js/shaders/compose.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Сначала сеть (с проверкой HTTP-кеша), кеш — только без сети: новая версия видна сразу.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) || Response.error();
      }
    }),
  );
});
