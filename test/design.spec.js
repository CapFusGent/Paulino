// Trial designs (aesthetics only): switching, persistence, every screen at 360 px, contrast.
import { test, expect, open, noHScroll, seedPaulProgram } from './helpers.js';

const css = (page, k) => page.evaluate((key) => getComputedStyle(document.documentElement).getPropertyValue(key).trim(), k);

test('the Shapes design loads from ?design=, sticks, and is switched in Settings', async ({ page }) => {
  await page.goto('/?design=shapes#/');
  await page.waitForFunction(() => window.Paulino?.app && !document.querySelector('.boot'));
  await expect(page.locator('html')).toHaveAttribute('data-design', 'shapes');
  expect(await page.evaluate(() => [...document.styleSheets].some((s) => s.href?.endsWith('assets/designs/shapes.css') && s.cssRules.length > 100))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(79, 134, 246)');
  // still Shapes after a normal reload without the parameter
  await open(page, '#/coach');
  await expect(page.locator('html')).toHaveAttribute('data-design', 'shapes');
  // Settings switches back and forth without a reload
  await open(page, '#/settings');
  await page.getByRole('button', { name: /^Collage/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-design', /.+/);
  await expect(page.locator('#design-css')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'NEVER SKIP LEG DAY', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Shapes/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-design', 'shapes');
  await expect(page.getByText('The Shapes design has its own colours.')).toBeVisible();
  // an unknown name is ignored
  await page.goto('/?design=nope#/');
  await expect(page.locator('html')).toHaveAttribute('data-design', 'shapes');
});

test('Shapes: every main screen fits 360 px with no errors, text stays readable', async ({ page }) => {
  test.slow();
  await open(page);
  const pid = await seedPaulProgram(page, { name: 'Design block' });
  const url = await page.evaluate(async (id) => (await window.Paulino.share.makeLink(await window.Paulino.store.get('paul', id))).url, pid);
  await page.goto(url.replace('#program=', '?design=shapes#program='));
  await page.getByRole('button', { name: 'Save & start training' }).click();
  await expect(page.getByRole('heading', { name: /Hey Marco/ })).toBeVisible();
  const prog = await page.evaluate(async () => (await window.Paulino.store.all('athlete'))[0]);
  const day = prog.weeks[0].days[0].id;
  for (const hash of ['#/', '#/a/program', `#/a/p/${prog.id}/d/${day}`, '#/a/history', '#/academy', '#/academy/deadlift', '#/academy/squat',
    '#/settings', '#/coach', '#/paul/library', `#/paul/p/${pid}`, '#/paul/exercises', '#/paul/exercises/new']) {
    await open(page, hash);
    await expect(page.locator('html')).toHaveAttribute('data-design', 'shapes');
    await page.waitForTimeout(80);
    await noHScroll(page);
    await page.screenshot({ path: `test-results/screens/shapes-${hash.replace(/[#/]+/g, '-').replace(/^-|-$/g, '') || 'home'}.png`, fullPage: true });
  }
  // flat: no borders or offset shadows on cards and buttons
  await open(page, '#/coach');
  const look = await page.locator('.door-card').first().evaluate((el) => { const s = getComputedStyle(el); return [s.borderTopWidth, s.boxShadow]; });
  expect(look).toEqual(['0px', 'none']);
  // contrast: navy text on every surface colour, white only on navy
  const lum = (h) => { const c = h.replace('#', '').match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const navy = await css(page, '--sh-navy');
  for (const k of ['--sh-blue', '--sh-pink', '--sh-mint', '--sh-orange', '--sh-light']) expect(cr(navy, await css(page, k)), k).toBeGreaterThanOrEqual(4.5);
  expect(cr('#FFFFFF', navy)).toBeGreaterThanOrEqual(4.5);
  expect(cr('#FFFFFF', await css(page, '--sh-blue'))).toBeGreaterThanOrEqual(3);   // large titles only
});
