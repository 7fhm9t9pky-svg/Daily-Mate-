// Service worker: riceve le notifiche push anche quando l'app e' chiusa.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Daily Mate', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Daily Mate', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.id || undefined, data: { page: d.page || '' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = '/#/' + (e.notification.data?.page || '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
