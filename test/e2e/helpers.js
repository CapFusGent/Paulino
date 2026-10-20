// Test helpers: talk to the dev server's Supabase-compatible API directly to
// set up data fast, and small page utilities.
import { expect } from '@playwright/test';
import { novice5x5 } from '../../src/core/templates.js';
import { isoDate } from '../../src/core/util.js';

const BASE = 'http://localhost:4321';
let anonKey = null;

async function key() {
  if (anonKey) return anonKey;
  const js = await (await fetch(`${BASE}/config.js`)).text();
  anonKey = js.match(/"supabaseAnonKey":\s*"([^"]+)"/)[1];
  return anonKey;
}

async function call(path, body, token) {
  const k = await key();
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { apikey: k, Authorization: `Bearer ${token || k}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

let n = 0;
export const uniqueEmail = () => `coach${Date.now()}${n++}@paulino.test`;
export const TEST_PASSWORD = 'e2e-test-password-1';

/** A coach with one athlete and an active 5×5 program that started two weeks ago. */
export async function seedCoach({ weeks = 4, athlete = 'Leo' } = {}) {
  const email = uniqueEmail();
  const s = await call('/auth/v1/signup', { email, password: TEST_PASSWORD });
  const rpc = (fn, args = {}) => call(`/rest/v1/rpc/${fn}`, args, s.access_token);
  await rpc('coach_me', { p_display_name: 'Paul' });
  const client = await rpc('coach_create_client', { p_display_name: athlete });
  const program = novice5x5({ start: isoDate(), weeks, clientId: client.id, name: 'E2E 5×5' }); // first session = Day A
  program.status = 'active';
  const saved = await rpc('coach_save_program', { p_program: program, p_expected_version: null });
  return { email, session: s, rpc, client, program: saved.program, link: `/#/a/${client.access_token}` };
}

export const anonRpc = (fn, args) => call(`/rest/v1/rpc/${fn}`, args);

/** First workout that isn't done yet, as the app would pick it (today or most recent). */
export async function nextWorkoutId(page) {
  return page.evaluate(() => document.querySelector('[data-next-workout] a.btn')?.getAttribute('href').split('/w/')[1].split('/')[0]);
}

export async function noHorizontalScroll(page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `page is ${sw}px wide in a ${iw}px viewport`).toBeLessThanOrEqual(iw);
}

export async function signInCoach(page, email) {
  await page.goto('/#/coach');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Hi Paul/ })).toBeVisible();
}

export async function waitSynced(page) {
  await expect(page.locator('.sync-badge').first()).toContainText('Synced', { timeout: 15_000 });
}
