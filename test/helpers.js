// Shared test helpers. Every test fails on any uncaught JavaScript error or
// console.error in the page.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(`console: ${m.text()}`); });
    await use(page);
    expect(errors, 'JavaScript errors in the page').toEqual([]);
  },
});
export { expect };

export async function open(page, hash = '#/') {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => window.Paulino?.app && !document.querySelector('.boot'));
}

export async function noHScroll(page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `page is ${sw}px wide in a ${iw}px viewport`).toBeLessThanOrEqual(iw);
}

/** Wait for sheets to finish opening/closing animations. */
export async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('.sheet-wrap:not(.in), .sheet-wrap.out'));
}

/**
 * Seed one of Paul's programs directly in storage: Week 1 "Monday" with
 * squat 4×5@100, bench 4×8@70, deadlift 3×5@120 (the example from the brief).
 */
export async function seedPaulProgram(page, { name = 'Strength block', athlete = 'Marco', weeks = 12 } = {}) {
  return page.evaluate(async ({ name, athlete, weeks }) => {
    const P = window.Paulino;
    const p = P.model.newProgram({ name, athlete, startDate: '2026-11-02', durationWeeks: weeks });
    const d = p.weeks[0].days[0];
    d.name = 'Monday';
    d.exercises.push(
      P.model.newExercise('squat', { sets: 4, reps: 5, kg: 100 }),
      P.model.newExercise('bench-press', { sets: 4, reps: 8, kg: 70 }),
      P.model.newExercise('deadlift', { sets: 3, reps: 5, kg: 120 }),
    );
    const t = P.model.newDay('Thursday', 3);
    t.exercises.push(P.model.newExercise('overhead-press', { sets: 3, reps: 8, kg: 40 }), P.model.newExercise('pull-up', { sets: 3, reps: 6 }));
    p.weeks[0].days.push(t);
    await P.store.put('paul', p);
    return p.id;
  }, { name, athlete, weeks });
}

export const getPaul = (page, id) => page.evaluate((id) => window.Paulino.store.get('paul', id), id);
