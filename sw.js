const CACHE_NAME = 'mutalee-v9';
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
  './culture/store.js',
  './culture/ui.js',
  './notify/notify.js',
  './notify/ui.js',
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

// 앱이 지금 화면에 켜져서 포커스돼 있으면 app.js의 로컬 알림이 이미 담당하고 있으니
// 여기서 또 띄우면 잠금화면에 같은 알림이 2번 뜬다. 그래서 포커스된 창이 있으면 건너뛴다.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (clientsList.some((c) => c.focused)) return;

      let data = { title: '무탈이', body: '' };
      if (event.data) {
        try {
          data = event.data.json();
        } catch (e) {
          data = { title: '무탈이', body: event.data.text() };
        }
      }
      await self.registration.showNotification(data.title || '무탈이', {
        body: data.body || '',
        icon: './icons/icon.svg',
        badge: './icons/icon.svg',
        // 잠금화면에선 문구가 잘리므로, 클릭 시 앱에서 전체 문구를 보여줄 수 있게 담아둔다.
        data: { title: data.title || '무탈이', body: data.body || '' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.registration.scope));
      if (existing) {
        // 이미 열린 앱에는 메시지로 전달 → app.js가 전체 문구 모달을 띄운다.
        if (payload && payload.body) existing.postMessage({ type: 'notification-click', ...payload });
        return existing.focus();
      }
      // 새로 여는 경우엔 URL 파라미터로 전달 (postMessage를 받을 리스너가 아직 없으므로).
      const url =
        payload && payload.body ? `./?noti=${encodeURIComponent(JSON.stringify(payload))}` : './';
      return self.clients.openWindow(url);
    })
  );
});
