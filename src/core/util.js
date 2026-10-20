// Small shared helpers (dates, ids, numbers). No DOM access in this file so it
// runs unchanged in Node tests.

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // RFC 4122 v4 fallback for very old browsers
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(s) {
  if (!ISO_DATE_RE.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

export const isValidIsoDate = (s) => parseIsoDate(s) !== null;

export function addDays(iso, n) {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysBetween(a, b) {
  const da = parseIsoDate(a), db = parseIsoDate(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

/** Monday of the week containing iso. */
export function weekStart(iso) {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso, { weekday = true, year = false } = {}) {
  const d = parseIsoDate(iso);
  if (!d) return 'No date';
  const parts = [];
  if (weekday) parts.push(WEEKDAYS[d.getDay()]);
  parts.push(`${d.getDate()} ${MONTHS[d.getMonth()]}`);
  if (year) parts.push(String(d.getFullYear()));
  return parts.join(' ');
}

export function relativeDay(iso, today = isoDate()) {
  const n = daysBetween(today, iso);
  if (n === null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return formatDate(iso);
}

export function round(n, step = 2.5, mode = 'nearest') {
  if (!Number.isFinite(n)) return n;
  const q = n / step;
  const r = mode === 'up' ? Math.ceil(q - 1e-9) : mode === 'down' ? Math.floor(q + 1e-9) : Math.round(q);
  return Number((r * step).toFixed(3));
}

export function fmtKg(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function clone(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
