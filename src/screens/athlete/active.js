// Active workout logging. Fast, touch-friendly, no big animations.
// Every keystroke is saved locally immediately, so closing the app or going
// back never loses a set.
import { html, raw, on, sheet, toast } from '../../ui/dom.js';
import { mascot, react } from '../../ui/paulino.js';
import { ICONS } from '../../ui/layout.js';
import { mountTimer, prefs } from '../../ui/timer.js';
import { athleteOr404, ensureBundle, live, badgeSlot, exName } from './common.js';
import { exerciseCueLines } from './workout.js';
import { pickLine } from '../../ui/paulino.js';
import { SAFETY } from '../../data/messages.js';
import { fmtKg } from '../../core/util.js';
import { repsLabel } from '../../core/prescription.js';

const RPES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export default function active(root, params, app, query) {
  const store = athleteOr404(root, params, app);
  if (!store || !ensureBundle(root, store, app)) return;
  const t = params.token;
  const found = store.findWorkout(params.workoutId);
  if (!found) { app.navigate(`/a/${t}/program`, { replace: true }); return; }
  const w = found.workout;
  let log = store.logFor(w.id);
  if (!log || log.status === 'skipped') log = log?.status === 'skipped' ? store.unskipWorkout(w.id) : store.startWorkout(w.id);
  const items = (store.effective().byWorkout.get(w.id) || []).filter((i) => !i.removed);
  const readOnlyDone = log.status === 'completed';

  const setsOf = (pos) => log.sets.filter((s) => s.exercise_position === pos).sort((a, b) => a.set_index - b.set_index);

  const setRow = (s, item) => {
    const tg = s.target || {};
    const heavier = tg.kg !== null && tg.kg !== undefined && Number(s.actual_load_kg) > Number(tg.kg) + 0.001;
    const targetTxt = `Target ${repsLabel(tg)} × ${tg.bodyweight ? (tg.kg ? `BW+${fmtKg(tg.kg)} kg` : 'BW') : `${fmtKg(tg.kg)} kg`}${tg.rpe ? ` @ RPE ${tg.rpe}` : ''}`;
    return html`<div class="set-row ${s.completed ? 'done' : ''}" data-set="${s.exercise_position}:${s.set_index}">
      <span class="set-n">${s.set_index + 1}</span>
      <input type="number" inputmode="numeric" min="0" max="200" step="1" value="${s.actual_reps ?? ''}" data-f="actual_reps" aria-label="Set ${s.set_index + 1} reps">
      <input type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${s.actual_load_kg ?? ''}" data-f="actual_load_kg" aria-label="Set ${s.set_index + 1} weight in kg${tg.bodyweight ? ' added to bodyweight' : ''}">
      <button type="button" class="done-btn" data-done aria-pressed="${s.completed}" aria-label="Mark set ${s.set_index + 1} ${s.completed ? 'not done' : 'done'}">${raw(ICONS.check)}</button>
      <span class="target">${targetTxt}</span>
      <button type="button" class="more-btn" data-more>${s.rpe || s.notes ? `RPE ${s.rpe ?? '–'}${s.notes ? ' · note' : ''}` : '+ RPE / note'}</button>
      <div class="set-extra" hidden>
        <select data-f="rpe" aria-label="Set ${s.set_index + 1} RPE"><option value="">RPE</option>${raw(RPES.map((r) => `<option value="${r}"${Number(s.rpe) === r ? ' selected' : ''}>RPE ${r}</option>`).join(''))}</select>
        <input type="text" maxlength="200" placeholder="Note" value="${s.notes || ''}" data-f="notes" aria-label="Set ${s.set_index + 1} note">
      </div>
      ${heavier ? html`<span class="inline-warn" data-heavy>Heavier than Paul's plan. No ego lifting, champ.</span>` : ''}
    </div>`;
  };

  const exBlocks = items.map((it, pos) => {
    const lines = exerciseCueLines(store, it);
    return html`<section class="log-ex" id="ex-${pos}" data-pos="${pos}">
      <div class="log-ex-head"><h2>${pos + 1}. ${exName(store, it.exercise_id)}</h2><span class="mono small">${it.summary}</span></div>
      ${it.deviation ? html`<span class="chip chip-dev" style="margin-top:4px">Changed by you</span>` : ''}
      <button type="button" class="tip" data-cue="${pos}" style="margin-top:8px"><span><b>Paulino:</b> <span data-cue-text>${pickLine(`cue.${it.exercise_id}`, lines)}</span></span></button>
      <div class="set-table">
        <div class="set-head"><span>Set</span><span>Reps</span><span>${it.resolved[0]?.bodyweight ? '+kg' : 'kg'}</span><span>Done</span></div>
        ${setsOf(pos).map((s) => setRow(s, it))}
      </div>
    </section>`;
  });

  root.innerHTML = String(html`<div class="page no-nav with-timer">
    <div class="active-top">
      <div class="row-between">
        <button class="icon-btn" data-close aria-label="Close workout (progress is saved)">${raw(ICONS.close)}</button>
        <div class="grow"><h1>${w.name}</h1></div>
        <span class="counter" data-counter></span>
      </div>
      <div class="progress" style="margin-top:8px" role="progressbar" aria-label="Sets completed" aria-valuemin="0" data-progress><span></span></div>
      <div class="row-between small" style="margin-top:6px"><span data-sync-slot>${badgeSlot(store)}</span><span class="muted">Saved on this device as you go</span></div>
    </div>
    ${readOnlyDone ? html`<p class="notice notice-ok" style="margin-top:14px">This workout is completed. You can still correct numbers.</p>` : ''}
    ${items.length === 0 ? html`<div class="card" style="margin-top:16px"><p>No exercises in this workout.</p></div>` : ''}
    ${exBlocks}
    <div class="stack-sm" style="margin-top:26px">
      <button class="btn btn-block btn-lg" data-finish>${readOnlyDone ? 'Done' : 'Finish workout'}</button>
      <button class="btn btn-block btn-ghost" data-pain>Something hurts?</button>
    </div>
  </div><div data-timer></div>`);

  const timer = mountTimer(root.querySelector('[data-timer]'));

  function refreshProgress() {
    log = store.logFor(w.id);
    const total = log.sets.length;
    const done = log.sets.filter((s) => s.completed).length;
    root.querySelector('[data-counter]').textContent = `${done}/${total} sets`;
    const bar = root.querySelector('[data-progress]');
    bar.setAttribute('aria-valuemax', String(total));
    bar.setAttribute('aria-valuenow', String(done));
    bar.querySelector('span').style.width = `${total ? (done / total) * 100 : 0}%`;
    if (total && done === total) bar.setAttribute('data-full', ''); else bar.removeAttribute('data-full');
    root.querySelectorAll('.set-row.next').forEach((r) => r.classList.remove('next'));
    const next = log.sets.find((s) => !s.completed);
    if (next) root.querySelector(`[data-set="${next.exercise_position}:${next.set_index}"]`)?.classList.add('next');
    return next;
  }
  refreshProgress();

  const keyOf = (row) => row.dataset.set.split(':').map(Number);
  const offs = [live(root, store, app, { rerender: false }), () => timer.destroy()];

  offs.push(on(root, 'input', '.set-row [data-f]', (e, el) => {
    const row = el.closest('.set-row');
    const [pos, idx] = keyOf(row);
    const f = el.dataset.f;
    let v = el.value;
    if (f === 'actual_reps') v = v === '' ? null : Math.max(0, Math.round(Number(v)));
    else if (f === 'actual_load_kg') v = v === '' ? null : Math.max(0, Number(v));
    else if (f === 'rpe') v = v === '' ? null : Number(v);
    if ((f === 'actual_reps' || f === 'actual_load_kg') && v !== null && !Number.isFinite(v)) return;
    store.updateSet(w.id, pos, idx, { [f]: v });
    if (f === 'actual_load_kg') {
      const s = store.logFor(w.id).sets.find((x) => x.exercise_position === pos && x.set_index === idx);
      const heavy = s.target?.kg !== null && s.target?.kg !== undefined && Number(v) > Number(s.target.kg) + 0.001;
      const warn = row.querySelector('[data-heavy]');
      if (heavy && !warn) row.insertAdjacentHTML('beforeend', `<span class="inline-warn" data-heavy>Heavier than Paul's plan. No ego lifting, champ.</span>`);
      if (!heavy && warn) warn.remove();
    }
  }));

  offs.push(on(root, 'click', '[data-done]', (e, el) => {
    const row = el.closest('.set-row');
    const [pos, idx] = keyOf(row);
    const s = store.logFor(w.id).sets.find((x) => x.exercise_position === pos && x.set_index === idx);
    const done = !s.completed;
    // Commit what is in the inputs (in case the input event was not fired yet).
    const reps = row.querySelector('[data-f=actual_reps]').value;
    const kg = row.querySelector('[data-f=actual_load_kg]').value;
    store.updateSet(w.id, pos, idx, {
      completed: done,
      actual_reps: reps === '' ? null : Math.max(0, Math.round(Number(reps))),
      actual_load_kg: kg === '' ? null : Math.max(0, Number(kg)),
    });
    el.setAttribute('aria-pressed', String(done));
    row.classList.toggle('done', done);
    const next = refreshProgress();
    if (done && next && prefs().auto) {
      const it = items[next.exercise_position];
      timer.start(items[pos]?.rest_seconds || 120, `Next: ${exName(store, it.exercise_id)} · set ${next.set_index + 1}`);
    }
    if (done && !next) react('happy', 'All sets done! Hit Finish.');
  }));

  offs.push(on(root, 'click', '[data-more]', (e, el) => {
    const ex = el.parentElement.querySelector('.set-extra');
    ex.hidden = !ex.hidden;
  }));

  offs.push(on(root, 'click', '[data-cue]', (e, el) => {
    const it = items[Number(el.dataset.cue)];
    el.querySelector('[data-cue-text]').textContent = pickLine(`cue.${it.exercise_id}`, exerciseCueLines(store, it));
  }));

  offs.push(on(root, 'click', '[data-close]', () => {
    if ((history.state?.depth ?? 0) > 0) history.back();
    else app.navigate(`/a/${t}/w/${w.id}`, { replace: true });
  }));

  offs.push(on(root, 'click', '[data-pain]', () => painFlow()));
  offs.push(on(root, 'click', '[data-finish]', () => (readOnlyDone ? app.navigate(`/a/${t}/w/${w.id}/done`, { replace: true }) : finishFlow())));

  async function painFlow() {
    const choice = await sheet({ title: 'Something hurts?', label: 'Pain check' }, (body, close) => {
      body.innerHTML = String(html`${raw(mascot({ mood: 'concerned', context: 'pain', size: 'sm', still: true }))}
        <div class="choices" style="margin-top:14px">
          <button class="choice-btn" data-c="sore">Muscle soreness or tiredness<small>Dull, general, about 3/10 or less</small></button>
          <button class="choice-btn" data-c="sharp">Sharp, strong or worsening pain<small>Or something feels wrong in a joint</small></button>
        </div>`);
      body.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => close(b.dataset.c)));
    });
    if (choice === 'sore') {
      await sheet({ title: 'Soreness', label: 'Soreness' }, (body, close) => {
        body.innerHTML = String(html`<p>${SAFETY.soreness} Keep the reps clean, and if it gets sharper or worse, stop.</p>
          <p class="small muted">Lowering the weight or doing fewer reps is fine. Just log what you actually did.</p>
          <button class="btn btn-block" data-ok>Got it</button>`);
        body.querySelector('[data-ok]').onclick = () => close();
      });
    } else if (choice === 'sharp') {
      store.updateLog(w.id, { pain_reported: true });
      const next = await sheet({ title: 'Stop and look after it', label: 'Pain', className: '' }, (body, close) => {
        body.innerHTML = String(html`<div class="notice notice-danger"><p style="margin:0 0 8px">${SAFETY.painStop}</p><p style="margin:0">${SAFETY.painContact}</p></div>
          <p class="small muted" style="margin-top:10px">Paul will see that you reported pain in this session.</p>
          <div class="stack-sm" style="margin-top:12px">
            <button class="btn btn-block" data-end>End the workout here</button>
            <button class="btn btn-block btn-ghost" data-skipex>Stop this exercise, continue with others</button>
          </div>`);
        body.querySelector('[data-end]').onclick = () => close('end');
        body.querySelector('[data-skipex]').onclick = () => close('skip');
      });
      if (next === 'end') finishFlow(true);
      else if (next === 'skip') {
        const cur = refreshProgress();
        if (cur) {
          const nextPos = items.findIndex((_, i) => i > cur.exercise_position && log.sets.some((s) => s.exercise_position === i && !s.completed));
          if (nextPos >= 0) root.querySelector(`#ex-${nextPos}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        toast('Skip the remaining sets of that exercise. Unfinished sets are fine.', { kind: 'warn' });
      }
    }
  }

  async function finishFlow(pain = false) {
    log = store.logFor(w.id);
    const left = log.sets.filter((s) => !s.completed).length;
    const res = await sheet({ title: 'Finish workout', label: 'Finish workout' }, (body, close) => {
      let rpe = log.session_rpe;
      body.innerHTML = String(html`
        ${left ? html`<p class="notice">${left} ${left === 1 ? 'set is' : 'sets are'} not marked done. That's OK, they'll be saved as not completed.</p>` : ''}
        <fieldset style="border:0;padding:0;margin:12px 0"><legend class="label">How hard was the session? (RPE 1–10)</legend>
          <div class="seg" style="flex-wrap:wrap">${Array.from({ length: 10 }, (_, i) => html`<button type="button" data-rpe="${i + 1}" aria-pressed="${rpe === i + 1}" style="flex:1 0 18%">${i + 1}</button>`)}</div></fieldset>
        <div class="field"><label for="f-notes">Notes for Paul (optional)</label><textarea id="f-notes" maxlength="2000" placeholder="How did it feel?">${log.notes || ''}</textarea></div>
        <label class="check"><input type="checkbox" id="f-pain" ${pain || log.pain_reported ? raw('checked') : ''}> I felt pain during this session</label>
        <button class="btn btn-block btn-lg" data-save style="margin-top:12px">Save workout</button>`);
      body.querySelectorAll('[data-rpe]').forEach((b) => (b.onclick = () => {
        rpe = rpe === Number(b.dataset.rpe) ? null : Number(b.dataset.rpe);
        body.querySelectorAll('[data-rpe]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.rpe) === rpe)));
      }));
      body.querySelector('[data-save]').onclick = () => close({ rpe, notes: body.querySelector('#f-notes').value.trim(), pain: body.querySelector('#f-pain').checked });
    });
    if (!res) return;
    store.completeWorkout(w.id, { session_rpe: res.rpe, notes: res.notes, pain_reported: res.pain });
    store.flush();
    app.navigate(`/a/${t}/w/${w.id}/done`, { replace: true });
  }

  // Jump to the requested exercise, or back to where the athlete left off.
  const focus = query?.has('ex') ? Number(query.get('ex')) : null;
  const resume = log.sets.some((s) => s.completed) ? log.sets.find((s) => !s.completed)?.exercise_position : null;
  const target = Number.isInteger(focus) ? focus : resume;
  if (target) requestAnimationFrame(() => root.querySelector(`#ex-${target}`)?.scrollIntoView({ block: 'start' }));
  return () => offs.forEach((f) => f());
}
