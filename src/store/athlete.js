// Athlete data: cached bundle from the server + local, offline-first edits.
//
// Every log / deviation the athlete touches is written locally first with
// `dirty: true` and a `client_updated_at` timestamp. sync() pushes all dirty
// records in one idempotent call (client_sync) and pulls a fresh bundle.
// The server keeps whichever version is newest; if a device's copy was older,
// the server copy comes back as "stale", replaces the local one, and the user
// is told — nothing is silently overwritten.
import { storage } from './storage.js';
import { uid, clone } from '../core/util.js';
import { effectiveProgram } from '../core/effective.js';

const SYNC_DEBOUNCE = 1200;
const POLL_MS = 30_000;

export function createAthleteStore(api, token) {
  const key = `athlete.${token}`;
  const saved = storage.get(key, null) || {};
  const state = {
    token,
    bundle: saved.bundle || null,
    localLogs: saved.localLogs || {},   // workout_id → log
    localDevs: saved.localDevs || {},   // id → deviation
    lastSync: saved.lastSync || null,
    syncState: 'idle',                  // idle | syncing | offline | error | invalid
    notices: [],
    lastError: null,
  };
  const listeners = new Set();
  let timer = null;
  let poller = null;
  let syncing = null;

  const persist = () => storage.set(key, { bundle: state.bundle, localLogs: state.localLogs, localDevs: state.localDevs, lastSync: state.lastSync });
  const emit = () => listeners.forEach((f) => f(state));
  const now = () => new Date().toISOString();

  // ---- merged views ----------------------------------------------------------
  function logs() {
    const byWorkout = new Map();
    for (const l of state.bundle?.logs || []) byWorkout.set(l.workout_id || `orphan-${l.id}`, l);
    for (const [wid, l] of Object.entries(state.localLogs)) {
      const s = byWorkout.get(wid);
      if (!s || l.dirty || String(l.client_updated_at) > String(s.client_updated_at)) byWorkout.set(wid, l);
    }
    return [...byWorkout.values()];
  }

  function deviations() {
    const byId = new Map((state.bundle?.deviations || []).map((d) => [d.id, d]));
    for (const d of Object.values(state.localDevs)) {
      const s = byId.get(d.id);
      if (!s || d.dirty || String(d.client_updated_at) > String(s.client_updated_at)) byId.set(d.id, d);
    }
    return [...byId.values()];
  }

  const logFor = (workoutId) => logs().find((l) => l.workout_id === workoutId) || null;
  const program = () => state.bundle?.program || null;
  const exercises = () => state.bundle?.exercises || [];
  const effective = () => effectiveProgram(program() || { blocks: [] }, logs(), deviations());
  const pendingCount = () => Object.values(state.localLogs).filter((l) => l.dirty).length + Object.values(state.localDevs).filter((d) => d.dirty).length;

  function findWorkout(workoutId) {
    for (const b of program()?.blocks || []) for (const w of b.workouts || []) if (w.id === workoutId) return { block: b, workout: w };
    return null;
  }

  // ---- writes ----------------------------------------------------------------
  function writeLog(log) {
    log.client_updated_at = now();
    log.dirty = true;
    state.localLogs[log.workout_id] = log;
    persist();
    emit();
    scheduleSync();
    return log;
  }

  /** Build set rows for the current effective prescription (keeps already-entered values). */
  function buildSets(workoutId, previous = []) {
    const items = effective().byWorkout.get(workoutId) || [];
    const sets = [];
    items.filter((it) => !it.removed).forEach((it, pos) => {
      it.resolved.forEach((r, i) => {
        const prev = previous.find((s) => s.exercise_position === pos && s.set_index === i && s.exercise_id === it.exercise_id);
        sets.push(prev ? { ...prev, prescription_id: it.prescription?.id || null } : {
          prescription_id: it.prescription?.id || null,
          exercise_id: it.exercise_id,
          exercise_position: pos,
          set_index: i,
          target: { reps: r.reps, reps_max: r.reps_max, kg: r.kg, bodyweight: r.bodyweight, rpe: r.rpe },
          actual_reps: r.reps,
          actual_load_kg: r.kg ?? (r.bodyweight ? 0 : null),
          rpe: null,
          completed: false,
          notes: '',
        });
      });
    });
    return sets;
  }

  function startWorkout(workoutId) {
    const existing = logFor(workoutId);
    if (existing) return existing;
    const w = findWorkout(workoutId);
    return writeLog({
      id: uid(), workout_id: workoutId, program_id: program()?.id || null, status: 'in_progress', skip_reason: null,
      started_at: now(), completed_at: null, session_rpe: null, pain_reported: false, notes: '',
      workout_snapshot: { name: w?.workout.name, scheduled_date: w?.workout.scheduled_date },
      sets: buildSets(workoutId),
    });
  }

  function updateLog(workoutId, patch) {
    const l = clone(logFor(workoutId));
    if (!l) return null;
    Object.assign(l, patch);
    return writeLog(l);
  }

  function updateSet(workoutId, exercisePosition, setIndex, patch) {
    const l = clone(logFor(workoutId));
    if (!l) return null;
    const s = l.sets.find((x) => x.exercise_position === exercisePosition && x.set_index === setIndex);
    if (!s) return null;
    Object.assign(s, patch);
    return writeLog(l);
  }

  function completeWorkout(workoutId, { session_rpe = null, notes = '', pain_reported } = {}) {
    const l = logFor(workoutId);
    return updateLog(workoutId, {
      status: 'completed', completed_at: now(), session_rpe, notes,
      pain_reported: pain_reported ?? l?.pain_reported ?? false,
    });
  }

  function skipWorkout(workoutId, reason, notes = '') {
    const existing = logFor(workoutId);
    const base = existing ? clone(existing) : {
      id: uid(), workout_id: workoutId, program_id: program()?.id || null, started_at: null, session_rpe: null,
      pain_reported: reason === 'pain', sets: [], workout_snapshot: {},
    };
    return writeLog({ ...base, status: 'skipped', skip_reason: reason, completed_at: now(), notes });
  }

  /** Re-open a skipped session (the athlete changed their mind). */
  function unskipWorkout(workoutId) {
    const l = logFor(workoutId);
    if (!l || l.status !== 'skipped') return null;
    return updateLog(workoutId, { status: 'in_progress', skip_reason: null, completed_at: null, started_at: now(), sets: buildSets(workoutId) });
  }

  function writeDeviation(dev) {
    dev.client_updated_at = now();
    dev.dirty = true;
    state.localDevs[dev.id] = dev;
    // An in-progress log follows the new structure; entered values are kept where they still fit.
    const l = logFor(dev.workout_id);
    if (l && l.status === 'in_progress') {
      const nl = clone(l);
      nl.sets = buildSets(dev.workout_id, l.sets);
      nl.client_updated_at = now();
      nl.dirty = true;
      state.localLogs[dev.workout_id] = nl;
    }
    persist();
    emit();
    scheduleSync();
    return dev;
  }

  function addDeviation({ workout_id, prescription_id = null, modification_type, reason = 'preference', original = null, modified }) {
    // Supersede locally too, so the UI reflects the latest change immediately.
    for (const d of deviations()) {
      if (prescription_id && d.prescription_id === prescription_id && d.status === 'active') {
        state.localDevs[d.id] = { ...d, status: 'superseded', dirty: false };
      }
    }
    return writeDeviation({
      id: uid(), workout_id, prescription_id, modification_type, reason, original, modified,
      status: 'active', created_at: now(), program_id: program()?.id || null,
    });
  }

  function revertDeviation(id) {
    const d = deviations().find((x) => x.id === id);
    if (!d) return null;
    return writeDeviation({ ...clone(d), status: 'reverted', reverted_at: now() });
  }

  // ---- sync ------------------------------------------------------------------
  function scheduleSync(delay = SYNC_DEBOUNCE) {
    clearTimeout(timer);
    timer = setTimeout(() => sync().catch(() => {}), delay);
  }

  const strip = ({ dirty, error, ...rest }) => rest;

  async function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      state.syncState = 'syncing';
      emit();
      try {
        const dirtyLogs = Object.values(state.localLogs).filter((l) => l.dirty);
        const dirtyDevs = Object.values(state.localDevs).filter((d) => d.dirty);
        if (dirtyLogs.length || dirtyDevs.length) {
          const sent = new Map([...dirtyLogs.map((l) => [`l:${l.workout_id}`, l.client_updated_at]), ...dirtyDevs.map((d) => [`d:${d.id}`, d.client_updated_at])]);
          const res = await api.rpcAnon('client_sync', { p_token: token, p_logs: dirtyLogs.map(strip), p_deviations: dirtyDevs.map(strip) });
          for (const r of res.deviations || []) {
            const local = state.localDevs[r.id];
            if (!local) continue;
            if (r.result === 'accepted' && local.client_updated_at === sent.get(`d:${r.id}`)) state.localDevs[r.id] = { ...r.server, dirty: false };
            else if (r.result === 'stale') { state.localDevs[r.id] = { ...r.server, dirty: false }; notice('A newer change from another device was kept.'); }
            else if (r.result === 'rejected') { state.localDevs[r.id] = { ...local, dirty: false, error: r.error }; notice("One change couldn't be saved: the plan was updated by Paul."); }
          }
          for (const r of res.logs || []) {
            const local = state.localLogs[r.workout_id];
            if (!local) continue;
            if (r.result === 'accepted' && local.client_updated_at === sent.get(`l:${r.workout_id}`)) state.localLogs[r.workout_id] = { ...r.server, dirty: false };
            else if (r.result === 'stale') { state.localLogs[r.workout_id] = { ...r.server, dirty: false }; notice('This workout was updated on another device. That newer version was kept.'); }
            else if (r.result === 'rejected') { state.localLogs[r.workout_id] = { ...local, dirty: false, error: r.error }; notice("A workout couldn't be saved: Paul removed it from the program. It's kept on this device."); }
          }
          persist();
        }
        const bundle = await api.rpcAnon('client_get_bundle', { p_token: token });
        state.bundle = bundle;
        // Drop clean local copies the server now has; keep dirty ones.
        for (const [wid, l] of Object.entries(state.localLogs)) {
          const s = bundle.logs.find((x) => x.workout_id === wid);
          if (!l.dirty && !l.error && s && String(s.client_updated_at) >= String(l.client_updated_at)) delete state.localLogs[wid];
        }
        for (const [id, d] of Object.entries(state.localDevs)) {
          const s = bundle.deviations.find((x) => x.id === id);
          if (!d.dirty && s && String(s.client_updated_at) >= String(d.client_updated_at)) delete state.localDevs[id];
          else if (!d.dirty && d.status === 'superseded') delete state.localDevs[id];
        }
        state.lastSync = now();
        state.syncState = 'idle';
        state.lastError = null;
        persist();
        rememberAthlete(token, bundle.client?.display_name);
      } catch (e) {
        state.lastError = e;
        state.syncState = e.offline ? 'offline' : e.code === 'invalid_link' || /invalid_link/.test(e.message) ? 'invalid' : 'error';
      } finally {
        syncing = null;
        emit();
      }
    })();
    return syncing;
  }

  function notice(text) {
    state.notices.push({ id: uid(), text });
  }

  function takeNotices() {
    const n = state.notices;
    state.notices = [];
    return n;
  }

  function start() {
    const onOnline = () => sync();
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    poller = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, POLL_MS);
    sync();
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(poller);
    };
  }

  function forget() {
    storage.remove(key);
    const list = storage.get('athletes', []).filter((a) => a.token !== token);
    storage.set('athletes', list);
  }

  return {
    state, logs, deviations, logFor, program, exercises, effective, findWorkout, pendingCount,
    startWorkout, updateLog, updateSet, completeWorkout, skipWorkout, unskipWorkout,
    addDeviation, revertDeviation, sync, start, takeNotices, forget,
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    flush: () => { clearTimeout(timer); return sync(); },
  };
}

/** Athletes opened on this device, for the welcome screen. */
export function rememberAthlete(token, name) {
  const list = storage.get('athletes', []).filter((a) => a.token !== token);
  list.unshift({ token, name: name || 'Athlete', at: new Date().toISOString() });
  storage.set('athletes', list.slice(0, 5));
}
export const rememberedAthletes = () => storage.get('athletes', []);
