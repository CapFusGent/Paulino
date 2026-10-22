// Visual review helper (not part of CI assertions beyond "no JS errors").
import { test, expect, open, seedPaulProgram, settle } from './helpers.js';
const shot = (page, n, full = true) => page.screenshot({ path: `test-results/review/${n}.png`, fullPage: full });
test('review shots', async ({ page }) => {
  await open(page);
  const pid = await seedPaulProgram(page, { name: 'Strength block 1' });
  const url = await page.evaluate(async (id) => (await window.Paulino.share.makeLink(await window.Paulino.store.get('paul', id))).url, pid);
  await page.goto(url);
  await page.getByRole('button', { name: 'Save & start training' }).click();
  await page.waitForTimeout(4000);
  await open(page, '#/'); await page.waitForTimeout(600); await shot(page, 'home');
  await open(page, '#/academy'); await page.waitForTimeout(600); await shot(page, 'academy');
  await open(page, '#/academy/squat'); await page.waitForTimeout(400);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(120); }
  await shot(page, 'lesson-squat');
  await open(page, '#/settings'); await page.waitForTimeout(600); await shot(page, 'settings');
  const prog = await page.evaluate(async () => (await window.Paulino.store.all('athlete'))[0]);
  await open(page, `#/a/p/${prog.id}/d/${prog.weeks[0].days[0].id}`); await page.waitForTimeout(500); await shot(page, 'workout');
  await page.locator('.ex-card').nth(1).getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Sets', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save change' }).click();
  await settle(page); await page.waitForTimeout(400); await shot(page, 'drama', false);
  await page.getByRole('button', { name: "Keep Paul's plan" }).click(); await settle(page);
  await page.locator('.done-btn').first().click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await page.waitForTimeout(1800); await shot(page, 'results');
  await open(page, '#/a'); await page.waitForTimeout(600); await shot(page, 'athlete-home');
  await open(page, `#/paul/p/${pid}`); await page.waitForTimeout(400); await shot(page, 'editor');
});
