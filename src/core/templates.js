// Program templates Paul can start from. The 5×5 template reproduces the
// structure of Paul's own beginner spreadsheet: two alternating days, 5×5 on
// the barbell lifts, +2.5 kg after a clean session, ~3 sessions a week.
import { uid, addDays, weekStart, isoDate } from './util.js';

const kg = (reps, value) => ({ reps, reps_max: null, load: { kind: 'kg', value }, rpe: null, rir: null });
const bw = (reps) => ({ reps, reps_max: null, load: { kind: 'bw' }, rpe: null, rir: null });
const times = (n, f) => Array.from({ length: n }, f);
const linear = { type: 'linear', increment_kg: 2.5 };

const DAY_A = [
  { exercise_id: 'squat', sets: times(5, () => kg(5, 60)), progression: linear },
  { exercise_id: 'bench-press', sets: times(5, () => kg(5, 50)), progression: linear },
  { exercise_id: 'barbell-row', sets: times(5, () => kg(5, 50)), progression: linear },
];
const DAY_B = [
  { exercise_id: 'squat', sets: times(5, () => kg(5, 60)), progression: linear },
  { exercise_id: 'overhead-press', sets: times(5, () => kg(5, 30)), progression: linear },
  { exercise_id: 'deadlift', sets: times(5, () => kg(5, 60)), progression: linear },
  { exercise_id: 'pull-up', sets: times(5, () => bw(3)), progression: null },
];

const NOTES =
  'Goal of this phase: learn the technique, strength will follow. Warm up on every lift (empty bar ×10, then a few lighter sets). ' +
  'Rest 1:30–3:00 between sets. Finish each set feeling you had 1–2 reps left: never to failure. Supersets are fine: bench + row, overhead press + deadlift.';

/**
 * @param opts.start    first training day (ISO date). Defaults to next Monday.
 * @param opts.weeks    number of weekly blocks
 * @param opts.weekdays training weekdays (0=Sun … 6=Sat)
 */
export function novice5x5({ name = 'Beginner 5×5: technique phase', start, weeks = 12, weekdays = [1, 3, 5], clientId = null } = {}) {
  const first = start || addDays(weekStart(isoDate()), 7);
  const monday = weekStart(first);
  const blocks = [];
  let n = 0;
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(monday, w * 7);
    const workouts = [];
    weekdays.forEach((dow, i) => {
      const date = addDays(ws, (dow + 6) % 7);
      if (date < first) return;
      const isA = n % 2 === 0;
      workouts.push({
        id: uid(),
        name: isA ? 'Day A: squat · bench · row' : 'Day B: squat · press · deadlift',
        scheduled_date: date,
        position: i,
        notes: '',
        prescriptions: (isA ? DAY_A : DAY_B).map((x, j) => ({
          id: uid(), exercise_id: x.exercise_id, position: j, sets: structuredClone(x.sets),
          rest_seconds: 120, tempo: null, coach_notes: '', progression: x.progression ? { ...x.progression } : null,
        })),
      });
      n++;
    });
    blocks.push({ id: uid(), name: `Week ${w + 1}`, position: w, start_date: ws, end_date: addDays(ws, 6), notes: '', workouts });
  }
  return { id: uid(), name, client_id: clientId, status: 'draft', notes: NOTES, version: null, blocks };
}

export function emptyProgram(name = '') {
  const ws = addDays(weekStart(isoDate()), 7);
  return {
    id: uid(), name, client_id: null, status: 'draft', notes: '', version: null,
    blocks: [{ id: uid(), name: 'Week 1', position: 0, start_date: ws, end_date: addDays(ws, 6), notes: '', workouts: [] }],
  };
}

/** Deep copy of a block with new ids and every date shifted. */
export function cloneBlock(block, shiftDays = 7, name) {
  const sh = (d) => (d ? addDays(d, shiftDays) : d);
  return {
    ...structuredClone(block),
    id: uid(),
    name: name || block.name,
    start_date: sh(block.start_date),
    end_date: sh(block.end_date),
    workouts: (block.workouts || []).map((w) => cloneWorkout(w, shiftDays)),
  };
}

export function cloneWorkout(w, shiftDays = 0) {
  return {
    ...structuredClone(w),
    id: uid(),
    scheduled_date: w.scheduled_date ? addDays(w.scheduled_date, shiftDays) : null,
    prescriptions: (w.prescriptions || []).map((x) => ({ ...structuredClone(x), id: uid() })),
  };
}
