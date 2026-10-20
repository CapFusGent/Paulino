// Shared page chrome: top bar, athlete bottom navigation, sync badge, palettes.
import { html, raw } from './dom.js';
import { storage } from '../store/storage.js';

export const PALETTES = [
  { id: 'original', name: 'Original Collage', bg: '#F5EFE3', accent: '#F4B942' },
  { id: 'pink', name: 'Electric Pink', bg: '#F7D6E5', accent: '#EF6497' },
  { id: 'teal', name: 'Teal Power', bg: '#D5F0EA', accent: '#169E96' },
  { id: 'blue', name: 'Blue Energy', bg: '#DCE9FA', accent: '#285BC7' },
];

export function applyPalette(id = storage.get('palette', 'original')) {
  const p = PALETTES.find((x) => x.id === id) || PALETTES[0];
  document.documentElement.dataset.palette = p.id;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', p.bg);
  return p;
}
export function setPalette(id) {
  storage.set('palette', id);
  return applyPalette(id);
}

export const logo = (small = false) =>
  raw(`<span class="logo${small ? ' logo-sm' : ''}" aria-label="Paulino"><span class="logo-tape"></span><span class="logo-word">PAULINO</span></span>`);

export function topBar({ title = '', back = null, right = '', sub = '' } = {}) {
  return html`<header class="topbar">
    ${back ? html`<button class="icon-btn back-btn" data-action="back" data-fallback="${back}" aria-label="Back">←</button>` : html`<a class="topbar-logo" href="#/">${logo(true)}</a>`}
    <div class="topbar-title">${title ? html`<h1>${title}</h1>` : ''}${sub ? html`<p class="topbar-sub">${sub}</p>` : ''}</div>
    <div class="topbar-right">${raw(String(right))}</div>
  </header>`;
}

export function syncBadge(store) {
  const s = store.state.syncState;
  const pending = store.pendingCount();
  let label, cls;
  if (s === 'syncing') { label = 'Syncing…'; cls = 'sync-busy'; }
  else if (s === 'offline') { label = pending ? `Offline · ${pending} waiting` : 'Offline'; cls = 'sync-off'; }
  else if (s === 'error') { label = 'Sync problem'; cls = 'sync-err'; }
  else if (pending) { label = `${pending} to sync`; cls = 'sync-busy'; }
  else { label = 'Synced'; cls = 'sync-ok'; }
  return html`<button class="sync-badge ${cls}" data-action="sync" aria-label="Sync status: ${label}. Tap to sync now"><span class="dot"></span><span class="sync-label">${label}</span></button>`;
}

export function athleteNav(token, active) {
  const item = (key, href, icon, label) =>
    html`<a href="#/a/${token}${href}" class="nav-item${active === key ? ' active' : ''}" ${active === key ? raw('aria-current="page"') : ''}><span class="nav-icon" aria-hidden="true">${raw(icon)}</span><span>${label}</span></a>`;
  return html`<nav class="bottom-nav" aria-label="Main">
    ${item('home', '', ICONS.home, 'Home')}
    ${item('program', '/program', ICONS.program, 'Program')}
    ${item('progress', '/progress', ICONS.progress, 'Progress')}
    ${item('settings', '/settings', ICONS.settings, 'Settings')}
  </nav>`;
}

const svg = (d) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS = {
  home: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  program: svg('<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M4 10h16M8 14h3M8 17h6"/>'),
  progress: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  flame: svg('<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
  share: svg('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  dup: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V4h12"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
  bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  edit: svg('<path d="M4 20h4L20 8l-4-4L4 16z"/>'),
};
