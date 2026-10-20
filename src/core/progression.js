// Optional, coach-configured load progression.
//
// Nothing here ever changes a load unless Paul switched on a rule for that
// prescription. The only rule type mirrors Paul's spreadsheet:
//
//   linear  — next time this exercise comes up, add `increment_kg` if every
//             prescribed set was completed at its target reps; otherwise
//             repeat the same weight. A session where pain was reported never
//             triggers an increase.
//
// The rule applies along the program order (blocks, then workouts). Paul's
// entered weight on the first occurrence is the starting point; later
// occurrences with the rule follow the chain. Switching the rule off on one
// prescription makes Paul's typed weight authoritative again (e.g. a deload),
// and the chain continues from there.
import { flattenWorkouts } from './prescription.js';

export function topLoad(sets) {
  const l = sets?.[0]?.load;
  if (!l) return null;
  if (l.kind === 'kg' || l.kind === 'bw_plus') return { kind: l.kind, value: Number(l.value) };
  return null;
}

/**
 * Outcome of a previous session for one prescription.
 * @returns 'hit' | 'missed' | 'pain' | 'pending'
 */
export function sessionOutcome(prescription, log) {
  if (!log || log.status === 'in_progress') return 'pending';
  if (log.status === 'skipped') return 'missed';
  if (log.pain_reported) return 'pain';
  const sets = (log.sets || []).filter((s) => s.prescription_id === prescription.id);
  const hit = prescription.sets.every((target, i) => {
    const s = sets.find((x) => x.set_index === i);
    return s && s.completed && Number(s.actual_reps) >= Number(target.reps);
  });
  return hit ? 'hit' : 'missed';
}

/**
 * @returns Map<prescriptionId, { top, delta, basis, increment }>
 *   basis: 'manual' (no rule) | 'start' | 'increased' | 'held' | 'held_pain' | 'projected'
 */
export function progressionPlan(program, logs = []) {
  const logByWorkout = new Map();
  for (const l of logs) if (l.workout_id) logByWorkout.set(l.workout_id, l);
  const last = new Map(); // exercise_id → { top, kind, presc, workoutId }
  const out = new Map();

  for (const { workout } of flattenWorkouts(program)) {
    for (const p of workout.prescriptions || []) {
      const own = topLoad(p.sets);
      const rule = p.progression && p.progression.type === 'linear' ? p.progression : null;
      let top = own ? own.value : null;
      let basis = 'manual';
      const prev = last.get(p.exercise_id);
      if (rule && own) {
        if (!prev || prev.kind !== own.kind) basis = 'start';
        else {
          const outcome = sessionOutcome(prev.presc, logByWorkout.get(prev.workoutId));
          if (outcome === 'hit') { top = prev.top + Number(rule.increment_kg); basis = 'increased'; }
          else if (outcome === 'pain') { top = prev.top; basis = 'held_pain'; }
          else if (outcome === 'missed') { top = prev.top; basis = 'held'; }
          else { top = prev.top; basis = 'projected'; }
        }
      }
      top = top === null ? null : Number(top.toFixed(3));
      out.set(p.id, { top, delta: own && top !== null ? Number((top - own.value).toFixed(3)) : 0, basis, increment: rule ? Number(rule.increment_kg) : 0 });
      if (own) last.set(p.exercise_id, { top, kind: own.kind, presc: p, workoutId: workout.id });
    }
  }
  return out;
}

export const BASIS_TEXT = {
  manual: null,
  start: "Starting weight from Paul's plan",
  increased: "Paul's rule: last session was clean, weight goes up",
  held: "Paul's rule: same weight until all sets are clean",
  held_pain: 'Same weight: pain was reported last time',
  projected: 'Will update after your previous session',
};
