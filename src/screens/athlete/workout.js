// Workout detail: the prescription in order, Paul's notes, Paulino's cue per
// exercise, deviations clearly marked with a one-tap restore.
import { html, raw, on } from '../../ui/dom.js';
import { mascot } from '../../ui/paulino.js';
import { paulinoSVG } from '../../ui/paulino-art.js';
import { topBar, ICONS } from '../../ui/layout.js';
import { athleteOr404, ensureBundle, live, badgeSlot, exName, exInfo } from './common.js';
import { cuesFor } from '../../data/exercises.js';
import { BASIS_TEXT } from '../../core/progression.js';
import { REASON_LABEL, CHANGE_LABEL } from '../../core/effective.js';
import { formatDate, relativeDay, isoDate } from '../../core/util.js';
import { modifyExercise, restoreDeviation, skipSession } from './modify.js';
import { pickLine } from '../../ui/paulino.js';

export const restLabel = (s) => (s ? (s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s / 60} min`) : null);

export function exerciseCueLines(store, item) {
  const lines = [];
  if (item.coach_notes) lines.push(`Paul says: ${item.coach_notes}`);
  for (const c of cuesFor(exInfo(store, item.exercise_id))) lines.push(c.text);
  return lines;
}

export default function workout(root, params, app) {
  const store = athleteOr404(root, params, app);
  if (!store || !ensureBundle(root, store, app)) return;
  const t = params.token;
  const found = store.findWorkout(params.workoutId);
  if (!found) {
    root.innerHTML = String(html`<div class="page no-nav">${topBar({ title: 'Workout', back: `/a/${t}/program` })}<div class="card"><p>This workout is no longer in your program. Paul may have changed it.</p></div></div>`);
    return live(root, store, app);
  }
  const { workout: w, block } = found;
  const items = store.effective().byWorkout.get(w.id) || [];
  const log = store.logFor(w.id);
  const today = isoDate();
  const status = log?.status;

  const cards = items.map((it, i) => {
    const lines = exerciseCueLines(store, it);
    const tip = pickLine(`cue.${it.exercise_id}`, lines);
    const dev = it.deviation;
    const prog = it.progress;
    return html`<article class="card ex-card ${dev ? 'deviated' : ''} ${it.removed ? 'removed' : ''}" data-item="${it.id}" style="margin-top:22px">
      <span class="ex-num">${i + 1}</span>
      <div class="ex-head"><h3>${exName(store, it.exercise_id)}</h3>
        ${dev ? html`<span class="chip chip-dev">${it.removed ? 'Removed by you' : it.added ? 'Added by you' : 'Changed by you'}</span>` : ''}</div>
      ${it.removed ? html`<p class="orig">${it.paulSummary}</p>` : html`<p class="ex-presc">${it.summary}</p>`}
      ${dev && !it.removed && !it.added ? html`<p class="small" style="margin:0">Paul's plan: <span class="orig">${it.paulSummary}</span></p>` : ''}
      <div class="ex-meta">
        ${it.rest_seconds ? html`<span class="chip">${raw(ICONS.timer)} Rest ${restLabel(it.rest_seconds)}</span>` : ''}
        ${it.tempo ? html`<span class="chip">Tempo ${it.tempo}</span>` : ''}
        ${it.resolved.some((r) => r.rpe) ? html`<span class="chip">Target RPE ${it.resolved.find((r) => r.rpe).rpe}</span>` : ''}
        ${it.resolved.some((r) => r.rir !== null && r.rir !== undefined) ? html`<span class="chip">${it.resolved.find((r) => r.rir !== null && r.rir !== undefined).rir} reps in reserve</span>` : ''}
        ${['increased', 'held', 'held_pain'].includes(prog.basis) && !dev ? html`<span class="chip ${prog.basis === 'increased' ? 'chip-ok' : ''}">${BASIS_TEXT[prog.basis]}</span>` : ''}
        ${dev ? html`<span class="chip">${CHANGE_LABEL[dev.modification_type] || 'Changed'} · ${REASON_LABEL[dev.reason] || ''}</span>` : ''}
      </div>
      ${it.coach_notes ? html`<p class="paul-note">${it.coach_notes}</p>` : ''}
      ${!it.removed ? html`<button type="button" class="tip" data-cue="${it.id}" aria-label="Paulino's tip. Tap for another">
        <span class="tip-face" aria-hidden="true">${raw(paulinoSVG('focused', { id: `cue${i}`, backdrop: false }))}</span>
        <span><b>Paulino:</b> <span data-cue-text>${tip}</span></span></button>` : ''}
      <div class="btn-row" style="margin-top:12px">
        ${it.removed ? '' : html`<a class="btn btn-sm" href="#/a/${t}/w/${w.id}/go?ex=${i}">${status === 'completed' ? 'View log' : 'Record'}</a>`}
        ${status !== 'completed' && status !== 'skipped' ? (dev
          ? html`<button class="btn btn-sm btn-ghost" data-restore="${dev.id}">Restore Paul's plan</button>`
          : html`<button class="btn btn-sm btn-ghost" data-modify="${it.id}">${raw(ICONS.edit)} Change</button>`) : ''}
      </div>
    </article>`;
  });

  const mood = status === 'completed' ? 'happy' : 'motivational';
  root.innerHTML = String(html`<div class="page no-nav">
    ${topBar({ title: w.name, sub: `${w.scheduled_date ? `${formatDate(w.scheduled_date)} · ${relativeDay(w.scheduled_date, today)}` : 'Any day'} · ${block.name}`, back: `/a/${t}/program`, right: String(badgeSlot(store)) })}
    <div class="card">${raw(mascot({ mood, context: status === 'completed' ? 'finish' : 'workout', size: 'sm' }))}</div>
    ${w.notes ? html`<p class="paul-note" style="margin-top:16px">${w.notes}</p>` : ''}
    ${status === 'skipped' ? html`<p class="notice" style="margin-top:16px">You skipped this session (${log.skip_reason || 'no reason'}). <button class="link-btn" data-unskip>Train it after all</button></p>` : ''}
    ${cards}
    ${status !== 'completed' && status !== 'skipped' ? html`<p style="margin-top:18px"><button class="link-btn" data-add>${raw('+')} Add an exercise</button></p>` : ''}
    <div class="stack-sm" style="margin-top:20px">
      ${status === 'completed'
        ? html`<a class="btn btn-block btn-lg" href="#/a/${t}/w/${w.id}/done">See results</a>`
        : status === 'skipped' ? ''
        : html`<a class="btn btn-block btn-lg" href="#/a/${t}/w/${w.id}/go" data-start>${status === 'in_progress' ? 'Continue workout' : 'Start workout'}</a>
               <button class="btn btn-block btn-ghost" data-skip>Can't train this one?</button>`}
    </div>
  </div>`);

  const offs = [live(root, store, app)];
  offs.push(on(root, 'click', '[data-cue]', (e, el) => {
    const it = items.find((x) => x.id === el.dataset.cue);
    el.querySelector('[data-cue-text]').textContent = pickLine(`cue.${it.exercise_id}`, exerciseCueLines(store, it));
  }));
  offs.push(on(root, 'click', '[data-modify]', async (e, el) => {
    const it = items.find((x) => x.id === el.dataset.modify);
    if (await modifyExercise(store, w, it)) app.refresh();
  }));
  offs.push(on(root, 'click', '[data-restore]', async (e, el) => {
    const it = items.find((x) => x.deviation?.id === el.dataset.restore);
    await restoreDeviation(store, it.deviation);
    app.refresh();
  }));
  offs.push(on(root, 'click', '[data-add]', async () => {
    if (await modifyExercise(store, w, null, { position: items.length })) app.refresh();
  }));
  offs.push(on(root, 'click', '[data-skip]', async () => {
    if (await skipSession(store, w)) app.refresh();
  }));
  offs.push(on(root, 'click', '[data-unskip]', () => {
    store.unskipWorkout(w.id);
    app.navigate(`/a/${t}/w/${w.id}/go`);
  }));
  return () => offs.forEach((f) => f());
}
