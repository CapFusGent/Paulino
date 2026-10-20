// Derived training statistics. Everything is computed from logs, never stored,
// so the athlete and Paul always see the same numbers.
import { isoDate, weekStart, addDays, daysBetween } from './util.js';
import { flattenWorkouts } from './prescription.js';

export const XP = { workout: 100, set: 5, pr: 25 };
export const MILESTONES = [1, 5, 10, 25, 50, 100, 200];

/** Estimated 1RM (Epley). Only for 1–10 reps; it is an estimate, label it so. */
export function estimate1RM(kg, reps) {
  if (!(kg > 0) || !(reps >= 1) || reps > 10) return null;
  if (reps === 1) return kg;
  return Number((kg * (1 + reps / 30)).toFixed(1));
}

export function logDate(log) {
  const t = log.completed_at || log.started_at || log.client_updated_at;
  return t ? isoDate(new Date(t)) : null;
}

const completedLogs = (logs) =>
  (logs || []).filter((l) => l.status === 'completed').sort((a, b) => String(a.completed_at || a.client_updated_at).localeCompare(String(b.completed_at || b.client_updated_at)));

/**
 * Walk all completed logs in time order and emit PR events.
 * The first time an exercise is logged sets the baseline (no PR).
 * @returns { events: [{ logId, date, exercise_id, kind: 'weight'|'reps'|'e1rm', value, reps, kg, withinPlan }],
 *            best: { [exercise_id]: { kg, reps, e1rm, bwReps } } }
 */
export function personalRecords(logs) {
  const best = {};
  const events = [];
  for (const log of completedLogs(logs)) {
    const date = logDate(log);
    const perEx = {};
    for (const s of log.sets || []) {
      if (!s.completed || !(s.actual_reps >= 1)) continue;
      const kg = Number(s.actual_load_kg) || 0;
      const e = (perEx[s.exercise_id] ||= { kg: 0, kgReps: 0, e1rm: 0, bwReps: 0, target: null, withinPlan: true });
      if (kg > e.kg || (kg === e.kg && s.actual_reps > e.kgReps)) { e.kg = kg; e.kgReps = s.actual_reps; e.target = s.target; }
      const est = estimate1RM(kg, s.actual_reps);
      if (est && est > e.e1rm) e.e1rm = est;
      if (kg === 0 && s.target?.bodyweight) e.bwReps = Math.max(e.bwReps, s.actual_reps);
    }
    for (const [ex, e] of Object.entries(perEx)) {
      const prev = best[ex];
      const targetKg = e.target?.kg ?? null;
      const withinPlan = targetKg === null || e.kg <= targetKg + 0.001;
      if (prev) {
        if (e.kg > prev.kg && e.kg > 0) events.push({ logId: log.id, date, exercise_id: ex, kind: 'weight', value: e.kg, reps: e.kgReps, kg: e.kg, withinPlan });
        else if (e.e1rm > prev.e1rm && e.e1rm > 0) events.push({ logId: log.id, date, exercise_id: ex, kind: 'e1rm', value: e.e1rm, reps: e.kgReps, kg: e.kg, withinPlan });
        else if (e.bwReps > prev.bwReps) events.push({ logId: log.id, date, exercise_id: ex, kind: 'reps', value: e.bwReps, reps: e.bwReps, kg: 0, withinPlan: true });
      }
      best[ex] = {
        kg: Math.max(prev?.kg || 0, e.kg),
        reps: e.kg >= (prev?.kg || 0) ? e.kgReps : prev.reps,
        e1rm: Math.max(prev?.e1rm || 0, e.e1rm),
        bwReps: Math.max(prev?.bwReps || 0, e.bwReps),
        date: e.kg >= (prev?.kg || 0) ? date : prev.date,
      };
    }
  }
  return { events, best };
}

export function completedSets(log) {
  return (log.sets || []).filter((s) => s.completed).length;
}

/** Total kg moved in completed weighted sets (bodyweight-only sets excluded). */
export function volume(log) {
  return (log.sets || []).reduce((a, s) => a + (s.completed ? (Number(s.actual_load_kg) || 0) * (Number(s.actual_reps) || 0) : 0), 0);
}

/**
 * XP rewards finishing the work, not lifting heavier than planned:
 * PR bonus only when the PR set stayed within Paul's prescription and no pain was reported.
 */
export function xpForLog(log, prEvents = []) {
  if (log.status !== 'completed') return 0;
  const bonus = log.pain_reported ? 0 : prEvents.filter((e) => e.logId === log.id && e.withinPlan).length * XP.pr;
  return XP.workout + completedSets(log) * XP.set + bonus;
}

export function totalXP(logs) {
  const { events } = personalRecords(logs);
  return completedLogs(logs).reduce((a, l) => a + xpForLog(l, events), 0);
}

export function level(xp) {
  // 1: 0, 2: 300, 3: 700, 4: 1200 … gentle curve
  let lvl = 1, need = 300, acc = 0;
  while (xp >= acc + need) { acc += need; lvl += 1; need += 100; }
  return { level: lvl, into: xp - acc, need };
}

/**
 * Weekly streak: consecutive weeks with at least one completed workout.
 * The current week never breaks the streak (it isn't over yet), and weeks in
 * which every planned session was skipped for illness or pain are neutral:
 * they neither add nor break. Rest is part of training.
 */
export function weeklyStreak(logs, today = isoDate()) {
  const trained = new Set();
  const excused = new Set();
  for (const l of logs || []) {
    const d = logDate(l);
    if (!d) continue;
    if (l.status === 'completed') trained.add(weekStart(d));
    else if (l.status === 'skipped' && (l.skip_reason === 'illness' || l.skip_reason === 'pain')) excused.add(weekStart(d));
  }
  let streak = 0;
  let wk = weekStart(today);
  if (trained.has(wk)) streak += 1;
  wk = addDays(wk, -7);
  for (let i = 0; i < 520; i++) {
    if (trained.has(wk)) streak += 1;
    else if (!excused.has(wk)) break;
    wk = addDays(wk, -7);
  }
  return streak;
}

/** Workouts scheduled in the week containing `today`, and how many are done. */
export function weekProgress(program, logs, today = isoDate()) {
  const start = weekStart(today);
  const end = addDays(start, 6);
  const done = new Set((logs || []).filter((l) => l.status === 'completed' || l.status === 'skipped').map((l) => l.workout_id));
  const scheduled = flattenWorkouts(program).map((x) => x.workout).filter((w) => w.scheduled_date && w.scheduled_date >= start && w.scheduled_date <= end);
  const completed = scheduled.filter((w) => (logs || []).some((l) => l.workout_id === w.id && l.status === 'completed')).length;
  return { start, end, scheduled: scheduled.length, completed, handled: scheduled.filter((w) => done.has(w.id)).length };
}

/** Share of past scheduled workouts that were completed. Excused skips don't count against. */
export function adherence(program, logs, today = isoDate()) {
  const byWorkout = new Map((logs || []).filter((l) => l.workout_id).map((l) => [l.workout_id, l]));
  let due = 0, done = 0;
  for (const { workout } of flattenWorkouts(program)) {
    if (!workout.scheduled_date || workout.scheduled_date > today) continue;
    const l = byWorkout.get(workout.id);
    if (l?.status === 'skipped' && (l.skip_reason === 'illness' || l.skip_reason === 'pain')) continue;
    due += 1;
    if (l?.status === 'completed') done += 1;
  }
  return { due, done, pct: due ? Math.round((done / due) * 100) : null };
}

/** Next workout to do: first not completed/skipped, preferring today or later. */
export function nextWorkout(program, logs, today = isoDate()) {
  const handled = new Set((logs || []).filter((l) => l.status !== 'in_progress').map((l) => l.workout_id));
  const inProgress = (logs || []).find((l) => l.status === 'in_progress' && l.workout_id);
  const all = flattenWorkouts(program);
  if (inProgress) {
    const hit = all.find((x) => x.workout.id === inProgress.workout_id);
    if (hit) return { ...hit, inProgress: true };
  }
  const open = all.filter((x) => !handled.has(x.workout.id));
  const upcoming = open.find((x) => !x.workout.scheduled_date || x.workout.scheduled_date >= today);
  const overdue = open.filter((x) => x.workout.scheduled_date && x.workout.scheduled_date < today);
  // A recently missed session (within 3 days) is still the natural next one.
  const recent = overdue.reverse().find((x) => daysBetween(x.workout.scheduled_date, today) <= 3);
  return recent || upcoming || null;
}

export function milestoneReached(countBefore, countAfter) {
  return MILESTONES.find((m) => countBefore < m && countAfter >= m) || null;
}

/** Points for the lift chart: per log date, heaviest completed set and best estimated 1RM. */
export function liftHistory(logs, exerciseId) {
  const pts = [];
  for (const l of completedLogs(logs)) {
    const sets = (l.sets || []).filter((s) => s.exercise_id === exerciseId && s.completed && s.actual_reps >= 1);
    if (!sets.length) continue;
    let top = null, e1rm = 0, reps = 0, vol = 0;
    for (const s of sets) {
      const kg = Number(s.actual_load_kg) || 0;
      if (top === null || kg > top || (kg === top && s.actual_reps > reps)) { top = kg; reps = s.actual_reps; }
      e1rm = Math.max(e1rm, estimate1RM(kg, s.actual_reps) || 0);
      vol += kg * s.actual_reps;
    }
    pts.push({ date: logDate(l), logId: l.id, top, reps, e1rm: e1rm || null, sets: sets.length, volume: vol });
  }
  return pts;
}
