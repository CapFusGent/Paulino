// 15 · every screen at 360 px without horizontal scrolling, in all palettes,
// and all six Paulino moods. Screenshots go to test-results/screens/.
import { test, expect, open, noHScroll, settle, seedPaulProgram } from './helpers.js';

const shot = (page, name) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

test('all screens at 360 px in every palette', async ({ page }) => {
  await open(page);
  const pid = await seedPaulProgram(page, { name: 'Layout block' });
  const url = await page.evaluate(async (id) => (await window.Paulino.share.makeLink(await window.Paulino.store.get('paul', id))).url, pid);
  await page.goto(url);
  await page.getByRole('button', { name: 'Save & start training' }).click();
  const prog = await page.evaluate(async () => (await window.Paulino.store.all('athlete'))[0]);
  const day = prog.weeks[0].days[0].id;
  // one finished workout so results/history have content
  await open(page, `#/a/p/${prog.id}/d/${day}`);
  await page.locator('.done-btn').first().click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: 'Session done!' })).toBeVisible();

  const screens = [
    ['home', '#/'], ['paul-library', '#/paul'], ['paul-editor', `#/paul/p/${pid}`], ['print', `#/paul/p/${pid}/print`],
    ['athlete-home', '#/a'], ['athlete-program', `#/a/p/${prog.id}`], ['workout', `#/a/p/${prog.id}/d/${day}`],
    ['results', `#/a/p/${prog.id}/d/${day}/done`], ['history', '#/a/history'], ['library', '#/a/library'], ['settings', '#/settings'],
    ['academy', '#/academy'], ['lesson-squat', '#/academy/squat'], ['lesson-clean', '#/academy/clean'],
  ];
  for (const pal of ['original', 'pink', 'teal', 'blue']) {
    await page.evaluate((p) => { localStorage.setItem('paulino:palette', JSON.stringify(p)); window.Paulino.ui.applyPalette(); }, pal);
    for (const [name, hash] of screens) {
      await open(page, hash);
      await expect(page.locator('html')).toHaveAttribute('data-palette', pal);
      await page.waitForTimeout(name === 'results' ? 1700 : 50);
      await noHScroll(page);
      if (pal === 'original' || name === 'home' || name === 'workout') await shot(page, `${name}-${pal}`);
    }
  }
  // editor with advanced options open, the wizard and the share sheet
  await open(page, `#/paul/p/${pid}`);
  await page.locator('[data-toggle]').first().click();
  await noHScroll(page);
  await shot(page, 'paul-editor-details');
  await page.getByRole('button', { name: /Repeat \/ Progress/ }).click();
  await page.getByRole('button', { name: '+2.5 kg / week' }).click();
  await page.getByRole('button', { name: 'Deload every 4th week' }).click();
  await settle(page);
  const sheetOverflow = await page.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth - s.clientWidth; });
  expect(sheetOverflow).toBeLessThanOrEqual(1);
  await noHScroll(page);
  await page.keyboard.press('Escape');
  await settle(page);
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByLabel('Share link')).toBeVisible();
  await noHScroll(page);
  await shot(page, 'share-sheet');
});

test('six Paulino moods render and react to taps', async ({ page }) => {
  await open(page, '#/settings');
  for (const mood of ['motivated', 'focused', 'happy', 'celebrating', 'disappointed', 'concerned']) {
    const m = page.locator(`.paulino.mood-${mood}`).first();
    await expect(m).toBeVisible();
    // a real photo cut-out, actually loaded (not the paper fallback)
    await expect(m.locator(`.cl.cl-${mood}`)).toBeVisible();
    await expect(m.locator('.cl-missing')).toHaveCount(0);
    expect(await m.locator('.cl-head').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(m.locator('.bubble-text')).not.toBeEmpty();
    await m.screenshot({ path: `test-results/screens/mood-${mood}.png` });
  }
  const m = page.locator('.paulino.mood-motivated').first();
  const before = await m.locator('.bubble-text').textContent();
  await m.locator('.paulino-figure').click();
  await expect(m.locator('.bubble-text')).not.toHaveText(before);
});

test('works with storage blocked (memory fallback) and warns', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } });
    const deny = () => { throw new DOMException('denied', 'SecurityError'); };
    Storage.prototype.setItem = deny; Storage.prototype.getItem = deny;
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/settings');
  await expect(page.getByText(/blocks storage/)).toBeVisible();
  await page.goto('/#/paul');
  await page.getByRole('button', { name: /New program/ }).click();
  await page.getByLabel('Program name').fill('Temp');
  await page.getByRole('button', { name: 'Create program' }).click();
  await expect(page.locator('.editor-bar')).toContainText('Temp');
  expect(errors).toEqual([]);
  await ctx.close();
});
