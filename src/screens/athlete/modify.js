// The athlete edits Paul's prescription → Paulino is (dramatically) upset,
// unless the reason is pain or fatigue: then he is supportive. Either way the
// change is saved as a deviation and Paul's original stays untouched.
import { html, raw, sheet, esc } from '../../ui/dom.js';
import { mascot, pickLine, linesFor, react } from '../../ui/paulino.js';
import { classifyChange, SAFETY_REASONS, REASON_LABEL, CHANGE_LABEL } from '../../core/effective.js';
import { summarize, resolveSets } from '../../core/prescription.js';
import { SAFETY } from '../../data/messages.js';
import { CATEGORIES } from '../../data/exercises.js';
import { exName } from './common.js';

const loadOf = (r, kgOverride) => {
  const kg = kgOverride ?? r.kg;
  if (r.bodyweight) return kg ? { kind: 'bw_plus', value: kg } : { kind: 'bw' };
  return { kind: 'kg', value: kg ?? 0 };
};

/** Paul's current target for an item, as absolute sets (progression applied). */
export function paulAbsoluteSets(item) {
  return item.paulResolved.map((r) => ({ reps: r.reps, reps_max: r.reps_max, load: loadOf(r), rpe: r.rpe, rir: r.rir }));
}

/**
 * Open the change editor for one exercise (item from effectivePrescriptions)
 * or, with item = null, for adding an exercise to the workout.
 */
export async function modifyExercise(store, workout, item, { position = 0 } = {}) {
  const adding = !item;
  const exercises = store.exercises();
  const startEx = item ? item.exercise_id : exercises[0]?.id;
  const base = item ? item.resolved : [{ reps: 8, reps_max: null, kg: 0, bodyweight: false, rpe: null, rir: null }];
  const draft = {
    exercise_id: startEx,
    n: item ? item.resolved.length : 3,
    reps: base.map((r) => r.reps),
    kg: item ? null : 20,
    reason: 'preference',
  };

  const result = await sheet({ title: adding ? 'Add an exercise' : 'Change this exercise', label: 'Change exercise' }, (body, close) => {
    const grouped = Object.entries(CATEGORIES).map(([cat, label]) => {
      const list = exercises.filter((e) => e.category === cat);
      return list.length ? `<optgroup label="${esc(label)}">${list.map((e) => `<option value="${esc(e.id)}"${e.id === draft.exercise_id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    const sameReps = draft.reps.every((r) => r === draft.reps[0]);
    body.innerHTML = String(html`
      ${item ? html`<p class="small muted">Paul's plan: <b class="mono">${item.paulSummary}</b></p>` : html`<p class="small muted">Paul didn't plan an extra exercise here.</p>`}
      <div class="field"><label for="m-ex">Exercise</label><select id="m-ex">${raw(grouped)}</select></div>
      <div class="field" data-kg-field ${item ? raw('hidden') : ''}><label for="m-kg">Weight (kg)</label><input id="m-kg" type="number" inputmode="decimal" min="0" step="0.5" value="${draft.kg ?? ''}"></div>
      <div class="ed-grid">
        <div class="field"><label for="m-sets">Sets</label><input id="m-sets" type="number" inputmode="numeric" min="1" max="30" value="${draft.n}"></div>
        <div class="field"><label for="m-reps">Reps per set</label><input id="m-reps" type="number" inputmode="numeric" min="1" max="100" value="${sameReps ? draft.reps[0] : ''}" placeholder="${sameReps ? '' : 'mixed'}"></div>
      </div>
      <fieldset class="field" style="border:0;padding:0;margin:0 0 14px"><legend class="label">Why are you changing it?</legend>
        <div class="choices">${Object.entries(REASON_LABEL).map(([k, v]) => html`<button type="button" class="choice-btn" data-reason="${k}" aria-pressed="${k === draft.reason}">${v}</button>`)}</div>
      </fieldset>
      <p class="field-error" data-err hidden></p>
      <div class="btn-row">
        <button class="btn" data-save>${adding ? 'Add it' : 'Save change'}</button>
        ${item ? html`<button class="btn btn-ghost" data-remove>Remove from today</button>` : ''}
      </div>`);
    const $ = (s) => body.querySelector(s);
    $('#m-ex').onchange = () => {
      draft.exercise_id = $('#m-ex').value;
      const replaced = item && draft.exercise_id !== item.exercise_id;
      $('[data-kg-field]').hidden = !(adding || replaced);
      if (replaced && draft.kg === null) $('#m-kg').value = '';
    };
    body.querySelectorAll('[data-reason]').forEach((b) => (b.onclick = () => {
      draft.reason = b.dataset.reason;
      body.querySelectorAll('[data-reason]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    const err = (m) => { $('[data-err]').textContent = m; $('[data-err]').hidden = !m; };
    $('[data-save]').onclick = () => {
      const n = Number($('#m-sets').value);
      const repsVal = $('#m-reps').value;
      if (!Number.isInteger(n) || n < 1 || n > 30) return err('Sets must be between 1 and 30.');
      if (repsVal !== '' && (!Number.isInteger(Number(repsVal)) || Number(repsVal) < 1 || Number(repsVal) > 100)) return err('Reps must be between 1 and 100.');
      const replaced = adding || draft.exercise_id !== item.exercise_id;
      const kgIn = $('#m-kg').value;
      if (replaced && (kgIn === '' || Number(kgIn) < 0)) return err('Enter a weight for the new exercise (0 for bodyweight).');
      const reps = Array.from({ length: n }, (_, i) => (repsVal !== '' ? Number(repsVal) : draft.reps[Math.min(i, draft.reps.length - 1)]));
      const sets = reps.map((r, i) => {
        const b = base[Math.min(i, base.length - 1)];
        const load = replaced ? (Number(kgIn) > 0 ? { kind: 'kg', value: Number(kgIn) } : { kind: 'bw' }) : loadOf(b);
        return { reps: r, reps_max: null, load, rpe: replaced ? null : b.rpe, rir: replaced ? null : b.rir };
      });
      close({ removed: false, exercise_id: draft.exercise_id, sets, reason: draft.reason });
    };
    $('[data-remove]')?.addEventListener('click', () => close({ removed: true, reason: draft.reason }));
  });
  if (!result) return false;

  const original = item ? { exercise_id: item.prescription.exercise_id, sets: paulAbsoluteSets(item) } : null;
  const modified = result.removed
    ? { removed: true, exercise_id: item.prescription.exercise_id, position: item.position }
    : { exercise_id: result.exercise_id, sets: result.sets, rest_seconds: item?.rest_seconds ?? 120, position: item ? item.position : position, removed: false };
  const { types, primary } = classifyChange(original, modified);
  if (!primary) {
    // Edited back to exactly Paul's plan: that's a restore.
    if (item?.deviation) { await restoreDeviation(store, item.deviation); return true; }
    react('happy', "Same as Paul's plan. Nothing to change!");
    return false;
  }
  const changeText = describe(store, original, modified, types);
  const safety = SAFETY_REASONS.has(result.reason);
  const go = safety ? await supportive(result.reason, changeText) : await drama(changeText);
  if (!go) {
    react('happy', pickLine('happy.restored', linesFor('happy', 'restored')));
    return false;
  }
  store.addDeviation({
    workout_id: workout.id,
    prescription_id: item ? item.prescription.id : null,
    modification_type: primary,
    reason: result.reason,
    original,
    modified,
  });
  if (safety) react('concerned', 'Saved. Tell Paul how it feels.');
  else react('disappointed', pickLine('disappointed.after', linesFor('disappointed', 'after')), 4200);
  return true;
}

function describe(store, original, modified, types) {
  const parts = types.map((t) => CHANGE_LABEL[t]);
  if (types.includes('replace_exercise')) parts[types.indexOf('replace_exercise')] = `${exName(store, original.exercise_id)} → ${exName(store, modified.exercise_id)}`;
  const before = original ? summarize(resolveSets(original.sets)) : 'nothing';
  const after = modified.removed ? 'removed' : summarize(resolveSets(modified.sets));
  return { parts, before, after };
}

function drama({ parts, before, after }) {
  return sheet({ className: 'sheet-drama', label: 'Paulino is disappointed', dismissable: false }, (body, close) => {
    body.innerHTML = String(html`
      ${raw(mascot({ mood: 'disappointed', context: 'deviate', size: 'lg', layout: 'stack' }))}
      <div class="card" style="margin-top:14px">
        <p style="margin:0 0 6px"><b>This is different from Paul's plan.</b></p>
        <ul class="small" style="margin:0 0 8px;padding-left:20px">${parts.map((p) => html`<li>${p}</li>`)}</ul>
        <p class="small mono" style="margin:0"><span class="orig">${before}</span><br>→ ${after}</p>
        <p class="small muted" style="margin:8px 0 0">Paul will see this change next to his original.</p>
      </div>
      <div class="stack-sm" style="margin-top:16px">
        <button class="btn btn-block btn-lg" data-keep>Sorry, Paulino. Keep the plan.</button>
        <button class="btn btn-block btn-ghost" data-anyway>I'm doing it anyway!</button>
      </div>`);
    body.querySelector('[data-keep]').onclick = () => close(false);
    body.querySelector('[data-anyway]').onclick = () => close(true);
  });
}

function supportive(reason, { before, after }) {
  return sheet({ label: 'Paulino checks in', title: reason === 'pain' ? 'Listen to your body' : 'Adjusting for today' }, (body, close) => {
    body.innerHTML = String(html`
      ${raw(mascot({ mood: 'concerned', context: reason === 'pain' ? 'pain' : 'fatigue', size: 'md' }))}
      ${reason === 'pain' ? html`<div class="notice notice-danger" style="margin-top:14px"><p style="margin:0 0 6px">${SAFETY.painStop}</p><p style="margin:0">${SAFETY.painContact}</p></div>`
        : html`<p style="margin-top:14px">Good call adjusting when you feel run down. Paul would rather you train smart than hurt.</p>`}
      <p class="small mono" style="margin-top:10px"><span class="orig">${before}</span> → ${after}</p>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn" data-ok>Save this change</button>
        <button class="btn btn-ghost" data-cancel>Keep Paul's plan</button>
      </div>`);
    body.querySelector('[data-ok]').onclick = () => close(true);
    body.querySelector('[data-cancel]').onclick = () => close(false);
  });
}

export async function restoreDeviation(store, deviation) {
  store.revertDeviation(deviation.id);
  react('happy', pickLine('happy.restored', linesFor('happy', 'restored')));
}

/** Skip a whole session (illness, pain, schedule). Never disappointing. */
export function skipSession(store, workout) {
  return sheet({ title: "Can't train this one?", label: 'Skip session' }, (body, close) => {
    const reasons = [
      ['illness', "I'm sick", 'Rest and recover. It does not break your streak.'],
      ['pain', 'Something hurts', 'Better safe than sorry.'],
      ['schedule', 'No time today', 'Life happens. Pick it up next time.'],
      ['other', 'Other reason', ''],
    ];
    body.innerHTML = String(html`
      ${raw(mascot({ mood: 'concerned', context: 'skip', size: 'sm' }))}
      <div class="choices" style="margin-top:14px">${reasons.map(([k, l, s]) => html`<button class="choice-btn" data-skip="${k}">${l}${s ? html`<small>${s}</small>` : ''}</button>`)}</div>
      <div data-pain hidden class="notice notice-danger" style="margin-top:12px"><p style="margin:0 0 6px">${SAFETY.painStop}</p><p style="margin:0">${SAFETY.painContact}</p></div>`);
    body.querySelectorAll('[data-skip]').forEach((b) => (b.onclick = () => {
      const r = b.dataset.skip;
      if (r === 'pain' && body.querySelector('[data-pain]').hidden) {
        body.querySelector('[data-pain]').hidden = false;
        b.innerHTML = 'Something hurts: <b>skip this session</b>';
        return;
      }
      store.skipWorkout(workout.id, r);
      react(r === 'illness' || r === 'pain' ? 'concerned' : 'motivational',
        r === 'illness' ? 'Rest up and get well soon!' : r === 'pain' ? 'Take care. Tell Paul what happened.' : "No stress. See you next session!");
      close(r);
    }));
  });
}

