const CACHE_NAME = 'mutalee-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/tokens.css',
  './styles/app.css',
  './app.js',
  './reminders/core.js',
  './reminders/store.js',
  './reminders/ui.js',
  './culture/core.js',
  './culture/ui.js',
  './notify/notify.js',
  './data/categories.json',
  './data/personas.json',
  './data/culture-catalog.json',
  './data/default-rules.json',
  './data/push-config.json',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// 네트워크 우선: 온라인이면 항상 최신 파일을 받고, 오프라인일 때만 캐시로 대체한다.
// (예전엔 캐시 우선이라 배포해도 새 버전이 안 보이는 문제가 있었음)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: '무탈이', body: '' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: '무탈이', body: event.data.text() };
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '무탈이', {
      body: data.body || '',
      icon: './icons/icon.svg',
      badge: './icons/icon.svg',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.registration.scope));
      if (existing) return existing.focus();
      return self.clients.openWindow('./');
    })
  );
});
