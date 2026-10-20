// Training-data validation. The same rules are enforced again in the database
// (CHECK constraints, triggers, private.valid_sets); this layer gives Paul
// readable messages before anything is sent.
import { UUID_RE, isValidIsoDate } from './util.js';

const LOAD_KINDS = new Set(['kg', 'bw', 'bw_plus', 'pct_top']);
const STATUSES = new Set(['draft', 'active', 'archived']);
const CATEGORIES = new Set(['squat', 'bench', 'deadlift', 'accessory']);
const TIP_KINDS = ['setup', 'execution', 'mistakes', 'bracing', 'safety'];

const isInt = (n) => typeof n === 'number' && Number.isInteger(n);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function validateSets(sets, path = 'sets') {
  const errors = [];
  if (!Array.isArray(sets) || sets.length < 1) return [{ path, message: 'Add at least one set' }];
  if (sets.length > 30) errors.push({ path, message: 'Maximum 30 sets' });
  sets.forEach((s, i) => {
    const p = `${path}[${i}]`;
    const n = i + 1;
    if (!isInt(s?.reps) || s.reps < 1 || s.reps > 100) errors.push({ path: `${p}.reps`, message: `Set ${n}: reps must be a whole number from 1 to 100` });
    if (s?.reps_max !== null && s?.reps_max !== undefined && (!isInt(s.reps_max) || s.reps_max < s.reps || s.reps_max > 100))
      errors.push({ path: `${p}.reps_max`, message: `Set ${n}: rep range must go from low to high` });
    const l = s?.load;
    if (!l || !LOAD_KINDS.has(l.kind)) errors.push({ path: `${p}.load`, message: `Set ${n}: choose a load type` });
    else if ((l.kind === 'kg' || l.kind === 'bw_plus') && (!isNum(l.value) || l.value < 0 || l.value > 1000))
      errors.push({ path: `${p}.load.value`, message: `Set ${n}: weight can't be negative` });
    else if (l.kind === 'pct_top' && (!isNum(l.value) || l.value <= 0 || l.value > 100))
      errors.push({ path: `${p}.load.value`, message: `Set ${n}: percentage must be 1–100` });
    else if (l.kind === 'pct_top' && i === 0)
      errors.push({ path: `${p}.load`, message: 'Set 1 needs a real weight for % sets to work' });
    if (s?.rpe !== null && s?.rpe !== undefined && (!isNum(s.rpe) || s.rpe < 1 || s.rpe > 10)) errors.push({ path: `${p}.rpe`, message: `Set ${n}: RPE must be 1–10` });
    if (s?.rir !== null && s?.rir !== undefined && (!isNum(s.rir) || s.rir < 0 || s.rir > 10)) errors.push({ path: `${p}.rir`, message: `Set ${n}: RIR must be 0–10` });
  });
  return errors;
}

/**
 * @param program  nested program tree
 * @param opts.exerciseIds  Set of approved exercise ids
 * @param opts.clientIds    Set of this coach's client ids (null = skip check)
 * @returns { errors: [{path,message}], warnings: [{path,message}] }
 */
export function validateProgram(program, { exerciseIds, clientIds = null } = {}) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const uniq = (id, path) => {
    if (!UUID_RE.test(id || '')) errors.push({ path, message: 'Invalid id' });
    else if (seen.has(id)) errors.push({ path, message: 'Duplicate id' });
    seen.add(id);
  };

  if (!program || typeof program !== 'object') return { errors: [{ path: '', message: 'No program' }], warnings };
  uniq(program.id, 'id');
  const name = (program.name || '').trim();
  if (!name) errors.push({ path: 'name', message: 'Give the program a name' });
  else if (name.length > 120) errors.push({ path: 'name', message: 'Name is too long (max 120)' });
  if (!STATUSES.has(program.status || 'draft')) errors.push({ path: 'status', message: 'Unknown status' });
  if (program.client_id) {
    if (!UUID_RE.test(program.client_id)) errors.push({ path: 'client_id', message: 'Invalid client' });
    else if (clientIds && !clientIds.has(program.client_id)) errors.push({ path: 'client_id', message: 'That client does not exist' });
  }
  if (program.status === 'active' && !program.client_id) warnings.push({ path: 'status', message: 'Active, but not assigned to anyone yet' });
  if (!Array.isArray(program.blocks)) return { errors: [...errors, { path: 'blocks', message: 'Blocks missing' }], warnings };
  if (program.blocks.length === 0) warnings.push({ path: 'blocks', message: 'The program has no weeks yet' });

  program.blocks.forEach((b, bi) => {
    const bp = `blocks[${bi}]`;
    const bl = b.name?.trim() || `Block ${bi + 1}`;
    uniq(b.id, `${bp}.id`);
    if (!b.name?.trim()) errors.push({ path: `${bp}.name`, message: `Block ${bi + 1} needs a name` });
    for (const k of ['start_date', 'end_date'])
      if (b[k] && !isValidIsoDate(b[k])) errors.push({ path: `${bp}.${k}`, message: `${bl}: invalid date` });
    if (b.start_date && b.end_date && isValidIsoDate(b.start_date) && isValidIsoDate(b.end_date) && b.end_date < b.start_date)
      errors.push({ path: `${bp}.end_date`, message: `${bl}: ends before it starts` });
    (b.workouts || []).forEach((w, wi) => {
      const wp = `${bp}.workouts[${wi}]`;
      const wl = `${bl} › ${w.name?.trim() || `Workout ${wi + 1}`}`;
      uniq(w.id, `${wp}.id`);
      if (!w.name?.trim()) errors.push({ path: `${wp}.name`, message: `${bl}: workout ${wi + 1} needs a name` });
      if (w.scheduled_date && !isValidIsoDate(w.scheduled_date)) errors.push({ path: `${wp}.scheduled_date`, message: `${wl}: invalid date` });
      else if (w.scheduled_date && ((b.start_date && w.scheduled_date < b.start_date) || (b.end_date && w.scheduled_date > b.end_date)))
        warnings.push({ path: `${wp}.scheduled_date`, message: `${wl}: date is outside the block's dates` });
      if (!(w.prescriptions || []).length) warnings.push({ path: `${wp}.prescriptions`, message: `${wl}: no exercises yet` });
      (w.prescriptions || []).forEach((x, xi) => {
        const xp = `${wp}.prescriptions[${xi}]`;
        uniq(x.id, `${xp}.id`);
        if (!exerciseIds?.has(x.exercise_id)) errors.push({ path: `${xp}.exercise_id`, message: `${wl}: unknown exercise "${x.exercise_id}"` });
        for (const e of validateSets(x.sets, `${xp}.sets`)) errors.push({ path: e.path, message: `${wl}: ${e.message}` });
        if (x.rest_seconds !== null && x.rest_seconds !== undefined && (!isInt(x.rest_seconds) || x.rest_seconds < 0 || x.rest_seconds > 1800))
          errors.push({ path: `${xp}.rest_seconds`, message: `${wl}: rest must be 0–30 min` });
        if (x.progression) {
          if (x.progression.type !== 'linear' || !isNum(x.progression.increment_kg) || x.progression.increment_kg <= 0 || x.progression.increment_kg > 50)
            errors.push({ path: `${xp}.progression`, message: `${wl}: progression step must be between 0 and 50 kg` });
          const k = x.sets?.[0]?.load?.kind;
          if (k !== 'kg' && k !== 'bw_plus') errors.push({ path: `${xp}.progression`, message: `${wl}: auto-progression needs a weight on set 1` });
        }
      });
    });
  });
  return { errors, warnings };
}

export function validateLog(log) {
  const errors = [];
  if (!UUID_RE.test(log?.id || '')) errors.push('invalid id');
  if (!UUID_RE.test(log?.workout_id || '')) errors.push('invalid workout_id');
  if (!['in_progress', 'completed', 'skipped'].includes(log?.status)) errors.push('invalid status');
  if (Number.isNaN(Date.parse(log?.client_updated_at))) errors.push('invalid timestamp');
  (log?.sets || []).forEach((s, i) => {
    if (s.actual_reps !== null && s.actual_reps !== undefined && (!isInt(s.actual_reps) || s.actual_reps < 0)) errors.push(`set ${i}: reps must be ≥ 0`);
    if (s.actual_load_kg !== null && s.actual_load_kg !== undefined && (!isNum(s.actual_load_kg) || s.actual_load_kg < 0)) errors.push(`set ${i}: load must be ≥ 0`);
    if (s.rpe !== null && s.rpe !== undefined && (!isNum(s.rpe) || s.rpe < 1 || s.rpe > 10)) errors.push(`set ${i}: RPE must be 1–10`);
  });
  return errors;
}

export function validateExerciseLibrary(list) {
  const errors = [];
  const ids = new Set();
  for (const e of list) {
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(e.id || '')) errors.push(`${e.id}: invalid id`);
    if (ids.has(e.id)) errors.push(`${e.id}: duplicate id`);
    ids.add(e.id);
    if (!e.name?.trim()) errors.push(`${e.id}: missing name`);
    if (!CATEGORIES.has(e.category)) errors.push(`${e.id}: unknown category ${e.category}`);
    if (!e.description?.trim()) errors.push(`${e.id}: missing description`);
    for (const k of TIP_KINDS) {
      const tips = e.tips?.[k];
      if (!Array.isArray(tips) || tips.length === 0) errors.push(`${e.id}: needs at least one ${k} tip`);
      else for (const t of tips) if (typeof t !== 'string' || !t.trim() || t.length > 120) errors.push(`${e.id}: ${k} tip too long or empty: "${t}"`);
    }
  }
  return errors;
}
