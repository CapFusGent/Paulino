// Paul's workflows through the real UI.
import { test, expect, open, noHScroll, settle, seedPaulProgram, getPaul } from './helpers.js';
import { readFileSync, mkdirSync } from 'node:fs';

mkdirSync('test-results/screens', { recursive: true });
const row = (page, i) => page.locator('.grid-row').nth(i);

test('1 · create a four-week program manually, 9 · save and reopen', async ({ page }) => {
  await open(page, '#/coach');
  await page.getByRole('button', { name: /Create Program/ }).click();
  await page.getByLabel('Program name').fill('Marco: block 1');
  await page.getByLabel('Athlete (optional)').fill('Marco');
  await page.getByLabel('Start date').fill('2026-11-02');
  await page.getByLabel('Duration (weeks)').fill('4');
  await page.getByRole('button', { name: 'Create program', exact: true }).click();
  await expect(page.locator('.editor-bar')).toContainText('Marco: block 1');
  await noHScroll(page);

  // Week 1: Monday with squat / bench / deadlift
  await page.getByLabel('Day name').fill('Monday');
  for (const [name, sets, reps, kg] of [['Back squat', 4, 5, 100], ['Bench press', 4, 8, 70], ['Deadlift', 3, 5, 120]]) {
    await page.getByRole('button', { name: 'Add exercise' }).click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    const r = page.locator('.grid-row').last();
    await r.getByLabel('Sets').fill(String(sets));
    await r.getByLabel('Reps').fill(String(reps));
    await r.getByLabel('Weight in kg').fill(String(kg));
  }
  // advanced options: rest, RPE on a set, instructions
  await row(page, 0).getByRole('button', { name: /Rest|rest/ }).click();
  await page.locator('[data-details]').getByLabel('Set 1 RPE').fill('8');
  await page.locator('[data-details]').getByLabel('Set 1 RPE').blur();
  await page.locator('[data-details] textarea').fill('Brace hard, control the descent');
  // second training day
  await page.getByRole('button', { name: 'Add training day' }).click();
  await expect(page.locator('.day-card')).toHaveCount(2);

  // Weeks 2–4 by duplicating, then change week 3 by hand
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Week actions' }).click();
    await page.getByRole('button', { name: /Duplicate week/ }).click();
    await settle(page);
  }
  await page.getByLabel('Choose week').selectOption({ index: 2 });
  await row(page, 0).getByLabel('Weight in kg').fill('105');
  await expect(page.locator('[data-save-state]')).toHaveText('Saved on this device');

  // 9: reload → everything is still there
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('.boot'));
  await expect(page.getByLabel('Choose week')).toHaveValue('2');
  await expect(row(page, 0).getByLabel('Weight in kg')).toHaveValue('105');
  const id = page.url().match(/paul\/p\/(\w+)/)[1];
  const p = await getPaul(page, id);
  expect(p.weeks).toHaveLength(4);
  expect(p.weeks.map((w) => w.days[0].exercises[0].sets[0].kg)).toEqual([100, 100, 105, 100]);
  expect(p.weeks[0].days[0].exercises.map((e) => [e.exerciseId, e.sets.length, e.sets[0].reps])).toEqual([['squat', 4, 5], ['bench-press', 4, 8], ['deadlift', 3, 5]]);
  expect(p.weeks[0].days[0].exercises[0].sets[0].rpe).toBe(8);
  expect(p.weeks[0].days[0].exercises[0].notes).toBe('Brace hard, control the descent');
  expect(new Set(p.weeks.map((w) => w.id)).size).toBe(4);
  // back to the library: it is listed with athlete & date
  await page.getByRole('button', { name: 'Back to programs' }).click();
  await expect(page.locator('.list-card')).toContainText('Marco: block 1');
  await expect(page.locator('.list-card')).toContainText('for Marco');
});

test('2–6 · Repeat / Progress wizard: rules per exercise, deload, preview, apply', async ({ page }) => {
  await open(page);
  const id = await seedPaulProgram(page);
  await open(page, `#/paul/p/${id}`);
  await page.getByRole('button', { name: /Repeat \/ Progress/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Repeat and progress' });
  await expect(dlg.getByLabel('Weeks to generate')).toHaveValue('11');
  // no rules = repeat unchanged preview
  await expect(dlg.locator('[data-preview-table] tbody tr')).toHaveCount(12);
  await expect(dlg.locator('[data-preview-table] tbody tr').nth(11)).toContainText('4×5 · 100 kg');

  // squat +2.5 kg every week
  await dlg.getByRole('button', { name: '+2.5 kg / week' }).click();
  let rule = dlg.locator('.rule').nth(0);
  await rule.getByLabel('Applies to').selectOption('lifts');
  rule = dlg.locator('.rule').nth(0);
  await expect(rule.getByLabel('Back squat')).toBeChecked();
  // bench +1 rep every 2 weeks
  await dlg.getByRole('button', { name: '+1 rep / 2 weeks' }).click();
  rule = dlg.locator('.rule').nth(1);
  await rule.getByLabel('Applies to').selectOption('lifts');
  rule = dlg.locator('.rule').nth(1);
  await rule.getByLabel('Back squat').uncheck();
  await rule.getByLabel('Bench press').check();
  // deadlift +5 kg every 2 weeks
  await dlg.getByRole('button', { name: 'Custom rule' }).click();
  rule = dlg.locator('.rule').nth(2);
  await rule.getByLabel(/Amount/).fill('5');
  await rule.getByLabel('Apply every').selectOption('2');
  rule = dlg.locator('.rule').nth(2);
  await rule.getByLabel('Applies to').selectOption('lifts');
  rule = dlg.locator('.rule').nth(2);
  await rule.getByLabel('Back squat').uncheck();
  await rule.getByLabel('Deadlift').check();
  // deload every 4th week
  await dlg.getByRole('button', { name: 'Deload every 4th week' }).click();

  const rows = dlg.locator('[data-preview-table] tbody tr');
  await expect(rows.nth(1)).toContainText('4×5 · 102.5 kg');
  await expect(rows.nth(1)).toContainText('4×8 · 70 kg');
  await expect(rows.nth(2)).toContainText('4×9 · 70 kg');          // week 3: +1 rep
  await expect(rows.nth(2)).toContainText('3×5 · 125 kg');         // week 3: +5 kg
  await expect(rows.nth(3)).toContainText('deload');               // week 4
  await expect(rows.nth(3)).toContainText('4×5 · 97.5 kg');        // 107.5 −10 %
  await expect(rows.nth(4)).toContainText('4×5 · 110 kg');
  await expect(dlg.locator('.rule-list')).toContainText('Back squat: +2.5 kg every week');
  await expect(dlg.locator('.rule-list')).toContainText('Bench press: +1 rep every 2 weeks');
  await page.screenshot({ path: 'test-results/screens/wizard-360.png' });

  // invalid input blocks Apply
  await dlg.locator('.rule').nth(0).getByLabel(/Amount/).fill('0');
  await expect(dlg.locator('[data-errors]')).toContainText('enter an amount');
  await expect(dlg.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await dlg.locator('.rule').nth(0).getByLabel(/Amount/).fill('2.5');
  await expect(dlg.getByRole('button', { name: 'Apply' })).toBeEnabled();

  await dlg.getByRole('button', { name: 'Apply' }).click();
  await settle(page);
  const p = await getPaul(page, id);
  expect(p.weeks).toHaveLength(12);
  expect(p.weeks.map((w) => w.days[0].exercises[0].sets[0].kg)).toEqual([100, 102.5, 105, 97.5, 110, 112.5, 115, 105, 120, 122.5, 125, 115]);
  expect(p.weeks.map((w) => Boolean(w.gen?.deload))).toEqual([false, false, false, true, false, false, false, true, false, false, false, true]);
  expect(p.weeks[11].days[1].exercises[1].exerciseId).toBe('pull-up');
  // the editor now shows week 2 as generated, independently editable
  await expect(page.getByLabel('Choose week')).toHaveValue('1');
  await expect(page.locator('.chip-gen').first()).toBeVisible();
  await noHScroll(page);
});

test('7 · manually override a generated week, keep it when regenerating', async ({ page }) => {
  await open(page);
  const id = await seedPaulProgram(page);
  await page.evaluate(async (id) => {
    const P = window.Paulino;
    const p = await P.store.get('paul', id);
    const r = P.rules.apply(p, { from: 0, count: 11, rules: [P.rules.newRule('weight', { amount: 2.5 })] });
    await P.store.put('paul', r.program);
  }, id);
  await open(page, `#/paul/p/${id}?w=6`);
  await expect(page.getByLabel('Choose week')).toHaveValue('6');
  await expect(row(page, 0).getByLabel('Weight in kg')).toHaveValue('115');
  await row(page, 0).getByLabel('Weight in kg').fill('100');
  await expect(row(page, 0).locator('.chip')).toHaveText('edited');
  await expect(page.locator('[data-save-state]')).toHaveText('Saved on this device');

  await page.getByLabel('Choose week').selectOption('0');
  await page.getByRole('button', { name: /Repeat \/ Progress/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Repeat and progress' });
  await expect(dlg.getByLabel(/Keep my 1 manual edit/)).toBeChecked();
  await dlg.getByRole('button', { name: '+2.5 kg / week' }).click();
  await expect(dlg.locator('[data-preview-table] tbody tr').nth(6)).toContainText('100 kg ✎');
  await dlg.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('dialog', { name: 'Overwrite weeks?' }).getByRole('button', { name: 'Overwrite' }).click();
  await settle(page);
  const p = await getPaul(page, id);
  expect(p.weeks[6].days[0].exercises[0].sets[0].kg).toBe(100);
  expect(p.weeks[6].days[0].exercises[0].edited).toBe(true);
  expect(p.weeks[7].days[0].exercises[0].sets[0].kg).toBe(117.5);
});

test('8 · duplicate a saved program', async ({ page }) => {
  await open(page);
  const id = await seedPaulProgram(page, { name: 'Block A' });
  await open(page, '#/paul/library');
  await page.getByRole('button', { name: 'More actions for Block A' }).click();
  await page.getByRole('button', { name: /Duplicate/ }).click();
  await expect(page.locator('.editor-bar')).toContainText('Block A (copy)');
  const copyId = page.url().match(/paul\/p\/(\w+)/)[1];
  expect(copyId).not.toBe(id);
  const [a, b] = [await getPaul(page, id), await getPaul(page, copyId)];
  expect(b.weeks[0].days[0].exercises.map((e) => e.sets)).toEqual(a.weeks[0].days[0].exercises.map((e) => e.sets));
  expect(b.weeks[0].days[0].exercises[0].id).not.toBe(a.weeks[0].days[0].exercises[0].id);
  // editing the copy leaves the original alone
  await row(page, 0).getByLabel('Weight in kg').fill('80');
  await expect(page.locator('[data-save-state]')).toHaveText('Saved on this device');
  expect((await getPaul(page, id)).weeks[0].days[0].exercises[0].sets[0].kg).toBe(100);
  // and "New program → Duplicate existing" works too
  await open(page, '#/paul/library');
  await page.getByRole('button', { name: /New program/ }).click();
  await page.getByRole('button', { name: 'Copy a saved program' }).click();
  await page.getByRole('radio', { name: /^Block A Marco/ }).click();
  await expect(page.getByLabel('Program name')).toHaveValue('Block A (copy)');
  await page.getByLabel('Program name').fill('Block B');
  await page.getByRole('button', { name: 'Create program', exact: true }).click();
  await expect(page.locator('.editor-bar')).toContainText('Block B');
  await expect(row(page, 0).getByLabel('Weight in kg')).toHaveValue('100');
});

test('10 · export a .paulino file and import it as the athlete', async ({ page, browser }) => {
  await open(page);
  const id = await seedPaulProgram(page, { name: 'File block' });
  await open(page, `#/paul/p/${id}`);
  await page.getByRole('button', { name: 'Share' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download .paulino file/ }).click()]);
  expect(dl.suggestedFilename()).toBe('Marco_File_block.paulino');
  const path = 'test-results/screens/Marco_File_block.paulino';
  await dl.saveAs(path);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  expect([data.format, data.v, data.name, data.athlete]).toEqual(['paulino-program', 1, 'File block', 'Marco']);

  // a different browser (the athlete's phone)
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const phone = await ctx.newPage();
  await open(phone, '#/a');
  const importFile = async (files) => {
    const [chooser] = await Promise.all([phone.waitForEvent('filechooser'), phone.getByRole('button', { name: /Import a \.paulino file/ }).first().click()]);
    await chooser.setFiles(files);
  };
  await importFile(path);
  await phone.getByRole('button', { name: 'Save & start training' }).click();
  await expect(phone.getByRole('heading', { name: /Hey Marco/ })).toBeVisible();
  await expect(phone.locator('[data-next]')).toContainText('Monday');
  // importing the same file again does not duplicate it
  await phone.getByRole('link', { name: 'Saved programs' }).click();
  await importFile(path);
  await expect(phone.getByText('You already have this one!')).toBeVisible();
  expect(await phone.evaluate(async () => (await window.Paulino.store.all('athlete')).length)).toBe(1);
  // a broken file is rejected with a message
  await open(phone, '#/a/library');
  await importFile({ name: 'bad.paulino', mimeType: 'application/json', buffer: Buffer.from('{"format":"paulino-program","v":1,"name":"x","startDate":"2026-11-02","weeks":[]}') });
  await expect(phone.locator('.toast-error')).toContainText('at least one week');
  await ctx.close();
});

test('11 · shared link opens in a fresh browser; edits after sharing need a new link', async ({ page, browser }) => {
  await open(page);
  const id = await seedPaulProgram(page, { name: 'Link block' });
  await page.evaluate(async (id) => {
    const P = window.Paulino;
    const p = await P.store.get('paul', id);
    await P.store.put('paul', P.rules.apply(p, { from: 0, count: 11, rules: [P.rules.newRule('weight')] }).program);
  }, id);
  await open(page, `#/paul/p/${id}`);
  await page.getByRole('button', { name: 'Share' }).click();
  const linkBox = page.getByLabel('Share link');
  await expect(linkBox).toHaveValue(/#program=z1\./);
  const url = await linkBox.inputValue();
  await expect(page.getByRole('dialog')).toContainText(/characters/);
  await expect(page.getByRole('dialog')).toContainText('snapshot');

  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const phone = await ctx.newPage();
  await phone.goto(url);
  await expect(phone.getByRole('heading', { name: 'Link block' })).toBeVisible();
  await expect(phone.getByText('12 weeks · 24 workouts')).toBeVisible();
  await phone.getByRole('button', { name: 'Save & start training' }).click();
  await expect(phone.getByRole('heading', { name: /Hey Marco/ })).toBeVisible();
  expect(phone.url()).not.toContain('program=');
  await phone.getByRole('link', { name: 'My Program', exact: true }).click();
  await expect(phone.locator('details.block')).toHaveCount(12);
  await expect(phone.locator('details.block').nth(11)).toContainText('Week 12');

  // Paul edits; the old link still shows the old snapshot, a new link offers the update
  await page.keyboard.press('Escape');
  await settle(page);
  await row(page, 0).getByLabel('Weight in kg').fill('90');
  await expect(page.locator('[data-save-state]')).toHaveText('Saved on this device');
  await page.getByRole('button', { name: 'Share' }).click();
  const url2 = await page.getByLabel('Share link').inputValue();
  expect(url2).not.toBe(url);
  await phone.goto(url);
  await expect(phone.getByText('You already have this one!')).toBeVisible();
  await phone.goto(url2);
  await expect(phone.getByText('Paul updated your program!')).toBeVisible();
  await phone.getByRole('button', { name: 'Update to the new version' }).click();
  await expect(phone.locator('[data-next]')).toContainText('90 kg');
  // a damaged link explains itself
  await phone.goto(`${url.slice(0, url.length - 40)}`);
  await expect(phone.getByRole('heading', { name: "Link didn't open" })).toBeVisible();
  await ctx.close();
});

test('16 · printable version and PDF', async ({ page }) => {
  await open(page);
  const id = await seedPaulProgram(page, { name: 'Print block' });
  await open(page, `#/paul/p/${id}/print`);
  await expect(page.getByRole('heading', { name: 'Print block' })).toBeVisible();
  await expect(page.locator('.print-day').first()).toContainText('Back squat');
  await expect(page.locator('.print-day').first()).toContainText('4 × 5 @ 100 kg');
  await noHScroll(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-toolbar')).toBeHidden();
  await expect(page.locator('.print-doc')).toBeVisible();
  const pdf = await page.pdf({ path: 'test-results/screens/print-block.pdf', format: 'A4' });
  expect(pdf.length).toBeGreaterThan(10_000);
  await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: 'test-results/screens/print-360.png', fullPage: true });
});
