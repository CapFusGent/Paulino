// Paulino component: the mascot + a comic speech bubble.
// Tap him (or the bubble) for another line from the same context. A shuffle
// bag per context makes sure lines don't repeat until all have been shown.
import { paulinoSVG } from './paulino-art.js';
import { LINES } from '../data/messages.js';
import { esc, on } from './dom.js';
import { storage } from '../store/storage.js';

const bags = new Map();
let counter = 0;
const registry = new Map(); // element id → { lines, mood }

export function linesFor(mood, context) {
  const group = LINES[mood] || {};
  return group[context] || Object.values(group).flat();
}

/** Pick the next line for key without repeating until the bag is empty. */
export function pickLine(key, lines) {
  if (!lines?.length) return '';
  let bag = bags.get(key);
  if (!bag || bag.items.length === 0 || bag.source !== lines.join('|')) {
    const recent = storage.get(`said.${key}`, null);
    const items = [...lines.keys()].sort(() => Math.random() - 0.5);
    // avoid opening with the line shown last time
    if (items.length > 1 && recent !== null && lines[items[items.length - 1]] === recent) items.unshift(items.pop());
    bag = { items, source: lines.join('|') };
    bags.set(key, bag);
  }
  const line = lines[bag.items.pop()];
  storage.set(`said.${key}`, line);
  return line;
}

function art(mood, id) {
  const imgs = globalThis.PAULINO_CONFIG?.mascotImages;
  if (imgs && imgs[mood]) return `<img src="${esc(imgs[mood])}" alt="Paulino looking ${esc(mood)}" class="paulino-img">`;
  return paulinoSVG(mood, { id });
}

/**
 * @param o.mood      motivational | focused | happy | disappointed | concerned
 * @param o.context   key into LINES[mood] (ignored when o.lines given)
 * @param o.lines     explicit list of lines (e.g. exercise cues)
 * @param o.text      first line to show (defaults to a picked line)
 * @param o.size      sm | md | lg
 * @param o.layout    side | stack
 * @param o.still     no idle animation (active workout)
 */
export function mascot({ mood = 'motivational', context = 'home', lines = null, text = null, size = 'md', layout = 'side', still = false, key = null } = {}) {
  const id = `pl${++counter}`;
  const list = lines || linesFor(mood, context);
  const k = key || `${mood}.${context}`;
  const first = text || pickLine(k, list);
  registry.set(id, { lines: list, key: k });
  const shout = first.length < 34 && /[!?]$/.test(first);
  return `<div class="paulino paulino-${size} layout-${layout} mood-${mood}${still ? ' still' : ''}" data-paulino="${id}">
    <button type="button" class="paulino-figure" data-paulino-next aria-label="Paulino. Tap for another tip">${art(mood, id)}</button>
    <button type="button" class="bubble${shout ? ' shout' : ''}" data-paulino-next aria-live="polite"><span class="bubble-text">${esc(first)}</span></button>
  </div>`;
}

/**
 * A short floating reaction (Paulino + bubble) at the bottom of the screen.
 * Tap to dismiss. Used for quick feedback such as "plan restored".
 */
export function react(mood, text, ms = 3600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'reaction';
  el.setAttribute('role', 'status');
  el.innerHTML = mascot({ mood, text, size: 'sm', still: true });
  root.appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', close);
  setTimeout(close, ms);
}

/** Wire tap-to-cycle for every mascot inside root. */
export function bindMascots(root) {
  return on(root, 'click', '[data-paulino-next]', (e, el) => {
    const box = el.closest('[data-paulino]');
    const entry = registry.get(box?.dataset.paulino);
    if (!entry) return;
    const line = pickLine(entry.key, entry.lines);
    const t = box.querySelector('.bubble-text');
    if (t) t.textContent = line;
    box.querySelector('.bubble')?.classList.toggle('shout', line.length < 34 && /[!?]$/.test(line));
    if (!box.classList.contains('still')) {
      box.classList.remove('bounce');
      void box.offsetWidth;
      box.classList.add('bounce');
    }
  });
}
