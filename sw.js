// Paulino service worker — versioned offline app shell.
// Bump VERSION on every release: old caches are deleted on activate.
// scripts/validate-data.mjs fails if a file in src/ is missing from SHELL.
const VERSION = 'paulino-v1.0.0';
const SHELL_CACHE = `${VERSION}-shell`;
const FONT_CACHE = 'paulino-fonts-v1';
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

const SHELL = [
  './',
  'index.html',
  'config.js',
  'manifest.webmanifest',
  'styles/app.css',
  'assets/icons/icon-32.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon.svg',
  'src/app.js',
  'src/router.js',
  'src/api/supabase.js',
  'src/core/effective.js',
  'src/core/prescription.js',
  'src/core/progression.js',
  'src/core/stats.js',
  'src/core/templates.js',
  'src/core/util.js',
  'src/core/validation.js',
  'src/data/exercises.js',
  'src/data/messages.js',
  'src/screens/install.js',
  'src/screens/welcome.js',
  'src/screens/athlete/active.js',
  'src/screens/athlete/common.js',
  'src/screens/athlete/home.js',
  'src/screens/athlete/modify.js',
  'src/screens/athlete/program.js',
  'src/screens/athlete/progress.js',
  'src/screens/athlete/results.js',
  'src/screens/athlete/settings.js',
  'src/screens/athlete/workout.js',
  'src/screens/coach/client.js',
  'src/screens/coach/dashboard.js',
  'src/screens/coach/editor.js',
  'src/screens/coach/share.js',
  'src/store/athlete.js',
  'src/store/coach.js',
  'src/store/storage.js',
  'src/ui/charts.js',
  'src/ui/dom.js',
  'src/ui/layout.js',
  'src/ui/paulino-art.js',
  'src/ui/paulino.js',
  'src/ui/timer.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isApi = (url) => url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/') || url.hostname.endsWith('.supabase.co');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isApi(url)) return; // data is never served from the SW cache

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigations & config: network first (fresh deploys), cached shell offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('/config.js')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL_CACHE)).put(req.mode === 'navigate' ? 'index.html' : req, res.clone());
        return res;
      } catch {
        const c = await caches.open(SHELL_CACHE);
        return (await c.match(req.mode === 'navigate' ? 'index.html' : req)) || (await c.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // Local development: network first so edits show up, cache only as offline fallback.
  if (DEV) {
    event.respondWith((async () => {
      const c = await caches.open(SHELL_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        return (await c.match(req, { ignoreSearch: true })) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith((async () => {
    const c = await caches.open(SHELL_CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await fresh) || new Response('Offline', { status: 503 });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
