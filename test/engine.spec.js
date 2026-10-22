// Rule engine, validation and link/file encoding, run inside the real page.
import { test, expect, open } from './helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

// Builds the brief's example week inside the page and runs `fn` against it.
const withProgram = (page, fn, arg) => page.evaluate(async ([src, arg]) => {
  const P = window.Paulino;
  const p = P.model.newProgram({ name: 'T', startDate: '2026-11-02', durationWeeks: 12 });
  const d = p.weeks[0].days[0];
  d.exercises.push(P.model.newExercise('squat', { sets: 4, reps: 5, kg: 100 }), P.model.newExercise('bench-press', { sets: 4, reps: 8, kg: 70 }), P.model.newExercise('deadlift', { sets: 3, reps: 5, kg: 120 }));
  const fn = new Function('P', 'p', 'arg', `return (${src})(P, p, arg);`);
  return fn(P, p, arg);
}, [fn.toString(), arg]);

const kgOf = (P, prog, wi, ei) => prog.weeks[wi].days[0].exercises[ei].sets.map((s) => s.kg);

test('repeat week 1 unchanged for 12 weeks', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    const { program, report } = P.rules.apply(p, { from: 0, count: 11, rules: [] });
    return { weeks: program.weeks.length, report, same: program.weeks.every((w) => JSON.stringify(w.days[0].exercises.map((e) => e.sets)) === JSON.stringify(p.weeks[0].days[0].exercises.map((e) => e.sets))), ids: new Set(program.weeks.flatMap((w) => [w.id, ...w.days.flatMap((d) => [d.id, ...d.exercises.map((e) => e.id)])])).size };
  });
  expect(r.weeks).toBe(12);
  expect(r.same).toBe(true);
  expect(r.report.generated).toBe(11);
  expect(r.ids).toBe(12 * (1 + 1 + 3)); // every week, day and exercise has its own id
});

test('squat +2.5 kg every week, others unchanged', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    const rule = P.rules.newRule('weight', { amount: 2.5, every: 1, scope: { type: 'lifts', ids: ['squat'] } });
    const { program } = P.rules.apply(p, { from: 0, count: 3, rules: [rule] });
    return program.weeks.map((w) => w.days[0].exercises.map((e) => e.sets[0].kg));
  });
  expect(r).toEqual([[100, 70, 120], [102.5, 70, 120], [105, 70, 120], [107.5, 70, 120]]);
});

test('bench +1 rep every two weeks, with a maximum', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    const rule = P.rules.newRule('reps', { amount: 1, every: 2, max: 10, scope: { type: 'lifts', ids: ['bench-press'] } });
    const { program } = P.rules.apply(p, { from: 0, count: 7, rules: [rule] });
    return program.weeks.map((w) => w.days[0].exercises[1].sets[0].reps);
  });
  expect(r).toEqual([8, 8, 9, 9, 10, 10, 10, 10]); // weeks 3 and 5 go up, capped at 10
});

test('different rules for different exercises + percent + sets', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    const rules = [
      P.rules.newRule('weight', { amount: 2.5, every: 1, scope: { type: 'lifts', ids: ['squat'] } }),
      P.rules.newRule('weight', { amount: 1.25, every: 1, round: 1.25, scope: { type: 'lifts', ids: ['bench-press'] } }),
      P.rules.newRule('weight', { amount: 5, every: 2, scope: { type: 'lifts', ids: ['deadlift'] } }),
      P.rules.newRule('sets', { amount: 1, every: 4, max: 5, scope: { type: 'lifts', ids: ['deadlift'] } }),
    ];
    const { program } = P.rules.apply(p, { from: 0, count: 8, rules });
    const pct = P.rules.apply(p, { from: 0, count: 4, rules: [P.rules.newRule('percent', { amount: 2, every: 2, round: 0, scope: { type: 'lifts', ids: ['squat'] } })] }).program;
    return {
      week5: program.weeks[4].days[0].exercises.map((e) => [e.sets.length, e.sets[0].kg]),
      week9: program.weeks[8].days[0].exercises.map((e) => [e.sets.length, e.sets[0].kg]),
      pct: pct.weeks.map((w) => w.days[0].exercises[0].sets[0].kg),
    };
  });
  expect(r.week5).toEqual([[4, 110], [4, 75], [4, 130]]);
  expect(r.week9).toEqual([[4, 120], [4, 80], [5, 140]]); // sets capped at 5
  expect(r.pct).toEqual([100, 100, 102, 102, 104.04]); // compounding every 2 weeks, no rounding
});

test('deload every 4th week, with and without restart', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    const up = P.rules.newRule('weight', { amount: 2.5, every: 1, scope: { type: 'lifts', ids: ['squat'] } });
    const dl = P.rules.newRule('deload', { every: 4, deloadPct: 10, deloadSets: 1 });
    const a = P.rules.apply(p, { from: 0, count: 7, rules: [up, dl] });
    const b = P.rules.apply(p, { from: 0, count: 7, rules: [up, { ...dl, reset: true }] });
    return {
      squat: a.program.weeks.map((w) => w.days[0].exercises[0].sets[0].kg),
      sets: a.program.weeks.map((w) => w.days[0].exercises[0].sets.length),
      flags: a.program.weeks.map((w) => Boolean(w.gen?.deload)),
      deloadWeeks: a.report.deloadWeeks,
      reset: b.program.weeks.map((w) => w.days[0].exercises[0].sets[0].kg),
    };
  });
  // 107.5 × 0.9 = 96.75 → 97.5 (rounded to 2.5); progression continues afterwards
  expect(r.squat).toEqual([100, 102.5, 105, 97.5, 110, 112.5, 115, 105]);
  expect(r.sets).toEqual([4, 4, 4, 3, 4, 4, 4, 3]);
  expect(r.flags).toEqual([false, false, false, true, false, false, false, true]);
  expect(r.deloadWeeks).toEqual([4, 8]);
  expect(r.reset).toEqual([100, 102.5, 105, 97.5, 100, 102.5, 105, 97.5]);
});

test('constraints: never negative weights or invalid reps/sets', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    const rules = [P.rules.newRule('weight', { amount: -40, every: 1 }), P.rules.newRule('reps', { amount: -3, every: 1 }), P.rules.newRule('sets', { amount: -2, every: 1 })];
    const { program } = P.rules.apply(p, { from: 0, count: 5, rules });
    const last = program.weeks[5].days[0].exercises;
    const min = P.rules.apply(p, { from: 0, count: 5, rules: [P.rules.newRule('weight', { amount: -10, every: 1, min: 80, scope: { type: 'lifts', ids: ['squat'] } })] }).program;
    return { last: last.map((e) => [e.sets.length, e.sets[0].reps, e.sets[0].kg]), min: min.weeks.map((w) => w.days[0].exercises[0].sets[0].kg), errors: P.model.validate(program) };
  });
  expect(r.last).toEqual([[1, 1, 0], [1, 1, 0], [1, 1, 0]]);
  expect(r.min).toEqual([100, 90, 80, 80, 80, 80]);
  expect(r.errors).toEqual([]);
});

test('rule validation catches bad input', async ({ page }) => {
  const errs = await page.evaluate(() => {
    const R = window.Paulino.rules;
    return {
      zero: R.validate([R.newRule('weight', { amount: 0 })], { count: 4, weeks: 1 }),
      every: R.validate([R.newRule('reps', { every: 0 })], { count: 4, weeks: 1 }),
      pct: R.validate([R.newRule('percent', { amount: -150 })], { count: 4, weeks: 1 }),
      frac: R.validate([R.newRule('sets', { amount: 1.5 })], { count: 4, weeks: 1 }),
      scope: R.validate([R.newRule('weight', { scope: { type: 'lifts', ids: [] } })], { count: 4, weeks: 1 }),
      minmax: R.validate([R.newRule('weight', { min: 100, max: 50 })], { count: 4, weeks: 1 }),
      count: R.validate([], { count: 0, weeks: 1 }),
      ok: R.validate([R.newRule('weight'), R.newRule('deload')], { count: 11, weeks: 1 }),
    };
  });
  for (const k of ['zero', 'every', 'pct', 'frac', 'scope', 'minmax', 'count']) expect(errs[k].length, k).toBeGreaterThan(0);
  expect(errs.ok).toEqual([]);
});

test('manual edits are kept when regenerating', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    const rule = P.rules.newRule('weight', { amount: 2.5 });
    let { program } = P.rules.apply(p, { from: 0, count: 11, rules: [rule] });
    const e = program.weeks[6].days[0].exercises[0];           // week 7 squat
    e.sets.forEach((s) => { s.kg = 90; }); e.edited = true;      // Paul lowers it by hand
    const again = P.rules.apply(program, { from: 0, count: 11, rules: [rule], keepEdited: true });
    const over = P.rules.apply(program, { from: 0, count: 11, rules: [rule], keepEdited: false });
    return { kept: again.program.weeks[6].days[0].exercises[0].sets[0].kg, keptN: again.report.keptEdits, replaced: over.program.weeks[6].days[0].exercises[0].sets[0].kg, wk8: again.program.weeks[7].days[0].exercises[0].sets[0].kg };
  });
  expect(r.kept).toBe(90);
  expect(r.keptN).toBe(1);
  expect(r.replaced).toBe(115);
  expect(r.wk8).toBe(117.5);
});

test('program validation', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    const ok = P.model.validate(p);
    const bad = P.util.clone(p);
    bad.name = ''; bad.startDate = '2026-02-30';
    bad.weeks[0].days[0].exercises[0].exerciseId = 'leg-press';
    bad.weeks[0].days[0].exercises[1].sets[0].reps = 0;
    bad.weeks[0].days[0].exercises[2].sets[0].kg = -5;
    bad.weeks[0].days[0].exercises.push({ ...bad.weeks[0].days[0].exercises[0] }); // duplicate id
    return { ok, bad: P.model.validate(bad).join('\n') };
  });
  expect(r.ok).toEqual([]);
  for (const frag of ['name', 'start date', 'exercise list', 'reps must', 'weight must', 'duplicate id']) expect(r.bad).toMatch(new RegExp(frag, 'i'));
});

test('link encoding round-trips, is compressed, and rejects damage', async ({ page }) => {
  const r = await withProgram(page, async (P, p) => {
    const big = P.rules.apply(p, { from: 0, count: 11, rules: [P.rules.newRule('weight')] }).program;
    big.notes = 'Warm up first. Rest 2–3 min. “Quotes” & ünïcödé.';
    const link = await P.share.makeLink(big);
    const token = link.url.split('#program=')[1];
    const back = await P.share.decode(token);
    const errs = [];
    for (const t of [token.slice(0, token.length / 2), 'z1.!!!', 'x9.abc', 'nope', `${token.slice(0, -3)}AAA`]) {
      try { await P.share.decode(t); errs.push(null); } catch (e) { errs.push(e.message); }
    }
    const plain = JSON.stringify(P.share.toCompact(big)).length;
    // Links carry the training content; editor-only flags (generated / edited) stay with Paul.
    const content = (prog) => JSON.stringify(prog.weeks.map((w) => [w.id, w.label, Boolean(w.gen?.deload), w.days.map((d) => [d.id, d.name, d.weekday, d.notes, d.exercises.map((e) => [e.id, e.exerciseId, e.sets, e.rest, e.tempo, e.notes])])]));
    return { same: content(P.model.normalize(big)) === content(back), notes: back.notes, prefix: token.slice(0, 3), len: link.length, plain, level: link.level, errs };
  });
  expect(r.same).toBe(true);
  expect(r.notes).toContain('ünïcödé');
  expect(r.prefix).toBe('z1.');
  expect(r.len).toBeLessThan(r.plain); // compression works
  expect(['ok', 'warn']).toContain(r.level);
  expect(r.errs.every((e) => typeof e === 'string' && e.length > 10)).toBe(true);
});

test('.paulino files validate their schema', async ({ page }) => {
  const r = await withProgram(page, (P, p) => {
    p.name = 'Strength'; p.athlete = 'Marco';
    const f = P.share.toFile(p);
    const back = P.share.fromFile(f.text);
    const tryIt = (t) => { try { P.share.fromFile(t); return null; } catch (e) { return e.message; } };
    const data = JSON.parse(f.text);
    return {
      name: f.name, ok: back.name, format: data.format, v: data.v,
      notJson: tryIt('hello'), wrong: tryIt('{"a":1}'), newer: tryIt(JSON.stringify({ ...data, v: 99 })),
      invalid: tryIt(JSON.stringify({ ...data, weeks: [{ id: 'w', days: [{ id: 'd', name: 'x', weekday: 0, exercises: [{ id: 'e', exerciseId: 'squat', sets: [{ reps: -1, kg: 10 }] }] }] }] })),
    };
  });
  expect(r.name).toBe('Marco_Strength.paulino');
  expect(r.ok).toBe('Strength');
  expect([r.format, r.v]).toEqual(['paulino-program', 1]);
  expect(r.notJson).toMatch(/not valid JSON/);
  expect(r.wrong).toMatch(/isn't a Paulino program/);
  expect(r.newer).toMatch(/newer version/);
  expect(r.invalid).toMatch(/reps must/);
});
