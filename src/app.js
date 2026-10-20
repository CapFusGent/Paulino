// Paulino — app bootstrap and routing.
import { createApi } from './api/supabase.js';
import { createRouter } from './router.js';
import { createAthleteStore } from './store/athlete.js';
import { createCoachStore } from './store/coach.js';
import { applyPalette } from './ui/layout.js';
import { bindMascots } from './ui/paulino.js';
import { on, toast } from './ui/dom.js';

import welcome from './screens/welcome.js';
import install from './screens/install.js';
import athleteHome from './screens/athlete/home.js';
import athleteProgram from './screens/athlete/program.js';
import athleteWorkout from './screens/athlete/workout.js';
import athleteActive from './screens/athlete/active.js';
import athleteResults from './screens/athlete/results.js';
import athleteProgress from './screens/athlete/progress.js';
import athleteSettings from './screens/athlete/settings.js';
import coachHome from './screens/coach/dashboard.js';
import coachEditor from './screens/coach/editor.js';
import coachClient from './screens/coach/client.js';

export const VERSION = '1.0.0';

const config = globalThis.PAULINO_CONFIG || {};
const api = createApi(config);
const coach = createCoachStore(api);
const athletes = new Map();
const root = document.getElementById('app');

applyPalette();

function athlete(token) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  if (!athletes.has(token)) {
    const store = createAthleteStore(api, token);
    store.start();
    athletes.set(token, store);
  }
  return athletes.get(token);
}

let cleanup = null;
let renderSeq = 0;

const app = {
  api, config, coach, athlete, VERSION,
  navigate: (p, o) => router.navigate(p, o),
  back: (fallback) => router.back(fallback),
  /** Re-render the current route in place (keeps scroll position). */
  refresh: () => { app._keepScroll = true; return router.resolve(); },
};

const router = createRouter([
  ['/', welcome],
  ['/install', install],
  ['/a/:token', athleteHome],
  ['/a/:token/program', athleteProgram],
  ['/a/:token/progress', athleteProgress],
  ['/a/:token/settings', athleteSettings],
  ['/a/:token/w/:workoutId', athleteWorkout],
  ['/a/:token/w/:workoutId/go', athleteActive],
  ['/a/:token/w/:workoutId/done', athleteResults],
  ['/coach', coachHome],
  ['/coach/p/:programId', coachEditor],
  ['/coach/c/:clientId', coachClient],
], async (screen, params, query, path) => {
  const seq = ++renderSeq;
  const keepScroll = app._keepScroll;
  app._keepScroll = false;
  const y = window.scrollY;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  const s = screen || notFound;
  try {
    const result = await s(root, params, app, query);
    if (seq !== renderSeq) { if (typeof result === 'function') result(); return; }
    cleanup = result;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="page"><div class="card error-card"><h2>Something went wrong</h2><p>${String(e.message || e).replace(/[<>&]/g, '')}</p><a class="btn" href="#/">Home</a></div></div>`;
  }
  document.title = root.querySelector('h1')?.textContent ? `${root.querySelector('h1').textContent} · Paulino` : 'Paulino';
  if (keepScroll) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
});

function notFound(el) {
  el.innerHTML = `<div class="page"><div class="card"><h1>Page not found</h1><p>That link doesn't lead anywhere.</p><a class="btn" href="#/">Go home</a></div></div>`;
}

// Global delegated actions
on(document, 'click', '[data-action=back]', (e, el) => { e.preventDefault(); router.back(el.dataset.fallback || '/'); });
on(document, 'click', 'a[href^="#/"]', (e, el) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  router.navigate(el.getAttribute('href').slice(1));
});
bindMascots(document);

window.addEventListener('offline', () => toast("You're offline. Everything you log is saved on this device.", { kind: 'warn' }));

// Service worker (offline app shell)
if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version of Paulino is ready. It loads next time you open the app.');
        });
      });
    }).catch(() => {});
  });
}

// PWA install prompt (Chrome/Android)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
});

if (!location.hash) history.replaceState({ depth: 0 }, '', '#/');
router.resolve();
globalThis.__paulino = app; // handy for debugging & tests
