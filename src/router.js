// Hash router on top of history.pushState / popstate, so the browser and
// Android back buttons behave and the app works on any static host
// (GitHub Pages has no server-side rewrites).

export function createRouter(routes, onRoute) {
  const compiled = routes.map(([pattern, handler]) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/?#]+)'; })}/?$`);
    return { re, keys, handler, pattern };
  });

  let depth = history.state?.depth ?? 0;

  const current = () => {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = h.split('?');
    return { path, query: new URLSearchParams(query) };
  };

  function resolve() {
    const { path, query } = current();
    for (const r of compiled) {
      const m = path.match(r.re);
      if (m) {
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return onRoute(r.handler, params, query, path);
      }
    }
    return onRoute(null, {}, query, path);
  }

  function navigate(path, { replace = false } = {}) {
    const url = `#${path}`;
    if (url === location.hash && !replace) return resolve();
    if (replace) history.replaceState({ depth }, '', url);
    else history.pushState({ depth: ++depth }, '', url);
    return resolve();
  }

  /** Back within the app if possible, else go to a sensible parent. */
  function back(fallback = '/') {
    if ((history.state?.depth ?? 0) > 0) history.back();
    else navigate(fallback, { replace: true });
  }

  window.addEventListener('popstate', (e) => {
    depth = e.state?.depth ?? 0;
    resolve();
  });

  if (!history.state) history.replaceState({ depth: 0 }, '', location.href);
  return { navigate, back, resolve, current };
}
