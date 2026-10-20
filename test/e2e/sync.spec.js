// Offline logging + later sync, PWA shell offline, history after program edits.
import { test, expect } from '@playwright/test';
import { seedCoach, waitSynced, anonRpc } from './helpers.js';

test('PWA: manifest, icons and service worker; app shell + program readable offline', async ({ page, context }) => {
  const seed = await seedCoach();
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const i of manifest.icons) expect((await page.request.get(`/${i.src}`)).status(), i.src).toBe(200);

  await page.goto(seed.link);
  await expect(page.getByRole('heading', { name: /Hey Leo/ })).toBeVisible();
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.ready;
    return Boolean(r.active) && (await caches.keys()).some((k) => k.startsWith('paulino-v'));
  });
  await page.reload(); // now controlled by the SW
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await waitSynced(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Hey Leo/ })).toBeVisible();
  await expect(page.getByText('E2E 5×5')).toBeVisible();
  await page.getByRole('link', { name: 'Program' }).click();
  await expect(page.locator('details.block[open]')).toHaveCount(1);
  await context.setOffline(false);
});

test('workout logged offline is queued and synced when back online', async ({ page, context }) => {
  const seed = await seedCoach();
  await page.goto(seed.link);
  await waitSynced(page);
  await page.getByRole('link', { name: /Let's train/ }).click();
  const workoutUrl = page.url();

  await context.setOffline(true);
  await page.getByRole('link', { name: 'Start workout' }).click();
  const rows = page.locator('.set-row');
  for (let i = 0; i < 3; i++) await rows.nth(i).getByRole('button', { name: new RegExp(`Mark set ${i + 1} done`) }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: /Session done/i })).toBeVisible();
  await page.goto(`${seed.link}`);
  await expect(page.locator('.sync-badge').first()).toContainText(/Offline|to sync/);

  // nothing reached the server yet
  let b = await anonRpc('client_get_bundle', { p_token: seed.client.access_token });
  expect(b.logs).toHaveLength(0);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSynced(page);
  b = await anonRpc('client_get_bundle', { p_token: seed.client.access_token });
  expect(b.logs).toHaveLength(1);
  expect(b.logs[0].status).toBe('completed');
  expect(b.logs[0].sets.filter((s) => s.completed)).toHaveLength(3);
  expect(workoutUrl).toContain(b.logs[0].workout_id);
});

test('a second device sees the athlete’s progress; stale offline copy does not overwrite', async ({ browser }) => {
  const seed = await seedCoach();
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await pa.goto(seed.link);
  await pb.goto(seed.link);
  await waitSynced(pa);
  await waitSynced(pb);
  await pa.getByRole('link', { name: /Let's train/ }).click();
  const wid = pa.url().split('/w/')[1];

  // Device A goes offline and logs one set (older edit)
  await a.setOffline(true);
  await pa.getByRole('link', { name: 'Start workout' }).click();
  await pa.locator('.set-row').first().getByRole('button', { name: /Mark set 1 done/ }).click();

  // Device B logs two sets online, later in time
  await pb.goto(`${seed.link}/w/${wid}/go`);
  await pb.locator('.set-row').nth(0).getByRole('button', { name: /Mark set 1 done/ }).click();
  await pb.locator('.set-row').nth(1).getByRole('button', { name: /Mark set 2 done/ }).click();
  await waitSynced(pb);

  // A reconnects: its older copy must not win; it adopts B's
  await a.setOffline(false);
  await pa.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(pa.locator('.toast').filter({ hasText: /newer version was kept/ })).toBeVisible({ timeout: 15_000 });
  const bundle = await anonRpc('client_get_bundle', { p_token: seed.client.access_token });
  expect(bundle.logs[0].sets.filter((s) => s.completed)).toHaveLength(2);
  await pa.goto(`${seed.link}/w/${wid}/go`);
  await expect(pa.locator('[data-counter]')).toHaveText(/^2\//);
  await a.close();
  await b.close();
});

test('workout history stays intact after Paul updates the program', async ({ page }) => {
  const seed = await seedCoach();
  await page.goto(seed.link);
  await page.getByRole('link', { name: /Let's train/ }).click();
  const wid = page.url().split('/w/')[1];
  await page.getByRole('link', { name: 'Start workout' }).click();
  await page.locator('.set-row').first().getByRole('button', { name: /Mark set 1 done/ }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await waitSynced(page);

  // Paul rewrites that workout (different load) and then deletes it
  const prog = await seed.rpc('coach_get_program', { p_program_id: seed.program.id });
  const w = prog.blocks.flatMap((x) => x.workouts).find((x) => x.id === wid);
  w.prescriptions[0].sets = w.prescriptions[0].sets.map((s) => ({ ...s, load: { kind: 'kg', value: 100 } }));
  const v2 = await seed.rpc('coach_save_program', { p_program: prog, p_expected_version: prog.version });
  const block = v2.program.blocks.find((x) => x.workouts.some((y) => y.id === wid));
  block.workouts = block.workouts.filter((y) => y.id !== wid);
  await seed.rpc('coach_save_program', { p_program: v2.program, p_expected_version: v2.version });

  await page.goto(`${seed.link}/progress`);
  await page.getByRole('button', { name: 'Sync status' }).first().click();
  await waitSynced(page);
  await expect(page.locator('.card').filter({ hasText: 'Workout history' })).toContainText('Day A');
  await expect(page.locator('.card').filter({ hasText: 'Lifts' })).toContainText('60 kg × 5');
  const b = await anonRpc('client_get_bundle', { p_token: seed.client.access_token });
  expect(b.logs[0].workout_id).toBeNull();
  expect(b.logs[0].sets[0].actual_load_kg).toBe(60);
});
