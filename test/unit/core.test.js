// Unit tests for the pure training logic (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick, toQuick, resolveSets, summarize } from '../../src/core/prescription.js';
import { progressionPlan, sessionOutcome } from '../../src/core/progression.js';
import { estimate1RM, personalRecords, xpForLog, weeklyStreak, adherence, nextWorkout, volume, level, XP } from '../../src/core/stats.js';
import { validateProgram, validateSets, validateExerciseLibrary, validateLog } from '../../src/core/validation.js';
import { classifyChange, effectivePrescriptions } from '../../src/core/effective.js';
import { novice5x5, emptyProgram, cloneBlock } from '../../src/core/templates.js';
import { EXERCISES } from '../../src/data/exercises.js';
import { round, addDays, weekStart, isValidIsoDate, uid } from '../../src/core/util.js';

const ids = new Set(EXERCISES.map((e) => e.id));
const kg = (reps, value) => ({ reps, reps_max: null, load: { kind: 'kg', value }, rpe: null, rir: null });

test('quick entry parses common notations', () => {
  assert.equal(parseQuick('5x5@60').sets.length, 5);
  assert.deepEqual(parseQuick('5x5@60').sets[0].load, { kind: 'kg', value: 60 });
  const r = parseQuick('3x8-10@40');
  assert.equal(r.sets[0].reps, 8);
  assert.equal(r.sets[0].reps_max, 10);
  assert.equal(parseQuick('5x3 bw').sets[0].load.kind, 'bw');
  assert.deepEqual(parseQuick('3x10 bw+2').sets[0].load, { kind: 'bw_plus', value: 2 });
  const mixed = parseQuick('1x1@100, 4x5@86%');
  assert.equal(mixed.sets.length, 5);
  assert.equal(mixed.sets[1].load.kind, 'pct_top');
  assert.equal(parseQuick('3x5@80 rpe8').sets[0].rpe, 8);
  assert.equal(parseQuick('5×5@60').sets.length, 5, 'accepts the × sign');
  assert.deepEqual(parseQuick('3x5', { kind: 'kg', value: 42.5 }).sets[0].load, { kind: 'kg', value: 42.5 }, 'reuses the current load');
});

test('quick entry rejects nonsense', () => {
  assert.ok(parseQuick('').error);
  assert.ok(parseQuick('banana').error);
  assert.ok(parseQuick('0x5@60').error);
  assert.ok(parseQuick('3x0@60').error);
  assert.ok(parseQuick('3x10-8@60').error);
  assert.ok(parseQuick('4x5@86%').error, 'first set cannot be a percentage');
  assert.ok(parseQuick('31x1@20').error);
});

test('quick entry round-trips', () => {
  for (const s of ['5x5@60', '1x1@100, 4x5@86%', '3x8-10@40', '5x3 bw', '3x10 bw+2', '3x5@80 rpe8']) {
    assert.equal(toQuick(parseQuick(s).sets), s);
  }
});

test('back-off sets use Paul’s spreadsheet formula (rounded up to 2.5 kg)', () => {
  // spreadsheet: CEILING(top / 0.9 * 0.775, 2.5)
  const top = 80;
  const pct = (0.775 / 0.9) * 100;
  const r = resolveSets([kg(1, top), { reps: 5, load: { kind: 'pct_top', value: pct } }]);
  assert.equal(r[1].kg, round((top / 0.9) * 0.775, 2.5, 'up'));
  assert.equal(r[1].kg, 70);
  assert.equal(summarize(r), '1 × 1 @ 80 kg · 1 × 5 @ 70 kg');
});

test('progression: no rule → Paul’s typed weights, untouched', () => {
  const p = novice5x5({ start: '2026-01-05', weeks: 2 });
  p.blocks.forEach((b) => b.workouts.forEach((w) => w.prescriptions.forEach((x) => { x.progression = null; })));
  const plan = progressionPlan(p, []);
  for (const v of plan.values()) { assert.equal(v.delta, 0); assert.equal(v.basis, 'manual'); }
});

test('progression: +2.5 kg after a clean session, hold after a miss or pain', () => {
  const p = novice5x5({ start: '2026-01-05', weeks: 2 });
  const workouts = p.blocks.flatMap((b) => b.workouts);
  const squats = workouts.map((w) => w.prescriptions.find((x) => x.exercise_id === 'squat'));
  const logFor = (w, presc, { hit = true, pain = false } = {}) => ({
    workout_id: w.id, status: 'completed', pain_reported: pain,
    sets: presc.sets.map((s, i) => ({ prescription_id: presc.id, set_index: i, completed: true, actual_reps: hit ? 5 : i === 4 ? 3 : 5 })),
  });
  let plan = progressionPlan(p, []);
  assert.equal(plan.get(squats[0].id).basis, 'start');
  assert.equal(plan.get(squats[1].id).basis, 'projected');
  assert.equal(plan.get(squats[1].id).top, 60);

  plan = progressionPlan(p, [logFor(workouts[0], squats[0])]);
  assert.equal(plan.get(squats[1].id).top, 62.5);
  assert.equal(plan.get(squats[1].id).basis, 'increased');

  plan = progressionPlan(p, [logFor(workouts[0], squats[0]), logFor(workouts[1], squats[1], { hit: false })]);
  assert.equal(plan.get(squats[2].id).top, 62.5, 'missed rep → same weight');
  assert.equal(plan.get(squats[2].id).basis, 'held');

  plan = progressionPlan(p, [logFor(workouts[0], squats[0], { pain: true })]);
  assert.equal(plan.get(squats[1].id).top, 60, 'pain → never increase');
  assert.equal(plan.get(squats[1].id).basis, 'held_pain');

  assert.equal(sessionOutcome(squats[0], { status: 'skipped' }), 'missed');
});

test('estimated 1RM is limited to ≤10 reps', () => {
  assert.equal(estimate1RM(100, 1), 100);
  assert.equal(estimate1RM(100, 5), 116.7);
  assert.equal(estimate1RM(100, 12), null);
  assert.equal(estimate1RM(0, 5), null);
});

const mkLog = (id, date, sets, extra = {}) => ({ id, workout_id: id, status: 'completed', completed_at: `${date}T10:00:00Z`, sets, ...extra });
const set = (ex, kgv, reps, target = kgv) => ({ exercise_id: ex, completed: true, actual_load_kg: kgv, actual_reps: reps, target: { reps: 5, kg: target } });

test('PRs: first session is the baseline; heavier later = PR', () => {
  const logs = [mkLog('a', '2026-01-05', [set('squat', 60, 5)]), mkLog('b', '2026-01-07', [set('squat', 62.5, 5)])];
  const { events, best } = personalRecords(logs);
  assert.equal(events.length, 1);
  assert.equal(events[0].kg, 62.5);
  assert.equal(best.squat.kg, 62.5);
});

test('XP rewards completion; no PR bonus above the plan or with pain', () => {
  const logs = [mkLog('a', '2026-01-05', [set('squat', 60, 5)]), mkLog('b', '2026-01-07', [set('squat', 70, 5, 62.5)])];
  const { events } = personalRecords(logs);
  assert.equal(events[0].withinPlan, false);
  assert.equal(xpForLog(logs[1], events), XP.workout + XP.set, 'heavier than prescribed: no bonus');
  const ok = [mkLog('a', '2026-01-05', [set('squat', 60, 5)]), mkLog('b', '2026-01-07', [set('squat', 62.5, 5)])];
  const ev2 = personalRecords(ok).events;
  assert.equal(xpForLog(ok[1], ev2), XP.workout + XP.set + XP.pr);
  assert.equal(xpForLog({ ...ok[1], pain_reported: true }, ev2), XP.workout + XP.set);
  assert.equal(xpForLog({ status: 'skipped', sets: [] }, []), 0);
  assert.equal(volume(ok[1]), 312.5);
  assert.equal(level(0).level, 1);
  assert.equal(level(300).level, 2);
});

test('weekly streak: sick weeks are neutral, empty weeks break it', () => {
  const today = '2026-03-18'; // Wednesday
  const w = (d) => weekStart(d);
  const logs = [
    mkLog('1', '2026-03-16', []),                                        // this week
    mkLog('2', '2026-03-10', []),                                        // last week
    { id: '3', workout_id: '3', status: 'skipped', skip_reason: 'illness', completed_at: '2026-03-03T09:00:00Z' }, // sick week
    mkLog('4', '2026-02-24', []),
    mkLog('5', '2026-02-10', []),                                        // gap week before → stops
  ];
  assert.equal(w('2026-03-18'), '2026-03-16');
  assert.equal(weeklyStreak(logs, today), 3);
  assert.equal(weeklyStreak([mkLog('2', '2026-03-10', [])], today), 1, 'not having trained yet this week does not break it');
});

test('adherence ignores future and excused sessions', () => {
  const p = novice5x5({ start: '2026-01-05', weeks: 2 });
  const ws = p.blocks.flatMap((b) => b.workouts);
  const logs = [
    { workout_id: ws[0].id, status: 'completed' },
    { workout_id: ws[1].id, status: 'skipped', skip_reason: 'illness' },
  ];
  const a = adherence(p, logs, ws[2].scheduled_date);
  assert.deepEqual([a.due, a.done], [2, 1]);
  assert.equal(nextWorkout(p, logs, ws[2].scheduled_date).workout.id, ws[2].id);
});

test('validation: templates are valid; errors are caught', () => {
  assert.deepEqual(validateProgram(novice5x5(), { exerciseIds: ids }).errors, []);
  assert.deepEqual(validateProgram(emptyProgram('X'), { exerciseIds: ids }).errors, []);
  const p = novice5x5({ weeks: 1 });
  p.name = ' ';
  p.blocks[0].end_date = addDays(p.blocks[0].start_date, -1);
  const x = p.blocks[0].workouts[0].prescriptions[0];
  x.exercise_id = 'leg-press';
  x.sets[0].reps = 0;
  x.sets[1].load.value = -5;
  p.blocks[0].workouts[1].id = p.blocks[0].workouts[0].id;
  p.blocks[0].workouts[2].scheduled_date = '2026-02-31';
  const msgs = validateProgram(p, { exerciseIds: ids }).errors.map((e) => e.message).join('\n');
  for (const frag of ['name', 'ends before', 'unknown exercise', 'reps must', "can't be negative", 'Duplicate id', 'invalid date']) assert.match(msgs, new RegExp(frag, 'i'));
  assert.ok(validateProgram({ ...novice5x5(), client_id: uid() }, { exerciseIds: ids, clientIds: new Set() }).errors.length, 'unknown client');
  assert.equal(validateSets([]).length, 1);
  assert.deepEqual(validateExerciseLibrary(EXERCISES), []);
  assert.deepEqual(validateLog({ id: uid(), workout_id: uid(), status: 'completed', client_updated_at: new Date().toISOString(), sets: [{ actual_reps: 5, actual_load_kg: 60 }] }), []);
  assert.ok(validateLog({ id: 'x', workout_id: uid(), status: 'done', client_updated_at: 'never', sets: [{ actual_reps: -1, actual_load_kg: -2 }] }).length >= 4);
  assert.ok(isValidIsoDate('2026-02-28') && !isValidIsoDate('2026-02-30'));
});

test('deviation classification', () => {
  const orig = { exercise_id: 'squat', sets: [kg(5, 60), kg(5, 60)] };
  assert.equal(classifyChange(orig, { ...orig }).primary, null);
  assert.equal(classifyChange(orig, { exercise_id: 'deadlift', sets: orig.sets }).primary, 'replace_exercise');
  assert.equal(classifyChange(orig, { exercise_id: 'squat', sets: [kg(5, 60)] }).primary, 'change_sets');
  assert.equal(classifyChange(orig, { exercise_id: 'squat', sets: [kg(3, 60), kg(3, 60)] }).primary, 'change_reps');
  assert.equal(classifyChange(orig, { exercise_id: 'deadlift', sets: [kg(3, 60)] }).primary, 'change_structure');
  assert.equal(classifyChange(orig, { removed: true }).primary, 'remove_exercise');
  assert.equal(classifyChange(null, { exercise_id: 'squat', sets: [kg(5, 20)] }).primary, 'add_exercise');
  // Changing only the weight is logging, not a structural deviation.
  assert.equal(classifyChange(orig, { exercise_id: 'squat', sets: [kg(5, 50), kg(5, 50)] }).primary, null);
});

test('effective view applies deviations but keeps Paul’s original', () => {
  const p = novice5x5({ weeks: 1 });
  const w = p.blocks[0].workouts[0];
  const x = w.prescriptions[0];
  const dev = { id: uid(), workout_id: w.id, prescription_id: x.id, status: 'active', modification_type: 'change_sets', modified: { exercise_id: 'squat', sets: [kg(5, 60)], removed: false }, created_at: '1' };
  const items = effectivePrescriptions(w, { deviations: [dev] });
  assert.equal(items[0].sets.length, 1);
  assert.equal(items[0].prescription.sets.length, 5, 'original untouched');
  assert.equal(items[0].paulSummary, '5 × 5 @ 60 kg');
  const reverted = effectivePrescriptions(w, { deviations: [{ ...dev, status: 'reverted' }] });
  assert.equal(reverted[0].sets.length, 5);
  const added = effectivePrescriptions(w, { deviations: [{ ...dev, id: uid(), prescription_id: null, modification_type: 'add_exercise', modified: { exercise_id: 'pull-up', sets: [kg(8, 0)] } }] });
  assert.equal(added.length, w.prescriptions.length + 1);
  assert.ok(added.at(-1).added);
});

test('template + cloning keep ids unique and shift dates', () => {
  const p = novice5x5({ start: '2026-01-05', weeks: 12 });
  assert.equal(p.blocks.length, 12);
  assert.equal(p.blocks.flatMap((b) => b.workouts).length, 36);
  const c = cloneBlock(p.blocks[0], 7, 'Week 13');
  assert.notEqual(c.id, p.blocks[0].id);
  assert.equal(c.workouts[0].scheduled_date, addDays(p.blocks[0].workouts[0].scheduled_date, 7));
  assert.notEqual(c.workouts[0].prescriptions[0].id, p.blocks[0].workouts[0].prescriptions[0].id);
});
