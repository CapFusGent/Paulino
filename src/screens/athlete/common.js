// Helpers shared by the athlete screens.
import { html, raw, esc, on, toast } from '../../ui/dom.js';
import { mascot } from '../../ui/paulino.js';
import { syncBadge, topBar } from '../../ui/layout.js';
import { EXERCISES, exerciseById } from '../../data/exercises.js';

/** Resolve the store for this link, or render the "bad link" page. */
export function athleteOr404(root, params, app) {
  const store = app.athlete(params.token);
  if (!store) {
    invalidLink(root);
    return null;
  }
  return store;
}

export function invalidLink(root) {
  root.innerHTML = String(html`<div class="page no-nav stack">
    ${topBar({ title: 'Link not working' })}
    <div class="card">${raw(mascot({ mood: 'concerned', text: "Hmm, this link doesn't work.", size: 'md' }))}
      <p style="margin-top:14px">This personal link is incomplete or has been replaced. Ask Paul to send you your current link.</p>
      <a class="btn btn-ghost" href="#/">Go to start</a></div>
  </div>`);
}

/**
 * First visit on this device: no cached bundle yet. Shows a loading state
 * (or the error) and re-renders the screen once data arrives.
 * @returns true if the screen can render now.
 */
export function ensureBundle(root, store, app) {
  if (store.state.bundle) return true;
  const s = store.state.syncState;
  if (s === 'invalid') { invalidLink(root); return false; }
  const offline = s === 'offline';
  root.innerHTML = String(html`<div class="page no-nav stack">
    ${topBar({})}
    <div class="card">${raw(mascot({ mood: offline ? 'concerned' : 'motivational', text: offline ? "You're offline!" : 'Loading your program…', size: 'md' }))}
      <p style="margin-top:12px">${offline ? 'Connect to the internet once so Paulino can download your program. After that it works offline.' : 'Hang tight, fetching what Paul planned for you.'}</p>
      ${s === 'error' ? html`<p class="notice notice-danger">${store.state.lastError?.message || 'Could not load.'}</p>` : ''}
      <button class="btn" data-retry>Try again</button></div>
  </div>`);
  root.querySelector('[data-retry]').onclick = () => store.sync();
  const off = store.subscribe(() => {
    if (store.state.bundle || store.state.syncState === 'invalid') { off(); app.refresh(); }
  });
  return false;
}

/**
 * Keep the sync badge live and re-render after a sync brought new data.
 * Pass { rerender: false } on screens with inputs.
 */
export function live(root, store, app, { rerender = true } = {}) {
  let last = store.state.lastSync;
  const off = store.subscribe(() => {
    for (const el of root.querySelectorAll('[data-sync-slot]')) el.innerHTML = String(syncBadge(store));
    for (const n of store.takeNotices()) toast(n.text, { kind: 'warn', ms: 5000 });
    if (rerender && store.state.lastSync !== last && store.state.syncState === 'idle') {
      last = store.state.lastSync;
      if (!root.contains(document.activeElement) || document.activeElement === root || document.activeElement === document.body) app.refresh();
    }
  });
  const offClick = on(root, 'click', '[data-action=sync]', async () => {
    await store.flush();
    const s = store.state.syncState;
    toast(s === 'idle' ? 'All synced with Paul.' : s === 'offline' ? "Still offline. Your data is safe on this device." : 'Sync failed. Will retry.', { kind: s === 'idle' ? 'ok' : 'warn' });
  });
  return () => { off(); offClick(); };
}

export const badgeSlot = (store) => html`<span data-sync-slot>${syncBadge(store)}</span>`;

export function exName(store, id) {
  return exerciseById(id, store.exercises())?.name || store.exercises().find((e) => e.id === id)?.name || id;
}

/** Exercise object with tips: prefer the server copy, fall back to the bundled library. */
export function exInfo(store, id) {
  return store.exercises().find((e) => e.id === id) || EXERCISES.find((e) => e.id === id) || { id, name: id, tips: {} };
}

export { esc };
