// Paul's core workflow through the UI:
// create program → configure exercises → name → save → share → edit → duplicate.
import { test, expect } from '@playwright/test';
import { uniqueEmail, TEST_PASSWORD, noHorizontalScroll, anonRpc } from './helpers.js';

test('coach creates, names, saves, shares, edits and duplicates a program', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const email = uniqueEmail();

  // Create the coach account
  await page.goto('/#/coach');
  await page.getByRole('button', { name: /Create the coach account/ }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /Hi Paul/ })).toBeVisible();
  await noHorizontalScroll(page);

  // Add an athlete → link is shown right away
  await page.getByRole('button', { name: /Add athlete/ }).click();
  await page.getByLabel('Name').fill('Leo');
  await page.getByRole('button', { name: /Add & get link/ }).click();
  const link = await page.getByLabel('Personal link').inputValue();
  expect(link).toMatch(/#\/a\/[0-9a-f]{64}$/);
  await page.getByRole('button', { name: 'Done' }).click();

  // New blank program
  await page.getByRole('button', { name: /New program/ }).click();
  await page.getByLabel('Program name').fill('Leo: strength block');
  await page.locator('#n-client').selectOption({ label: 'Leo' });
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByLabel('Program name')).toHaveValue('Leo: strength block');
  await noHorizontalScroll(page);

  // Week 1 is open: add a workout and two exercises
  await page.getByRole('button', { name: /Add workout/ }).click();
  await page.getByRole('button', { name: /Add exercise/ }).click();
  await page.getByRole('button', { name: /^Back squat/ }).click();
  const quick = page.locator('[data-quick]').first();
  await quick.fill('5x5@60');
  await quick.press('Enter');
  await expect(page.locator('.ed-presc .ex-presc').first()).toHaveText('5 × 5 @ 60 kg');
  await page.getByRole('button', { name: /Add exercise/ }).click();
  await page.getByRole('button', { name: /^Bench press/ }).click();
  const quick2 = page.locator('[data-quick]').nth(1);
  await quick2.fill('1x1@80, 4x5@86%');
  await page.locator('[data-apply]').nth(1).click();
  await expect(page.locator('.ed-presc .ex-presc').nth(1)).toHaveText('1 × 1 @ 80 kg · 4 × 5 @ 70 kg');
  // Reorder: bench up
  await page.locator('.ed-presc').nth(1).getByRole('button', { name: 'Move up' }).click();
  await expect(page.locator('.ed-presc select[data-f=exercise_id]').first()).toHaveValue('bench-press');

  // Publish & save → share sheet
  await page.getByRole('button', { name: 'Active' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Share with Leo/ })).toBeVisible();
  expect(await page.getByLabel('Personal link').inputValue()).toBe(link);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-save-state]')).toContainText('version 1');

  // The athlete link now serves this program
  const token = link.split('/a/')[1];
  const bundle = await anonRpc('client_get_bundle', { p_token: token });
  expect(bundle.program.name).toBe('Leo: strength block');
  expect(bundle.program.blocks[0].workouts[0].prescriptions.map((x) => x.exercise_id)).toEqual(['bench-press', 'squat']);

  // Edit: change squat load, autosave draft survives reload, then save v2
  await page.locator('[data-quick]').nth(1).fill('5x5@62.5');
  await page.locator('[data-apply]').nth(1).click();
  await expect(page.locator('[data-save-state]')).toContainText('Unsaved');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByText('Your unsaved changes were restored')).toBeVisible();
  await page.getByRole('button', { name: 'Save program' }).click();
  await expect(page.locator('[data-save-state]')).toContainText('version 2');
  const b2 = await anonRpc('client_get_bundle', { p_token: token });
  expect(b2.program.blocks[0].workouts[0].prescriptions[1].sets[0].load.value).toBe(62.5);

  // Validation blocks a bad save
  await page.getByLabel('Program name').fill('');
  await page.getByRole('button', { name: 'Save program' }).click();
  await expect(page.getByText('Give the program a name')).toBeVisible();
  await page.getByLabel('Program name').fill('Leo: strength block');

  // Duplicate from the dashboard
  await page.getByRole('button', { name: 'Back' }).first().click();
  await page.getByRole('button', { name: /Duplicate Leo: strength block/ }).click();
  await page.getByLabel('New name').fill('Leo: block 2');
  await page.getByLabel('Move all dates by (days)').fill('7');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByLabel('Program name')).toHaveValue('Leo: block 2');
  await expect(page.locator('[data-save-state]')).toContainText('version 1');
});
