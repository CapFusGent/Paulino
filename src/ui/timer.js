// Rest timer. State lives in storage (absolute end time), so it survives
// reloads, navigation and the app being closed and reopened.
import { storage } from '../store/storage.js';
import { ICONS } from './layout.js';
import { esc } from './dom.js';

const KEY = 'timer';
const read = () => storage.get(KEY, { duration: 120, endsAt: null, remaining: 120, running: false, label: '' });
const write = (s) => storage.set(KEY, s);
export const prefs = () => storage.get('timer.prefs', { auto: true, sound: true, notify: false });
export const setPrefs = (p) => storage.set('timer.prefs', { ...prefs(), ...p });

let audio = null;
function beep() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = i === 2 ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.2);
    });
  } catch { /* no audio */ }
}

async function notify(text) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification('Paulino', { body: text, icon: 'assets/icons/icon-192.png', tag: 'rest', renotify: true });
    else new Notification('Paulino', { body: text });
  } catch { /* ignore */ }
}

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;

/** Mount the timer bar into `el`. Returns { start(seconds, label), destroy() }. */
export function mountTimer(el) {
  let s = read();
  let tick = null;
  let fired = false;

  const remaining = () => (s.running && s.endsAt ? Math.ceil((s.endsAt - Date.now()) / 1000) : s.remaining);

  function render() {
    const r = remaining();
    const p = prefs();
    el.innerHTML = `<div class="timer-bar" role="timer" aria-label="Rest timer">
      <div class="t-main"><span class="t-time ${r <= 0 && s.running ? 'ring' : ''}" data-t>${r <= 0 && s.running ? 'GO!' : fmt(r)}</span>
        <span class="t-label">${s.running ? (r <= 0 ? 'Rest is over' : 'Resting') : 'Rest timer'}${s.label ? ` · ${esc(s.label)}` : ''}</span></div>
      <button class="icon-btn" data-t-minus aria-label="15 seconds less">−</button>
      <button class="icon-btn" data-t-plus aria-label="15 seconds more">+</button>
      <button class="icon-btn" data-t-toggle aria-label="${s.running ? 'Pause' : 'Start'} rest timer">${s.running ? '❚❚' : '▶'}</button>
      <button class="icon-btn" data-t-reset aria-label="Reset rest timer">↺</button>
      <button class="icon-btn" data-t-bell aria-pressed="${p.sound || p.notify}" aria-label="Sound and notification when rest is over">${ICONS.bell}</button>
    </div>`;
  }

  function loop() {
    clearInterval(tick);
    if (!s.running) return;
    tick = setInterval(() => {
      const r = remaining();
      const t = el.querySelector('[data-t]');
      if (t) { t.textContent = r <= 0 ? 'GO!' : fmt(r); t.classList.toggle('ring', r <= 0); }
      if (r <= 0 && !fired) {
        fired = true;
        const p = prefs();
        if (p.sound) beep();
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
        if (p.notify && document.visibilityState !== 'visible') notify('Rest is over. Next set!');
        render();
      }
      if (r < -90) { s = { ...s, running: false, endsAt: null, remaining: s.duration }; write(s); render(); clearInterval(tick); }
    }, 250);
  }

  function start(seconds = s.duration, label = s.label) {
    s = { duration: seconds, remaining: seconds, endsAt: Date.now() + seconds * 1000, running: true, label };
    fired = false;
    write(s); render(); loop();
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-t-toggle')) {
      if (s.running) s = { ...s, running: false, remaining: Math.max(0, remaining()), endsAt: null };
      else {
        const r = s.remaining > 0 ? s.remaining : s.duration;
        s = { ...s, running: true, endsAt: Date.now() + r * 1000 };
        fired = false;
      }
    } else if (b.hasAttribute('data-t-reset')) {
      s = { ...s, running: false, endsAt: null, remaining: s.duration };
    } else if (b.hasAttribute('data-t-plus') || b.hasAttribute('data-t-minus')) {
      const d = b.hasAttribute('data-t-plus') ? 15 : -15;
      if (s.running) s = { ...s, endsAt: Math.max(Date.now(), s.endsAt + d * 1000) };
      else s = { ...s, remaining: Math.max(0, s.remaining + d), duration: Math.max(15, s.duration + d) };
    } else if (b.hasAttribute('data-t-bell')) {
      const p = prefs();
      const on = !(p.sound || p.notify);
      let notifyOk = false;
      if (on && 'Notification' in window) {
        try { notifyOk = (await Notification.requestPermission()) === 'granted'; } catch { notifyOk = false; }
      }
      setPrefs({ sound: on, notify: on && notifyOk });
    } else return;
    write(s); render(); loop();
  });

  render();
  loop();
  return { start, destroy: () => clearInterval(tick) };
}
