// Every important screen at 360 px (no horizontal scroll), each palette, and
// each Paulino mood. Screenshots land in test-results/screens/ for review.
import { test, expect } from '@playwright/test';
import { seedCoach, signInCoach, noHorizontalScroll } from './helpers.js';

const PALETTES = ['original', 'pink', 'teal', 'blue'];
const shot = (page, name) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

test('athlete screens at 360px in every palette', async ({ page }) => {
  const seed = await seedCoach();
  await page.goto(seed.link);
  await expect(page.getByRole('heading', { name: /Hey Leo/ })).toBeVisible();
  const wid = (await page.locator('[data-next-workout] a.btn').getAttribute('href')).split('/w/')[1];

  for (const pal of PALETTES) {
    await page.evaluate((p) => localStorage.setItem('paulino:palette', JSON.stringify(p)), pal);
    for (const [name, path] of [['home', ''], ['program', '/program'], ['workout', `/w/${wid}`], ['active', `/w/${wid}/go`], ['progress', '/progress'], ['settings', '/settings']]) {
      await page.goto(`${seed.link}${path}`);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-palette', pal);
      await expect(page.locator('#app .page')).toBeVisible();
      await noHorizontalScroll(page);
      await shot(page, `${name}-${pal}-360`);
    }
  }
  // Results screen
  await page.goto(`${seed.link}/w/${wid}/go`);
  await page.locator('.set-row').first().getByRole('button', { name: /Mark set 1 done/ }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: /Session done/i })).toBeVisible();
  await expect(page.locator('.sheet-wrap')).toHaveCount(0);
  await page.waitForTimeout(1800); // let the confetti finish
  await noHorizontalScroll(page);
  await shot(page, 'results-blue-360');
});

test('all five Paulino moods render', async ({ page }) => {
  const seed = await seedCoach();
  await page.goto(`${seed.link}/settings`);
  for (const mood of ['motivational', 'focused', 'happy', 'disappointed', 'concerned']) {
    const m = page.locator(`.paulino.mood-${mood}`).first();
    await expect(m).toBeVisible();
    await expect(m.locator('svg.paulino-svg')).toHaveAttribute('class', new RegExp(`mood-${mood}`));
    await expect(m.locator('.bubble-text')).not.toBeEmpty();
    await m.screenshot({ path: `test-results/screens/mood-${mood}.png` });
  }
});

test('coach screens at 360px', async ({ page }) => {
  const seed = await seedCoach();
  await signInCoach(page, seed.email);
  await noHorizontalScroll(page);
  await shot(page, 'coach-dashboard-360');
  await page.goto(`/#/coach/p/${seed.program.id}`);
  await expect(page.getByLabel('Program name')).toHaveValue('E2E 5×5');
  await page.locator('details.ed-workout > summary').first().click();
  await page.locator('.ed-presc details > summary').first().click();
  await noHorizontalScroll(page);
  await shot(page, 'coach-editor-360');
  await page.goto(`/#/coach/c/${seed.client.id}`);
  await expect(page.getByRole('heading', { name: 'Leo' })).toBeVisible();
  await noHorizontalScroll(page);
  await shot(page, 'coach-client-360');
  await page.goto('/#/');
  await noHorizontalScroll(page);
  await page.goto('/#/install');
  await noHorizontalScroll(page);
});
