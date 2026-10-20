// Athlete flows on one device and sync to Paul on another.
import { test, expect } from '@playwright/test';
import { seedCoach, signInCoach, waitSynced, noHorizontalScroll, anonRpc } from './helpers.js';

test('athlete opens link, records sets, completes workout; Paul sees it on his device', async ({ browser }) => {
  const seed = await seedCoach();
  const phone = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true });
  const page = await phone.newPage();
  await page.goto(seed.link);
  await expect(page.getByRole('heading', { name: /Hey Leo/ })).toBeVisible();
  await expect(page.getByText('E2E 5×5')).toBeVisible();
  await expect(page.locator('.paulino .bubble').first()).not.toBeEmpty();
  await noHorizontalScroll(page);

  // Tap Paulino → another line
  const bubble = page.locator('.paulino .bubble-text').first();
  const first = await bubble.textContent();
  await page.locator('.paulino-figure').first().click();
  await expect(bubble).not.toHaveText(first);

  await page.getByRole('link', { name: /Let's train|Continue workout/ }).click();
  await expect(page.locator('.ex-card').first()).toBeVisible();
  await expect(page.locator('.ex-card .tip').first()).toContainText('Paulino:');
  await noHorizontalScroll(page);
  await page.getByRole('link', { name: 'Start workout' }).click();

  // Log: first set as prescribed, second with fewer reps (normal logging, no drama)
  await expect(page.locator('[data-counter]')).toHaveText(/0\/\d+ sets/);
  const rows = page.locator('.set-row');
  await rows.nth(0).getByRole('button', { name: /Mark set 1 done/ }).click();
  await expect(page.locator('.timer-bar')).toContainText('Resting');
  await rows.nth(1).getByLabel('Set 2 reps').fill('3');
  await rows.nth(1).getByRole('button', { name: /Mark set 2 done/ }).click();
  await expect(page.locator('.sheet-drama')).toHaveCount(0);
  await rows.nth(2).getByLabel(/Set 3 weight/).fill('55');
  await rows.nth(2).getByRole('button', { name: /Mark set 3 done/ }).click();
  await expect(page.locator('[data-counter]')).toHaveText(/3\/\d+ sets/);
  await noHorizontalScroll(page);

  // Closing the app and coming back keeps everything
  await page.reload();
  await expect(page.locator('[data-counter]')).toHaveText(/3\/\d+ sets/);
  await expect(rows.nth(1).getByLabel('Set 2 reps')).toHaveValue('3');

  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: '7', exact: true }).click();
  await page.getByLabel('Notes for Paul (optional)').fill('Felt good');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: /Session done/i })).toBeVisible();
  await expect(page.locator('.paulino.mood-happy')).toBeVisible();
  await expect(page.getByText(/\+1\d\d/)).toBeVisible(); // XP earned
  await noHorizontalScroll(page);
  await waitSynced(page);

  // Paul, on his own device
  const laptop = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const coach = await laptop.newPage();
  await signInCoach(coach, seed.email);
  await coach.locator('a[data-client]').first().click();
  await expect(coach.getByRole('heading', { name: 'Leo' })).toBeVisible();
  const session = coach.locator('details.card').filter({ hasText: 'Day A' }).first();
  await session.locator('summary').click();
  await expect(session).toContainText('Felt good');
  await expect(session.locator('tr.diff').first()).toContainText('3 × 60');
  await expect(session.locator('tr.diff').nth(1)).toContainText('5 × 55');
  await expect(session.locator('tr.miss').first()).toContainText('not done');

  // Progress page shows history & estimate label
  await page.goto(`${seed.link}/progress`);
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await expect(page.getByText(/is an estimate|an estimate/).first()).toBeVisible();
  await expect(page.locator('.cal-d.done')).toHaveCount(1);
  await noHorizontalScroll(page);

  await phone.close();
  await laptop.close();
});

test('skipping for illness is supportive and keeps the streak', async ({ page }) => {
  const seed = await seedCoach();
  await page.goto(seed.link);
  await page.getByRole('link', { name: /Let's train/ }).click();
  await page.getByRole('button', { name: "Can't train this one?" }).click();
  await expect(page.locator('.sheet .mood-disappointed')).toHaveCount(0);
  await page.getByRole('button', { name: /I'm sick/ }).click();
  await expect(page.getByText('Rest up and get well soon!').first()).toBeVisible();
  await expect(page.getByText(/You skipped this session/)).toBeVisible();
  await waitSynced(page);
  const b = await anonRpc('client_get_bundle', { p_token: seed.client.access_token });
  expect(b.logs.find((l) => l.status === 'skipped').skip_reason).toBe('illness');
});

test('pain report shows safety advice, not disappointment', async ({ page }) => {
  const seed = await seedCoach();
  await page.goto(seed.link);
  await page.getByRole('link', { name: /Let's train/ }).click();
  await page.getByRole('link', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Something hurts?' }).click();
  await page.getByRole('button', { name: /Sharp, strong or worsening pain/ }).click();
  await expect(page.getByText(/stop the exercise straight away/)).toBeVisible();
  await expect(page.getByText(/doctor or physiotherapist/)).toBeVisible();
  await expect(page.locator('.mood-disappointed')).toHaveCount(0);
  await page.getByRole('button', { name: 'End the workout here' }).click();
  await expect(page.getByLabel('I felt pain during this session')).toBeChecked();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: /Session logged/ })).toBeVisible();
  await expect(page.locator('.paulino.mood-concerned')).toBeVisible();
  await expect(page.locator('.burst i')).toHaveCount(0);
});
