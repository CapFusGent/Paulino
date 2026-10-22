// Lifting Academy and the photo-collage system.
import { test, expect, open, noHScroll } from './helpers.js';

test('academy lists the five candidate lessons and every lesson scrolls through its steps', async ({ page }) => {
  await open(page, '#/academy');
  await expect(page.locator('.toc-item')).toHaveCount(5);
  for (const t of ['The Squat', 'The Press', 'The Deadlift', 'The Bench Press', 'The Power Clean']) await expect(page.locator('.toc')).toContainText(t);
  await expect(page.getByText(/waiting for Paul's review/)).toBeVisible();
  await noHScroll(page);

  const lessons = await page.evaluate(() => window.Paulino.academy.LESSONS.map((l) => ({ id: l.id, steps: l.steps.length })));
  for (const l of lessons) {
    await open(page, `#/academy/${l.id}`);
    await expect(page.locator('.lesson-step')).toHaveCount(l.steps + 2); // steps + mistakes + recap
    // scroll to the end: every page gets revealed, nothing overflows sideways
    for (let i = 0; i < l.steps + 3; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(60); }
    await expect(page.locator('.lesson-recap')).toHaveClass(/in/);
    await noHScroll(page);
    // without a cleared photo, each step shows a PHOTO NEEDED slot, never an unrelated picture
    await expect(page.locator('.needs-photo')).toHaveCount(l.steps);
    expect(await page.locator('.photo-slot img').count()).toBe(0);
  }
});

test('lesson bubbles cycle through the step cues; coaching choices are labelled', async ({ page }) => {
  await open(page, '#/academy/squat');
  const step5 = page.locator('.lesson-step[data-step="5"]');
  await step5.scrollIntoViewIfNeeded();
  const text = step5.locator('.bubble-text');
  const cues = await page.evaluate(() => window.Paulino.academy.LESSONS[0].steps[4].cues);
  const first = await text.textContent();
  expect(cues).toContain(first);
  await step5.locator('.bubble').click();
  await expect(text).not.toHaveText(first);
  expect(cues).toContain(await text.textContent());
  await expect(page.locator('.lesson-step[data-step="3"] .pref-note')).toContainText('Coaching choice');
});

test('a photo added to the manifest replaces the placeholder and gets its annotations', async ({ page }) => {
  // simulate Paul adding a cleared photo + annotation for one step
  await page.route('**/assets/asset-manifest.json', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.lesson_photo_slots = { lesson_squat_stance: { file: 'assets/paulino/paul_head_direct.webp', license: 'test' } };
    await route.fulfill({ json });
  });
  await open(page, '#/academy/squat');
  await page.evaluate(() => { window.Paulino.academy.LESSONS[0].steps[0].annotations = [{ type: 'arrow', from: [20, 80], to: [50, 50], label: 'test' }]; });
  await page.evaluate(() => window.Paulino.app.refresh());
  const first = page.locator('.lesson-step[data-step="1"] .photo-slot');
  await expect(first).toHaveClass(/has-photo/);
  await expect(first.locator('img')).toBeVisible();
  await expect(first.locator('svg.annot line')).toHaveCount(1);
  await expect(page.locator('.needs-photo')).toHaveCount(6);
});

test('workout cards link to the matching lesson; missing images fall back to paper', async ({ page, browser }) => {
  await open(page);
  expect(await page.evaluate(() => ['squat', 'bench-press', 'deadlift', 'overhead-press', 'barbell-row', 'pull-up'].map((x) => window.Paulino.academy.forExercise(x)?.id || null)))
    .toEqual(['squat', 'bench', 'deadlift', 'press', null, null]);
  // a separate browser where every cut-out returns 404 (these errors are expected here)
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const p2 = await ctx.newPage();
  const pageErrors = [];
  p2.on('pageerror', (e) => pageErrors.push(e.message));
  await p2.route('**/assets/paulino/*.webp', (r) => r.fulfill({ status: 404, body: '' }));
  await open(p2, '#/settings');
  await expect(p2.locator('.cl-missing').first()).toBeVisible();
  await expect(p2.locator('.cl-missing .cl-fallback').first()).toBeVisible();
  await open(p2, '#/');
  await expect(p2.locator('.cover .cl-missing')).toHaveCount(1);
  await noHScroll(p2);
  expect(pageErrors).toEqual([]);
  await ctx.close();
});
