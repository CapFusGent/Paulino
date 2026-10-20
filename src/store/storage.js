// localStorage wrapper. Every access is guarded: private browsing, full
// storage or disabled storage must never crash the app.
const PREFIX = 'paulino:';
const memory = new Map();

function ls() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const k = `${PREFIX}__probe`;
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
const store = ls();

export const storage = {
  persistent: Boolean(store),
  get(key, fallback = null) {
    try {
      const raw = store ? store.getItem(PREFIX + key) : memory.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (store) store.setItem(PREFIX + key, raw);
      else memory.set(key, raw);
      return true;
    } catch {
      memory.set(key, raw);
      return false;
    }
  },
  remove(key) {
    try { store?.removeItem(PREFIX + key); } catch { /* ignore */ }
    memory.delete(key);
  },
  keys(prefix = '') {
    const out = [];
    try {
      if (store) {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k?.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
        }
      }
    } catch { /* ignore */ }
    for (const k of memory.keys()) if (k.startsWith(prefix) && !out.includes(k)) out.push(k);
    return out;
  },
};
