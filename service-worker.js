const CACHE = 'inspection-v62-print-layout';
const ASSETS = [
  './', './index.html', './move-in.html', './move-out.html', './schedule.html', './app-theme.css?v=62', './app-enhancements.js?v=62',
  './inspection-reports.js?v=62', './inspector-flow.js?v=62', './inspector-flow.css?v=62',
  './visit-model.js?v=62', './field-guide.js?v=62', './field-guide.css?v=62', './office-model.js?v=62', './offline-office.js?v=62', './offline-office.css?v=62', './vendor/jszip.min.js?v=62',
  './manifest.json', './manifest-in.json', './manifest-out.json', './voice-worker.js',
  './icon-192.png', './icon-512.png', './cimco-logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return res;
      })
    )
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
