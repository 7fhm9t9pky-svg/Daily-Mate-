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

// ---- Uso offline: copia dell'app sul telefono (prima la rete, se il server e' spento si usa la copia) ----
const SHELL = 'dm-shell-v1';
const keyOf = r => (r.mode === 'navigate' ? '/' : r);

self.addEventListener('message', e => {
  const urls = e.data?.cache; if (!Array.isArray(urls)) return;
  e.waitUntil(caches.open(SHELL).then(async c => {
    for (const u of urls) { try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u === location.origin + '/' ? '/' : u, r); } } catch { /* pazienza */ } }
  }));
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    let bad = null;
    try {
      const res = await Promise.race([fetch(r), new Promise((_, no) => setTimeout(() => no(new Error('lento')), 8000))]);
      if (res.ok) { c.put(keyOf(r), res.clone()); return res; }
      if (res.status < 500) return res;
      bad = res;
    } catch { /* server spento o rete assente */ }
    const hit = await c.match(keyOf(r)) || await c.match(r, { ignoreSearch: true });
    return hit || bad || Response.error();
  })());
});
