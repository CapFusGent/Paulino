// What the athlete sees: Paul's prescription, progression applied, and the
// athlete's own active deviations layered on top. Paul's original is always
// kept alongside for comparison and for "restore the plan".
import { resolveSets, summarize } from './prescription.js';
import { progressionPlan } from './progression.js';

export function activeDeviations(deviations, workoutId) {
  return (deviations || []).filter((d) => d.status === 'active' && d.workout_id === workoutId);
}

/**
 * @param workout     a workout from the program tree
 * @param ctx.plan    result of progressionPlan(program, logs)
 * @param ctx.deviations all deviations for the client
 * @returns [{ id, prescription (Paul's), exercise_id, sets, resolved, summary,
 *             deviation, removed, added, progress }]
 */
export function effectivePrescriptions(workout, { plan = new Map(), deviations = [] } = {}) {
  const devs = activeDeviations(deviations, workout.id);
  const items = [];
  for (const p of workout.prescriptions || []) {
    const prog = plan.get(p.id) || { delta: 0, basis: 'manual' };
    const paulResolved = resolveSets(p.sets, prog.delta);
    const dev = devs.filter((d) => d.prescription_id === p.id).sort(byCreated).pop() || null;
    const base = {
      id: p.id,
      prescription: p,
      position: p.position ?? items.length,
      progress: prog,
      paulResolved,
      paulSummary: summarize(paulResolved),
      rest_seconds: p.rest_seconds,
      tempo: p.tempo,
      coach_notes: p.coach_notes || '',
      deviation: dev,
      added: false,
    };
    if (dev) {
      const m = dev.modified;
      const resolved = m.removed ? paulResolved : resolveSets(m.sets);
      items.push({ ...base, exercise_id: m.removed ? p.exercise_id : m.exercise_id, sets: m.removed ? p.sets : m.sets,
        resolved, summary: summarize(resolved), removed: !!m.removed,
        rest_seconds: m.rest_seconds ?? p.rest_seconds });
    } else {
      items.push({ ...base, exercise_id: p.exercise_id, sets: p.sets, resolved: paulResolved, summary: base.paulSummary, removed: false });
    }
  }
  for (const d of devs.filter((x) => !x.prescription_id).sort(byCreated)) {
    const resolved = resolveSets(d.modified.sets);
    items.push({
      id: `added-${d.id}`, prescription: null, position: d.modified.position ?? items.length, progress: { delta: 0, basis: 'manual' },
      paulResolved: null, paulSummary: null, rest_seconds: d.modified.rest_seconds ?? null, tempo: null, coach_notes: '',
      deviation: d, added: true, removed: false, exercise_id: d.modified.exercise_id, sets: d.modified.sets,
      resolved, summary: summarize(resolved),
    });
  }
  return items;
}

const byCreated = (a, b) => String(a.created_at || a.client_updated_at).localeCompare(String(b.created_at || b.client_updated_at));

/** Convenience: effective view for every workout in the program. */
export function effectiveProgram(program, logs, deviations) {
  const plan = progressionPlan(program, logs);
  const map = new Map();
  for (const b of program?.blocks || []) for (const w of b.workouts || []) map.set(w.id, effectivePrescriptions(w, { plan, deviations }));
  return { plan, byWorkout: map };
}

/**
 * Classify what an athlete's edit changes compared with Paul's prescription.
 * @returns { types: string[], primary: string|null }
 */
export function classifyChange(original, modified) {
  const types = [];
  if (modified.removed) return { types: ['remove_exercise'], primary: 'remove_exercise' };
  if (!original) return { types: ['add_exercise'], primary: 'add_exercise' };
  if (modified.exercise_id !== original.exercise_id) types.push('replace_exercise');
  if (modified.sets.length !== original.sets.length) types.push('change_sets');
  const n = Math.min(modified.sets.length, original.sets.length);
  for (let i = 0; i < n; i++) {
    if (modified.sets[i].reps !== original.sets[i].reps || (modified.sets[i].reps_max ?? null) !== (original.sets[i].reps_max ?? null)) {
      types.push('change_reps');
      break;
    }
  }
  return { types, primary: types.length === 0 ? null : types.length === 1 ? types[0] : 'change_structure' };
}

/** Reasons that mean the athlete is protecting themselves: never shame these. */
export const SAFETY_REASONS = new Set(['pain', 'fatigue']);

export const REASON_LABEL = {
  preference: 'Just want to',
  equipment: 'Equipment busy / missing',
  fatigue: 'Feeling run down',
  pain: 'Pain or discomfort',
  other: 'Other',
};

export const CHANGE_LABEL = {
  replace_exercise: 'Swapped exercise',
  remove_exercise: 'Removed exercise',
  add_exercise: 'Added exercise',
  change_sets: 'Changed number of sets',
  change_reps: 'Changed target reps',
  change_load: 'Changed load',
  change_structure: 'Changed the structure',
};
