// Lifting Academy, home / landings, dialogue and the photo-collage system.
import { test, expect, open, noHScroll } from './helpers.js';

test('athlete home is led by the big photo collage and a real catchphrase', async ({ page }) => {
  await open(page, '#/');
  await expect(page.locator('.home-title')).toHaveText('PAULINO!');
  const hero = page.locator('.home-hero .paulino.mood-motivated');
  await expect(hero).toBeVisible();
  // the collage dominates the first screen
  const box = await hero.locator('.paulino-figure').boundingBox();
  expect(box.y).toBeLessThan(200);
  expect(box.height).toBeGreaterThan(760 * 0.4);
  expect(await hero.locator('img').evaluateAll((els) => els.every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
  const real = await page.evaluate(() => Object.values(window.Paulino.data.PAUL).map((x) => x.t));
  expect(real).toContain(await page.locator('.home-hero .bubble-text').textContent());
  await expect(page.getByRole('button', { name: /Import a \.paulino file/ })).toBeVisible();
  await expect(page.locator('.home-doors')).toHaveCount(0);   // no role choice
  await noHScroll(page);
});

test("dialogue: Paul's real lines weigh most, never the same line twice in a row", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const P = window.Paulino;
    const lines = P.data.LINES.motivated.workout;
    const real = new Set(lines.filter((l) => l.real).map((l) => l.t));
    let hits = 0, repeats = 0, prev = null;
    for (let i = 0; i < 600; i++) { const t = P.ui.pick('test', lines); if (real.has(t)) hits++; if (t === prev) repeats++; prev = t; }
    return { share: hits / 600, repeats, finish: P.data.LINES.celebrating.finish.map((l) => l.t || l), deviate: P.data.LINES.disappointed.deviate.map((l) => l.t || l) };
  });
  expect(r.repeats).toBe(0);
  expect(r.share).toBeGreaterThan(0.6);
  expect(r.finish).toContain('GOOD! NOW, HOW MANY GRAMS OF PROTEIN DID YOU HAVE TODAY?');
  expect(r.deviate).toEqual(expect.arrayContaining(['WHAT?! YOU CHANGED MY PROGRAM?!', 'PAUL WROTE THIS FOR A REASON!']));
});

test('academy lists the five lessons and every lesson scrolls through its steps', async ({ page }) => {
  await open(page, '#/academy');
  await expect(page.locator('.toc-item')).toHaveCount(5);
  for (const t of ['The Squat', 'The Overhead Press', 'The Deadlift', 'The Bench Press', 'The Power Clean']) await expect(page.locator('.toc')).toContainText(t);
  await expect(page.getByText(/waiting for Paul's review/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load private illustrations' })).toBeVisible();
  await noHScroll(page);

  const lessons = await page.evaluate(() => window.Paulino.academy.LESSONS.map((l) => ({ id: l.id, steps: l.steps.length, extra: l.mistakesPhoto ? 1 : 0 })));
  for (const l of lessons) {
    await open(page, `#/academy/${l.id}`);
    await expect(page.locator('.lesson-step')).toHaveCount(l.steps + 2); // steps + mistakes + recap
    await expect(page.locator('.lesson-step .why')).toHaveCount(l.steps);
    for (let i = 0; i < 40 && !(await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2)); i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(60); }
    await expect(page.locator('.lesson-recap')).toHaveClass(/in/);
    await noHScroll(page);
    // every panel has a slot: a cleared public photo or PHOTO NEEDED, never a book figure
    await expect(page.locator('.photo-slot')).toHaveCount(l.steps + l.extra);
    for (const src of await page.locator('.photo-slot img').evaluateAll((els) => els.map((e) => e.getAttribute('src')))) expect(src).toMatch(/^assets\/lessons\//);
    await expect(page.locator('.is-private')).toHaveCount(0);
  }
});

for (const [lesson, ids, credit] of [
  ['deadlift', ['lesson_deadlift_paul_setup', 'lesson_deadlift_paul_set', 'lesson_deadlift_paul_pull', 'lesson_deadlift_paul_lockout'], 'paul_11.mp4'],
  ['bench', ['lesson_bench_paul_spotter', 'lesson_bench_paul_lockout', 'lesson_bench_paul_bottom'], "spotter's face is blurred"],
]) {
  test(`the ${lesson} is illustrated with frames of Paul's own lifts, annotated`, async ({ page }) => {
    await open(page, `#/academy/${lesson}`);
    await expect(page.locator('.has-photo')).toHaveCount(ids.length);
    for (const id of ids) {
      const f = page.locator(`[data-photo="${id}"]`);
      await f.scrollIntoViewIfNeeded();
      await expect.poll(() => f.locator('img').evaluate((img) => img.naturalWidth)).toBe(464);
      await expect(f.locator('svg.annot')).toHaveCount(1);
      await expect(f.locator('figcaption small')).toContainText(credit);
    }
    if (lesson === 'deadlift') await expect(page.locator('[data-photo="lesson_deadlift_paul_lockout"] polyline')).toHaveCount(1);
  });
}

test('lesson bubbles cycle through the step cues; lessons are short', async ({ page }) => {
  await open(page, '#/academy/squat');
  const step5 = page.locator('.lesson-step[data-step="3"]');
  await step5.scrollIntoViewIfNeeded();
  const text = step5.locator('.bubble-text');
  const cues = await page.evaluate(() => window.Paulino.academy.LESSONS[0].steps[2].cues.map((c) => c.t || c));
  const first = await text.textContent();
  expect(cues).toContain(first);
  await step5.locator('.bubble').click();
  await expect(text).not.toHaveText(first);
  expect(cues).toContain(await text.textContent());
  // short lessons: four steps, one or two sentences each
  const lens = await page.evaluate(() => window.Paulino.academy.LESSONS.map((l) => [l.steps.length, Math.max(...l.steps.map((s) => s.body.join(' ').length))]));
  for (const [n, longest] of lens) { expect(n).toBe(4); expect(longest).toBeLessThan(140); }
});

test('a private illustration pack fills empty slots on this device only, and can be removed', async ({ page }) => {
  await open(page, '#/academy');
  // a tiny generated pack (never the real book figures)
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const pack = { format: 'paulino-image-pack', v: 1, book: 'Test book', images: {
    lesson_squat_stance: { data: png, caption: 'Test figure' },
    lesson_deadlift_paul_setup: { data: png, caption: 'must not replace the public photo' },
    'bad id': { data: png }, lesson_bad_data: { data: 'javascript:alert(1)' } } };
  const n = await page.evaluate((t) => window.Paulino.art.importPack(t), JSON.stringify(pack));
  expect(n).toBe(2);
  await expect(page.evaluate(() => window.Paulino.art.importPack('{"format":"nope"}'))).rejects.toThrow(/illustration pack/);
  await open(page, '#/academy/squat');
  const first = page.locator('.lesson-step[data-step="1"] .photo-slot');
  await expect(first).toHaveClass(/is-private/);
  await expect(first.locator('figcaption')).toContainText('Not for sharing');
  await open(page, '#/academy/deadlift');
  await expect(page.locator('[data-photo="lesson_deadlift_paul_setup"]')).not.toHaveClass(/is-private/);
  // not part of a backup
  expect(await page.evaluate(() => window.Paulino.store.exportBackup())).not.toContain('Test figure');
  await open(page, '#/academy');
  await expect(page.getByRole('button', { name: /Remove them \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: /Remove them/ }).click();
  await expect(page.getByRole('button', { name: 'Load private illustrations' })).toBeVisible();
  await open(page, '#/academy/squat');
  await expect(page.locator('.is-private')).toHaveCount(0);
});

test('workout cards link to the matching lesson; missing images fall back to paper', async ({ page, browser }) => {
  await open(page);
  expect(await page.evaluate(() => ['squat', 'bench-press', 'deadlift', 'overhead-press', 'barbell-row', 'pull-up'].map((x) => window.Paulino.academy.forExercise(x)?.id || null)))
    .toEqual(['squat', 'bench', 'deadlift', 'press', null, null]);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const p2 = await ctx.newPage();
  const pageErrors = [];
  p2.on('pageerror', (e) => pageErrors.push(e.message));
  await p2.route('**/assets/paulino/*.webp', (r) => r.fulfill({ status: 404, body: '' }));
  await open(p2, '#/coach');
  await expect(p2.locator('.cl-missing').first()).toBeVisible();
  await expect(p2.locator('.cl-missing .cl-fallback').first()).toBeVisible();
  await open(p2, '#/');
  await expect(p2.locator('.home-hero .cl-missing')).toHaveCount(1);
  await noHScroll(p2);
  expect(pageErrors).toEqual([]);
  await ctx.close();
});
