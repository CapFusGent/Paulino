// Minimal Supabase client over fetch: Auth (password) + PostgREST RPC.
// No SDK, no build step. Everything the app does goes through RPC functions
// defined in supabase/migrations, so the server is the only gatekeeper.
import { storage } from '../store/storage.js';

export class ApiError extends Error {
  constructor(message, { code = null, status = 0, details = null } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
  get offline() { return this.status === 0; }
}

const SESSION_KEY = 'coach.session';

export function createApi({ supabaseUrl, supabaseAnonKey }) {
  const base = (supabaseUrl || '').replace(/\/+$/, '');
  const configured = Boolean(base && supabaseAnonKey);
  const keyIsJwt = /^eyJ/.test(supabaseAnonKey || '');
  let session = storage.get(SESSION_KEY, null);
  let refreshing = null;
  const listeners = new Set();

  const setSession = (s) => {
    session = s;
    if (s) storage.set(SESSION_KEY, s); else storage.remove(SESSION_KEY);
    listeners.forEach((f) => f(s));
  };

  async function request(path, { method = 'POST', body, token } = {}) {
    if (!configured) throw new ApiError('The app is not connected to a backend yet (see config.js).', { code: 'not_configured' });
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          apikey: supabaseAnonKey,
          // Legacy anon keys are JWTs and may double as the bearer token; the newer
          // sb_publishable_ keys are not JWTs and must only be sent as `apikey`.
          ...(token || keyIsJwt ? { Authorization: `Bearer ${token || supabaseAnonKey}` } : {}),
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new ApiError('You seem to be offline.', { code: 'network', status: 0 });
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = data?.message || data?.msg || data?.error_description || data?.error || `Request failed (${res.status})`;
      throw new ApiError(msg, { code: data?.code || data?.error_code || null, status: res.status, details: data?.details || null });
    }
    return data;
  }

  const expiresSoon = (s) => !s?.expires_at || s.expires_at * 1000 < Date.now() + 60_000;

  async function refresh() {
    if (!session?.refresh_token) throw new ApiError('Please sign in again.', { code: 'not_authenticated', status: 401 });
    refreshing ||= request('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } })
      .then((s) => { setSession(normalizeSession(s)); return session; })
      .catch((e) => { if (!e.offline) setSession(null); throw e; })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  function normalizeSession(s) {
    if (!s?.access_token) return null;
    return { ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) };
  }

  return {
    configured,
    get session() { return session; },
    onSession(f) { listeners.add(f); return () => listeners.delete(f); },

    async signIn(email, password) {
      const s = await request('/auth/v1/token?grant_type=password', { body: { email, password } });
      setSession(normalizeSession(s));
      return session;
    },
    async signUp(email, password) {
      const s = await request('/auth/v1/signup', { body: { email, password } });
      if (s?.access_token) { setSession(normalizeSession(s)); return { session, needsConfirmation: false }; }
      return { session: null, needsConfirmation: true };
    },
    async signOut() {
      const token = session?.access_token;
      setSession(null);
      if (token) await request('/auth/v1/logout', { token }).catch(() => {});
    },

    /** Call an RPC as the anonymous role (athlete link functions). */
    rpcAnon(fn, args = {}) {
      return request(`/rest/v1/rpc/${fn}`, { body: args });
    },

    /** Call an RPC as the signed-in coach; refreshes the access token as needed. */
    async rpcCoach(fn, args = {}) {
      if (!session) throw new ApiError('Please sign in.', { code: 'not_authenticated', status: 401 });
      if (expiresSoon(session)) await refresh();
      try {
        return await request(`/rest/v1/rpc/${fn}`, { body: args, token: session.access_token });
      } catch (e) {
        if (e.status === 401 || /jwt/i.test(e.message)) {
          await refresh();
          return request(`/rest/v1/rpc/${fn}`, { body: args, token: session.access_token });
        }
        throw e;
      }
    },
  };
}
