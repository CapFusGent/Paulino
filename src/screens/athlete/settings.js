// Settings: palette, rest-timer preferences, sync, device.
import { html, raw, on, toast, confirmSheet } from '../../ui/dom.js';
import { athleteNav, topBar, PALETTES, setPalette } from '../../ui/layout.js';
import { prefs, setPrefs } from '../../ui/timer.js';
import { mascot } from '../../ui/paulino.js';
import { MOODS } from '../../ui/paulino-art.js';
import { athleteOr404, live, badgeSlot } from './common.js';
import { SAFETY } from '../../data/messages.js';
import { storage } from '../../store/storage.js';

export function paletteCard() {
  const cur = storage.get('palette', 'original');
  return html`<div class="card"><h2>Colours</h2>
    <div class="palettes" role="group" aria-label="Colour palette">${PALETTES.map((p) => html`<button type="button" class="pal" data-pal="${p.id}" aria-pressed="${p.id === cur}" style="background:${p.bg}">
      <span class="sw"><i style="background:${p.bg}"></i><i style="background:${p.accent}"></i><i style="background:#141414"></i></span>${p.name}</button>`)}</div></div>`;
}

export function bindPalette(root, app) {
  return on(root, 'click', '[data-pal]', (e, el) => {
    setPalette(el.dataset.pal);
    app.refresh();
  });
}

export default function settings(root, params, app) {
  const store = athleteOr404(root, params, app);
  if (!store) return;
  const p = prefs();
  const last = store.state.lastSync ? new Date(store.state.lastSync).toLocaleString() : 'never';
  root.innerHTML = String(html`<div class="page stack">
    ${topBar({ title: 'Settings', right: String(badgeSlot(store)) })}
    ${paletteCard()}
    <div class="card"><h2>Rest timer</h2>
      <label class="check"><input type="checkbox" data-pref="auto" ${p.auto ? raw('checked') : ''}> Start the rest timer when I tick off a set</label>
      <label class="check"><input type="checkbox" data-pref="sound" ${p.sound ? raw('checked') : ''}> Beep and vibrate when rest is over</label>
      <label class="check"><input type="checkbox" data-pref="notify" ${p.notify ? raw('checked') : ''}> Show a notification when rest is over</label>
    </div>
    <div class="card"><h2>Sync</h2>
      <p>Last synced with Paul: <b>${last}</b>. ${store.pendingCount() ? `${store.pendingCount()} change(s) waiting.` : 'Nothing waiting.'}</p>
      <button class="btn" data-action="sync">Sync now</button>
    </div>
    <div class="card"><h2>Meet Paulino</h2><p class="small muted">Tap him for more. These are all his moods.</p>
      <div class="stack-sm">${MOODS.map((m) => raw(mascot({ mood: m, context: { motivational: 'home', focused: 'generic', happy: 'finish', disappointed: 'deviate', concerned: 'pain' }[m], size: 'sm', still: true })))}</div>
      <p class="small muted" style="margin-top:12px">${SAFETY.disclaimer}</p>
    </div>
    <div class="card"><h2>App</h2>
      <p><a href="#/install">How to install Paulino on your phone</a></p>
      <button class="btn btn-ghost" data-forget>Forget this device</button>
      <p class="small muted" style="margin-top:10px">Paulino ${app.VERSION}</p>
    </div>
  </div>${athleteNav(params.token, 'settings')}`);

  const offs = [live(root, store, app, { rerender: false }), bindPalette(root, app)];
  offs.push(on(root, 'change', '[data-pref]', async (e, el) => {
    if (el.dataset.pref === 'notify' && el.checked && 'Notification' in window) {
      const r = await Notification.requestPermission().catch(() => 'denied');
      if (r !== 'granted') { el.checked = false; toast('Notifications are blocked in your browser settings.', { kind: 'warn' }); }
    }
    setPrefs({ [el.dataset.pref]: el.checked });
  }));
  offs.push(on(root, 'click', '[data-forget]', async () => {
    const pending = store.pendingCount();
    const ok = await confirmSheet({ title: 'Forget this device?', text: pending ? `${pending} change(s) haven't reached Paul yet and would be lost.` : 'Your data stays safe with Paul. You can open your link again any time.', ok: 'Forget', danger: pending > 0 });
    if (!ok) return;
    store.forget();
    location.hash = '#/';
    location.reload();
  }));
  return () => offs.forEach((f) => f());
}
