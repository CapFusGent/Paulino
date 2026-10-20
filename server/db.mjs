// In-process Postgres (PGlite) that runs the real Supabase migrations, plus the
// small amount of Supabase behaviour the app relies on: JWT-scoped roles,
// auth.uid(), and RPC calls with named arguments.
//
// Used by the local dev server and by the automated tests. It is NOT a
// replacement for Supabase in production.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';

const ROOT = new URL('..', import.meta.url);
const MIGRATIONS_DIR = new URL('supabase/migrations/', ROOT);
const STUB = new URL('supabase/dev/auth_stub.sql', ROOT);

export const DEV_JWT_SECRET = 'paulino-local-dev-secret-not-for-production-use';

// ---------------------------------------------------------------------------
// JWT (HS256) — enough to mirror Supabase's access tokens locally
// ---------------------------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');
export function signJwt(payload, secret = DEV_JWT_SECRET) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export function verifyJwt(token, secret = DEV_JWT_SECRET) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
export const ANON_KEY = signJwt({ iss: 'paulino-dev', role: 'anon', iat: 1760000000, exp: 4102444800 });

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
export async function createDatabase({ dataDir } = {}) {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;

  const migrated = await pg.query(`select to_regclass('public.programs') as t`);
  if (!migrated.rows[0].t) {
    await pg.exec(readFileSync(STUB, 'utf8'));
    for (const f of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      await pg.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'));
    }
  }

  // Signature cache for named-argument RPC calls.
  const sigs = new Map();
  const { rows } = await pg.query(`
    select p.proname as name,
           coalesce(p.proargnames, '{}') as argnames,
           array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t) as argtypes
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'`);
  for (const r of rows) sigs.set(r.name, r.argnames.map((n, i) => ({ name: n, type: r.argtypes[i] })));

  // PGlite has a single connection: serialise every request.
  let queue = Promise.resolve();
  const exclusive = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  /** Call public.<fn>(args) as the role described by `claims` (anon or authenticated). */
  function rpc(fn, args = {}, claims = { role: 'anon' }) {
    return exclusive(async () => {
      const sig = sigs.get(fn);
      if (!sig) throw Object.assign(new Error(`Could not find the function public.${fn}`), { code: 'PGRST202', status: 404 });
      const role = claims.role === 'authenticated' ? 'authenticated' : 'anon';
      const params = [];
      const named = [];
      for (const [k, v] of Object.entries(args || {})) {
        const a = sig.find((s) => s.name === k);
        if (!a) throw Object.assign(new Error(`Unknown argument ${k} for ${fn}`), { code: 'PGRST202', status: 404 });
        params.push(v === null || v === undefined ? null : a.type === 'jsonb' ? JSON.stringify(v) : String(v));
        named.push(`${k} => $${params.length}::${a.type}`);
      }
      return pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [claims.sub || '']);
        await tx.exec(`set local role ${role}`);
        const res = await tx.query(`select public.${fn}(${named.join(', ')}) as r`, params);
        return res.rows[0].r;
      });
    });
  }

  /** Superuser query — tests and seeding only. */
  const admin = (sql, params) => exclusive(() => pg.query(sql, params));

  // --- auth -----------------------------------------------------------------
  const refreshTokens = new Map();
  const hash = (pw) => {
    const salt = randomBytes(16);
    return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`;
  };
  const check = (pw, stored) => {
    const [salt, h] = stored.split(':');
    const got = scryptSync(pw, Buffer.from(salt, 'hex'), 32);
    return timingSafeEqual(got, Buffer.from(h, 'hex'));
  };
  const session = (user) => {
    const now = Math.floor(Date.now() / 1000);
    const access_token = signJwt({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
    const refresh_token = randomBytes(24).toString('hex');
    refreshTokens.set(refresh_token, user);
    return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token, user: { id: user.id, email: user.email } };
  };

  const auth = {
    async signUp(email, password) {
      email = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw authError(400, 'validation_failed', 'Unable to validate email address: invalid format');
      if (String(password || '').length < 8) throw authError(422, 'weak_password', 'Password should be at least 8 characters.');
      const exists = await admin('select 1 from auth.users where email = $1', [email]);
      if (exists.rows.length) throw authError(422, 'user_already_exists', 'User already registered');
      const id = randomUUID();
      await admin('insert into auth.users (id, email, encrypted_password) values ($1, $2, $3)', [id, email, hash(password)]);
      return session({ id, email });
    },
    async signIn(email, password) {
      email = String(email || '').trim().toLowerCase();
      const r = await admin('select id, email, encrypted_password from auth.users where email = $1', [email]);
      const u = r.rows[0];
      if (!u || !check(String(password || ''), u.encrypted_password)) throw authError(400, 'invalid_credentials', 'Invalid login credentials');
      return session(u);
    },
    refresh(token) {
      const u = refreshTokens.get(token);
      if (!u) throw authError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refreshTokens.delete(token);
      return session(u);
    },
    logout(accessClaims) {
      for (const [k, u] of refreshTokens) if (u.id === accessClaims?.sub) refreshTokens.delete(k);
    },
  };

  return { pg, rpc, admin, auth, close: () => pg.close() };
}

function authError(status, code, msg) {
  return Object.assign(new Error(msg), { status, authCode: code });
}

/** Map a Postgres error to the HTTP status PostgREST would use. */
export function httpStatusFor(err) {
  if (err.status) return err.status;
  const c = err.code || '';
  if (/^PT\d{3}$/.test(c)) return Number(c.slice(2));
  if (c === '28000' || c === '42501') return 403;
  if (c === 'P0002') return 404;
  if (c === '23505' || c === '23503') return 409;
  return 400;
}
