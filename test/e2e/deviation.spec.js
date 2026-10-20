// Client modifies Paul's prescription → Paulino's disappointed reaction,
// keep-the-plan, do-it-anyway, restore, and the coach's comparison view.
import { test, expect } from '@playwright/test';
import { seedCoach, signInCoach, waitSynced, anonRpc, noHorizontalScroll } from './helpers.js';

test('changing the plan triggers Paulino; deviation is stored next to the original; restore works', async ({ page, browser }) => {
  const seed = await seedCoach();
  await page.goto(seed.link);
  await page.getByRole('link', { name: /Let's train/ }).click();
  const card = page.locator('.ex-card').first();
  await expect(card).toContainText('5 × 5 @ 60 kg');

  // 1) Attempt → disappointed → keep the plan
  await card.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Sets').fill('3');
  await page.getByRole('button', { name: 'Save change' }).click();
  const drama = page.getByRole('dialog', { name: 'Paulino is disappointed' });
  await expect(drama).toBeVisible();
  await expect(drama.locator('.paulino.mood-disappointed')).toBeVisible();
  await expect(drama.locator('.bubble')).not.toBeEmpty();
  await expect(drama).toContainText('Changed number of sets');
  await noHorizontalScroll(page);
  await page.waitForTimeout(400); // let the sheet finish animating in
  await page.screenshot({ path: 'test-results/screens/deviation-drama-360.png' });
  await drama.getByRole('button', { name: 'Sorry, Paulino. Keep the plan.' }).click();
  await expect(drama).toHaveCount(0);
  await expect(card).not.toContainText('Changed by you');

  // 2) Attempt → do it anyway → saved as deviation
  await card.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Sets').fill('3');
  await page.getByLabel('Reps per set').fill('3');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.getByRole('button', { name: "I'm doing it anyway!" }).click();
  await expect(card).toContainText('Changed by you');
  await expect(card).toContainText('3 × 3 @ 60 kg');
  await expect(card.locator('.orig')).toHaveText('5 × 5 @ 60 kg');
  await expect(page.locator('.reaction .paulino.mood-disappointed')).toBeVisible();
  await waitSynced(page);

  let b = await anonRpc('client_get_bundle', { p_token: seed.client.access_token });
  let dev = b.deviations.find((d) => d.status === 'active');
  expect(dev.modification_type).toBe('change_structure');
  expect(dev.original.sets).toHaveLength(5);
  expect(dev.modified.sets).toHaveLength(3);
  expect(b.program.blocks.flatMap((x) => x.workouts).find((w) => w.id === dev.workout_id).prescriptions[0].sets).toHaveLength(5);

  // 3) Paul sees original vs modified
  const laptop = await browser.newContext();
  const coach = await laptop.newPage();
  await signInCoach(coach, seed.email);
  await expect(coach.getByText('1 changed')).toBeVisible();
  await coach.locator('a[data-client]').first().click();
  const row = coach.locator('.card').filter({ hasText: 'Changed the structure' }).first();
  await expect(row).toContainText('5 × 5 @ 60 kg');
  await expect(row).toContainText('3 × 3 @ 60 kg');
  await expect(row).toContainText('Just want to');

  // 4) Athlete restores Paul's plan
  await card.getByRole('button', { name: "Restore Paul's plan" }).click();
  await expect(card).not.toContainText('Changed by you');
  await expect(card).toContainText('5 × 5 @ 60 kg');
  await waitSynced(page);
  b = await anonRpc('client_get_bundle', { p_token: seed.client.access_token });
  expect(b.deviations.find((d) => d.id === dev.id).status).toBe('reverted');
  await coach.reload();
  await expect(coach.locator('.card').filter({ hasText: 'Changed the structure' }).first()).toContainText('restored to your plan');
  await laptop.close();
});

test('pain as the reason is supportive, never disappointed; swapping exercise is tracked', async ({ page }) => {
  const seed = await seedCoach();
  await page.goto(seed.link);
  await page.getByRole('link', { name: /Let's train/ }).click();
  const card = page.locator('.ex-card').nth(1);
  await card.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Exercise', { exact: true }).selectOption('overhead-press');
  await page.getByLabel('Weight (kg)').fill('25');
  await page.getByRole('button', { name: 'Pain or discomfort' }).click();
  await page.getByRole('button', { name: 'Save change' }).click();
  await expect(page.getByRole('dialog', { name: 'Paulino checks in' })).toBeVisible();
  await expect(page.locator('.mood-disappointed')).toHaveCount(0);
  await expect(page.getByText(/stop the exercise straight away/)).toBeVisible();
  await page.getByRole('button', { name: 'Save this change' }).click();
  await expect(card).toContainText('Overhead press');
  await expect(card).toContainText('Pain or discomfort');
  await waitSynced(page);
  const b = await anonRpc('client_get_bundle', { p_token: seed.client.access_token });
  const dev = b.deviations.find((d) => d.status === 'active');
  expect(dev.reason).toBe('pain');
  expect(dev.modification_type).toBe('replace_exercise');
  expect(dev.original.exercise_id).toBe('bench-press');
});

test('removing an exercise is a deviation; logging lower weight is not', async ({ page }) => {
  const seed = await seedCoach();
  await page.goto(seed.link);
  await page.getByRole('link', { name: /Let's train/ }).click();
  const card = page.locator('.ex-card').nth(2);
  await card.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: 'Remove from today' }).click();
  await expect(page.getByRole('dialog', { name: 'Paulino is disappointed' })).toContainText('Removed exercise');
  await page.getByRole('button', { name: "I'm doing it anyway!" }).click();
  await expect(card).toContainText('Removed by you');
  await page.getByRole('link', { name: 'Start workout' }).click();
  await expect(page.locator('.log-ex')).toHaveCount(2);
  await page.locator('.set-row').first().getByLabel(/Set 1 weight/).fill('40');
  await page.locator('.set-row').first().getByRole('button', { name: /Mark set 1 done/ }).click();
  await expect(page.locator('.sheet-drama')).toHaveCount(0);
  await expect(page.locator('[data-heavy]')).toHaveCount(0);
  // heavier than the plan → gentle concern, still no drama
  await page.locator('.set-row').nth(1).getByLabel(/Set 2 weight/).fill('100');
  await expect(page.locator('[data-heavy]')).toHaveCount(1);
  await expect(page.locator('.sheet-drama')).toHaveCount(0);
});
