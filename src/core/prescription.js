// Prescription helpers: resolving loads, human summaries, quick-entry parsing.
//
// A prescription's `sets` is a list of per-set targets:
//   { reps, reps_max?, load: { kind, value? }, rpe?, rir? }
// load.kind: 'kg' (absolute), 'bw' (bodyweight), 'bw_plus' (bodyweight + kg),
//            'pct_top' (value % of set 1's kg, rounded up to the plate step —
//            the back-off formula from Paul's spreadsheet).
import { fmtKg, round } from './util.js';

export const PLATE_STEP = 2.5;

export function makeSet(reps = 5, kg = null) {
  return { reps, reps_max: null, load: kg === null ? { kind: 'bw' } : { kind: 'kg', value: kg }, rpe: null, rir: null };
}

/**
 * Resolve every set to a concrete target.
 * @param sets      prescription sets
 * @param topDelta  kg added by a progression rule (applied to kg / bw_plus sets)
 * @returns [{ reps, reps_max, kg (number|null), bodyweight (bool), label }]
 */
export function resolveSets(sets, topDelta = 0) {
  const out = [];
  let top = null;
  sets.forEach((s, i) => {
    const kind = s.load?.kind || 'bw';
    let kg = null;
    let bodyweight = false;
    if (kind === 'kg') kg = Number(s.load.value) + topDelta;
    else if (kind === 'bw') bodyweight = true;
    else if (kind === 'bw_plus') { bodyweight = true; kg = Number(s.load.value) + topDelta; }
    else if (kind === 'pct_top') kg = top === null ? null : round((top * Number(s.load.value)) / 100, PLATE_STEP, 'up');
    if (i === 0) top = kg;
    if (kg !== null) kg = Math.max(0, Number(kg.toFixed(3)));
    out.push({ reps: s.reps, reps_max: s.reps_max ?? null, kg, bodyweight, rpe: s.rpe ?? null, rir: s.rir ?? null, label: loadLabel(kg, bodyweight, kind, s) });
  });
  return out;
}

function loadLabel(kg, bodyweight, kind, s) {
  if (kind === 'bw') return 'Bodyweight';
  if (kind === 'bw_plus') return kg ? `BW + ${fmtKg(kg)} kg` : 'Bodyweight';
  if (kind === 'pct_top' && kg === null) return `${fmtKg(s.load.value)}% of set 1`;
  return `${fmtKg(kg)} kg`;
}

export function repsLabel(r) {
  return r.reps_max && r.reps_max !== r.reps ? `${r.reps}–${r.reps_max}` : String(r.reps);
}

/** "5 × 5 @ 60 kg" / "1 × 1 @ 80 kg · 4 × 5 @ 70 kg" */
export function summarize(resolved) {
  const groups = [];
  for (const r of resolved) {
    const key = `${repsLabel(r)}|${r.label}|${r.rpe ?? ''}|${r.rir ?? ''}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.n += 1;
    else groups.push({ key, n: 1, r });
  }
  return groups
    .map(({ n, r }) => {
      const effort = r.rpe ? ` RPE ${fmtKg(r.rpe)}` : r.rir !== null && r.rir !== undefined ? ` ${r.rir} RIR` : '';
      return `${n} × ${repsLabel(r)} @ ${r.label}${effort}`;
    })
    .join(' · ');
}

export function totalReps(sets) {
  return sets.reduce((a, s) => a + (s.reps || 0), 0);
}

/**
 * Quick entry for the coach editor. Comma-separated groups:
 *   "5x5@60"  "3x8-10@40"  "5x3 bw"  "3x10 bw+2"  "1x1@80, 4x5@86%"  "5x5@60 rpe8"
 * Groups without a weight reuse `defaultLoad` (the exercise's current load).
 * Returns { sets } or { error }.
 */
export function parseQuick(text, defaultLoad = null) {
  const groups = String(text || '').toLowerCase().replace(/×/g, 'x').split(/[,;]+/).map((g) => g.trim()).filter(Boolean);
  if (!groups.length) return { error: 'Type something like 5x5@60' };
  const sets = [];
  for (const g of groups) {
    const m = g.match(/^(\d{1,2})\s*x\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?\s*(?:@?\s*(bw\s*\+\s*[\d.]+|bw|[\d.]+\s*%|[\d.]+)\s*(?:kg)?)?\s*(?:(rpe|rir)\s*([\d.]+))?$/);
    if (!m) return { error: `Can't read "${g}". Try 5x5@60` };
    const n = Number(m[1]), reps = Number(m[2]), repsMax = m[3] ? Number(m[3]) : null;
    if (n < 1 || n > 30) return { error: 'Sets must be between 1 and 30' };
    if (reps < 1 || reps > 100) return { error: 'Reps must be between 1 and 100' };
    if (repsMax !== null && repsMax < reps) return { error: 'Rep range must go low–high, e.g. 8-10' };
    let load = { kind: 'bw' };
    const l = (m[4] || '').replace(/\s+/g, '');
    if (l.startsWith('bw+')) load = { kind: 'bw_plus', value: Number(l.slice(3)) };
    else if (l === 'bw' || l === '') load = l === '' ? null : { kind: 'bw' };
    else if (l.endsWith('%')) load = { kind: 'pct_top', value: Number(l.slice(0, -1)) };
    else load = { kind: 'kg', value: Number(l) };
    if (load && 'value' in load && !Number.isFinite(load.value)) return { error: `Bad weight in "${g}"` };
    if (load && load.kind === 'pct_top' && (load.value <= 0 || load.value > 100)) return { error: 'Percentages go from 1 to 100' };
    if (load === null) load = defaultLoad && defaultLoad.kind !== 'pct_top' ? { ...defaultLoad } : { kind: 'kg', value: 0 };
    const rpe = m[5] === 'rpe' ? Number(m[6]) : null;
    const rir = m[5] === 'rir' ? Number(m[6]) : null;
    if (rpe !== null && (rpe < 1 || rpe > 10)) return { error: 'RPE goes from 1 to 10' };
    for (let i = 0; i < n; i++) sets.push({ reps, reps_max: repsMax, load: { ...load }, rpe, rir });
  }
  if (sets.length > 30) return { error: 'Maximum 30 sets per exercise' };
  if (sets[0].load.kind === 'pct_top') return { error: 'The first set needs a real weight for % to work' };
  return { sets };
}

/** Inverse of parseQuick, used to pre-fill the quick-entry box. */
export function toQuick(sets) {
  const groups = [];
  for (const s of sets) {
    const l = s.load || { kind: 'bw' };
    const load = l.kind === 'kg' ? `@${fmtKg(l.value)}` : l.kind === 'bw' ? ' bw' : l.kind === 'bw_plus' ? ` bw+${fmtKg(l.value)}` : `@${fmtKg(l.value)}%`;
    const reps = s.reps_max && s.reps_max !== s.reps ? `${s.reps}-${s.reps_max}` : `${s.reps}`;
    const eff = s.rpe ? ` rpe${fmtKg(s.rpe)}` : s.rir !== null && s.rir !== undefined ? ` rir${s.rir}` : '';
    const key = `${reps}${load}${eff}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.n++;
    else groups.push({ key, n: 1 });
  }
  return groups.map((g) => `${g.n}x${g.key}`).join(', ');
}

/** Ordered list of all workouts in a program with their block. */
export function flattenWorkouts(program) {
  const out = [];
  (program?.blocks || []).forEach((b, bi) => {
    (b.workouts || []).forEach((w, wi) => out.push({ block: b, workout: w, bi, wi }));
  });
  return out;
}
