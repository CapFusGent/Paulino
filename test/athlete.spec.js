// Athlete workflows: progress, modifications, Paulino's reactions, history.
import { test, expect, open, noHScroll, settle, seedPaulProgram } from './helpers.js';

/** Paul's program shared by link → athlete saves it. Returns { programId, firstDayId }. */
async function receiveProgram(page) {
  await open(page);
  const id = await seedPaulProgram(page, { name: 'Athlete block' });
  const url = await page.evaluate(async (id) => {
    const P = window.Paulino;
    const p = await P.store.get('paul', id);
    const g = P.rules.apply(p, { from: 0, count: 3, rules: [P.rules.newRule('weight', { amount: 2.5 })] }).program;
    return (await P.share.makeLink(g)).url;
  }, id);
  await page.goto(url);
  await page.getByRole('button', { name: 'Save & start training' }).click();
  await expect(page.getByRole('heading', { name: /Hey Marco/ })).toBeVisible();
  const prog = await page.evaluate(async () => (await window.Paulino.store.all('athlete'))[0]);
  return { programId: prog.id, firstDayId: prog.weeks[0].days[0].id, prog };
}
const card = (page, name) => page.locator('.ex-card').filter({ has: page.getByRole('heading', { name }) });

test('12 · log a workout; progress survives reloads; results and history', async ({ page }) => {
  const { programId, firstDayId } = await receiveProgram(page);
  await page.getByRole('link', { name: /Let's train/ }).click();
  await expect(page.locator('[data-counter]')).toHaveText('0/11 sets');
  const squat = card(page, 'Back squat');
  await expect(squat).toContainText('4 × 5 @ 100 kg');
  await expect(squat.locator('.tip')).toContainText('Paulino:');
  // tap Paulino's tip for another cue
  const t1 = await squat.locator('[data-cue-text]').textContent();
  await squat.locator('.tip').click();
  await expect(squat.locator('[data-cue-text]')).not.toHaveText(t1);

  await squat.getByRole('button', { name: /set 1 done/ }).click();
  await expect(page.locator('.timer-bar')).toContainText('Resting');
  await squat.getByLabel('Back squat set 2 reps done').fill('4');         // fewer reps: normal logging
  await squat.getByRole('button', { name: /set 2 done/ }).click();
  await squat.getByLabel('Back squat set 3 kg').fill('95');               // lighter: normal logging
  await squat.getByRole('button', { name: /set 3 done/ }).click();
  await expect(page.locator('.sheet-drama')).toHaveCount(0);
  await expect(page.locator('[data-counter]')).toHaveText('3/11 sets');
  await squat.getByLabel('Back squat set 4 kg').fill('120');              // heavier: gentle warning only
  await expect(squat.locator('[data-heavy]')).toBeVisible();
  await squat.getByLabel('Back squat set 4 kg').fill('100');
  await noHScroll(page);

  // close and come back
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('.boot'));
  await expect(page.locator('[data-counter]')).toHaveText('3/11 sets');
  await expect(card(page, 'Back squat').getByLabel('Back squat set 2 reps done')).toHaveValue('4');
  await expect(card(page, 'Back squat').getByLabel('Back squat set 3 kg')).toHaveValue('95');

  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByLabel('Training notes (optional)').fill('Squats felt heavy');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: 'Session done!' })).toBeVisible();
  await expect(page.locator('.paulino.mood-celebrating')).toBeVisible();
  await expect(page.locator('.res-ex').first()).toContainText('4 × 100 kg');
  await expect(page.locator('.res-ex tr.diff').first()).toContainText('4 × 100 kg');
  await expect(page.locator('.res-ex tr.miss').first()).toContainText('not done');
  await noHScroll(page);

  // program view shows it done; history lists it, after another reload
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('.boot'));
  await open(page, `#/a/p/${programId}`);
  await expect(page.locator(`[data-day="${firstDayId}"] .status-done`)).toBeVisible();
  await open(page, '#/a/history');
  await expect(page.locator('.card').filter({ hasText: 'Completed workouts' })).toContainText('Monday');
  await expect(page.locator('.card').filter({ hasText: 'Lifts' })).toContainText('100 kg × 5');
  await expect(page.locator('.card').filter({ hasText: 'Lifts' })).toContainText('5, 4, 5');
  await expect(page.getByText(/is an \s*estimate|an estimate/).first()).toBeVisible();
  await noHScroll(page);
});

test('13 · modifying the prescription triggers Paulino; 14 · restore the original', async ({ page }) => {
  const { programId, firstDayId, prog } = await receiveProgram(page);
  await open(page, `#/a/p/${programId}/d/${firstDayId}`);
  const bench = card(page, 'Bench press');

  // fewer sets → disappointed → keep the plan
  await bench.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Sets', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save change' }).click();
  const drama = page.getByRole('dialog', { name: 'Paulino is disappointed' });
  await expect(drama).toBeVisible();
  await expect(drama.locator('.paulino.mood-disappointed')).toBeVisible();
  await expect(drama.locator('.bubble')).toContainText(/YOU CHANGED MY PROGRAM|WROTE THIS FOR A REASON|Paul made this program for a reason|Paul is crying/i);
  await expect(drama).toContainText('Changing the number of sets');
  await settle(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screens/disappointed-360.png' });
  await drama.getByRole('button', { name: "Keep Paul's plan" }).click();
  await settle(page);
  await expect(bench).not.toContainText('Changed by you');

  // change anyway → saved as a local modification, original preserved
  await bench.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Sets', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.getByRole('button', { name: 'Change anyway' }).click();
  await settle(page);
  await expect(card(page, 'Bench press')).toContainText('Changed by you');
  await expect(card(page, 'Bench press')).toContainText('2 × 8 @ 70 kg');
  await expect(card(page, 'Bench press').locator('.orig')).toContainText('4 × 8 @ 70 kg');
  await expect(page.locator('[data-counter]')).toHaveText('0/9 sets');
  await expect(page.locator('.reaction .paulino.mood-disappointed').last()).toBeVisible();

  // replacing an exercise uses the "masterpiece" lines
  await card(page, 'Deadlift').getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Exercise', { exact: true }).selectOption('barbell-row');
  await page.getByRole('button', { name: 'Save change' }).click();
  await expect(page.getByRole('dialog', { name: 'Paulino is disappointed' }).locator('.bubble')).toContainText(/YOU CHANGED MY PROGRAM|WROTE THIS FOR A REASON|Paul picked that one/i);
  await page.getByRole('button', { name: 'Change anyway' }).click();
  await settle(page);
  await expect(card(page, 'Barbell row')).toContainText('Changed by you');

  const stored = await page.evaluate(async (id) => ({
    mods: (await window.Paulino.store.byProgram('mods', id)).filter((m) => m.status === 'active').map((m) => [m.type, m.original.exerciseId, m.modified.exerciseId, m.modified.sets.length]),
    program: (await window.Paulino.store.get('athlete', id)).weeks[0].days[0].exercises.map((e) => [e.exerciseId, e.sets.length]),
  }), programId);
  expect(stored.mods.sort()).toEqual([['replace', 'deadlift', 'barbell-row', 3], ['sets', 'bench-press', 'bench-press', 2]]);
  expect(stored.program).toEqual([['squat', 4], ['bench-press', 4], ['deadlift', 3]]); // Paul's prescription untouched

  // the change shows in the program overview
  await open(page, `#/a/p/${programId}`);
  await expect(page.locator(`[data-day="${firstDayId}"]`)).toContainText('You changed this');

  // 14: restore
  await open(page, `#/a/p/${programId}/d/${firstDayId}`);
  await card(page, 'Bench press').getByRole('button', { name: "Restore Paul's plan" }).click();
  await expect(card(page, 'Bench press')).not.toContainText('Changed by you');
  await expect(card(page, 'Bench press')).toContainText('4 × 8 @ 70 kg');
  await expect(page.locator('.reaction .paulino.mood-happy').last()).toBeVisible();
  await card(page, 'Barbell row').getByRole('button', { name: "Restore Paul's plan" }).click();
  await expect(card(page, 'Deadlift')).toBeVisible();
  await expect(page.locator('[data-counter]')).toHaveText('0/11 sets');
  const left = await page.evaluate(async (id) => (await window.Paulino.store.byProgram('mods', id)).map((m) => m.status), programId);
  expect(left).toEqual(['reverted', 'reverted']);
  expect(prog.weeks[0].days[0].exercises.length).toBe(3);
});

test('no disappointment for safety: pain, fatigue, lighter load, illness', async ({ page }) => {
  const { programId, firstDayId } = await receiveProgram(page);
  await open(page, `#/a/p/${programId}/d/${firstDayId}`);

  // fewer sets because of fatigue → supportive
  await card(page, 'Back squat').getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Sets', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Feeling tired or run down' }).click();
  await page.getByRole('button', { name: 'Save change' }).click();
  await expect(page.getByRole('dialog', { name: 'Paulino checks in' })).toBeVisible();
  await expect(page.locator('.sheet .mood-disappointed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save this change' }).click();
  await settle(page);
  await expect(card(page, 'Back squat')).toContainText('Changed by you');

  // lower load only (for any reason) → no drama
  await card(page, 'Deadlift').getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('kg', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save change' }).click();
  await expect(page.locator('.sheet-drama')).toHaveCount(0);
  await expect(page.locator('.reaction .paulino.mood-concerned').last()).toBeVisible();

  // pain report → safety advice
  await page.getByRole('button', { name: 'Something hurts?' }).click();
  await page.getByRole('button', { name: /Sharp, strong or worsening pain/ }).click();
  await expect(page.getByText(/stop the exercise straight away/)).toBeVisible();
  await expect(page.getByText(/doctor or physiotherapist/)).toBeVisible();
  await expect(page.locator('.mood-disappointed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop that exercise, continue with others' }).click();
  await settle(page);

  // skip a later session for illness → supportive, no disappointment
  const other = await page.evaluate(async (id) => (await window.Paulino.store.get('athlete', id)).weeks[0].days[1].id, programId);
  await open(page, `#/a/p/${programId}/d/${other}`);
  await page.getByRole('button', { name: "Can't train today?" }).click();
  await page.getByRole('button', { name: /I'm sick/ }).click();
  await expect(page.locator('.reaction').last()).toContainText('Rest up and get well soon!');
  await expect(page.locator('.mood-disappointed')).toHaveCount(0);
  await expect(page.getByText(/Skipped \(illness\)/)).toBeVisible();
});

test('backup export and restore', async ({ page, browser }) => {
  await receiveProgram(page);
  await open(page, '#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const path = 'test-results/screens/backup.json';
  await dl.saveAs(path);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const p2 = await ctx.newPage();
  await open(p2, '#/settings');
  const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByRole('button', { name: 'Restore backup' }).click()]);
  await chooser.setFiles(path);
  await expect(p2.locator('.toast')).toContainText('Restored: 1 of Paul');
  await open(p2, '#/a');
  await expect(p2.getByRole('heading', { name: /Hey Marco/ })).toBeVisible();
  await ctx.close();
});
