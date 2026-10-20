// Coach view of one athlete: link, adherence, deviations (original vs.
// modified) and every logged session compared with what was prescribed.
import { html, raw, on, toast, confirmSheet } from '../../ui/dom.js';
import { topBar, ICONS } from '../../ui/layout.js';
import { liftChart, bindCharts } from '../../ui/charts.js';
import { shareSheet } from './share.js';
import { adherence, weeklyStreak, totalXP, personalRecords, liftHistory, logDate, completedSets } from '../../core/stats.js';
import { summarize, resolveSets } from '../../core/prescription.js';
import { CHANGE_LABEL, REASON_LABEL } from '../../core/effective.js';
import { formatDate, fmtKg, isoDate } from '../../core/util.js';
import { EXERCISES } from '../../data/exercises.js';

export default async function clientPage(root, params, app) {
  if (!app.coach.signedIn) { app.navigate('/coach', { replace: true }); return; }
  root.innerHTML = String(html`<div class="page no-nav">${topBar({ title: 'Athlete', back: '/coach' })}<div class="card"><p>Loading…</p></div></div>`);
  let d;
  try { d = await app.coach.clientOverview(params.clientId); } catch (e) {
    root.innerHTML = String(html`<div class="page no-nav">${topBar({ title: 'Athlete', back: '/coach' })}<div class="card error-card"><p>${e.message}</p></div></div>`);
    return;
  }
  const c = d.client;
  const exName = (id) => d.exercises.find((e) => e.id === id)?.name || EXERCISES.find((e) => e.id === id)?.name || id;
  const program = d.program || { blocks: [] };
  const logs = d.logs;
  const today = isoDate();
  const adh = adherence(program, logs, today);
  const { best } = personalRecords(logs);
  const lifts = Object.keys(best).filter((id) => liftHistory(logs, id).some((p) => p.top));
  let lift = lifts.includes('squat') ? 'squat' : lifts[0];
  const devs = d.deviations;
  const activeDevs = devs.filter((x) => x.status === 'active');
  const sessions = logs.filter((l) => l.status !== 'in_progress' || l.sets.some((s) => s.completed));

  const devRow = (x) => html`<div class="card" style="box-shadow:var(--shadow-sm)">
    <div class="row-between"><b>${CHANGE_LABEL[x.modification_type] || x.modification_type}</b>
      <span class="chip ${x.status === 'active' ? 'chip-dev' : ''}">${x.status === 'active' ? 'active' : x.status === 'reverted' ? 'restored to your plan' : 'replaced'}</span></div>
    <p class="small muted" style="margin:4px 0">${formatDate(x.created_at.slice(0, 10))} · ${workoutName(program, x.workout_id)} · reason: <b>${REASON_LABEL[x.reason] || x.reason}</b></p>
    <table class="cmp"><thead><tr><th></th><th>Exercise</th><th>Sets</th></tr></thead><tbody>
      <tr><th>Yours</th><td>${x.original ? exName(x.original.exercise_id) : '–'}</td><td>${x.original ? summarize(resolveSets(x.original.sets)) : 'not planned'}</td></tr>
      <tr class="diff"><th>Theirs</th><td>${x.modified.removed ? 'removed' : exName(x.modified.exercise_id)}</td><td>${x.modified.removed ? '–' : summarize(resolveSets(x.modified.sets))}</td></tr>
    </tbody></table></div>`;

  const logRow = (l) => {
    const snap = l.workout_snapshot || {};
    const byPos = new Map();
    for (const s of l.sets) {
      if (!byPos.has(s.exercise_position)) byPos.set(s.exercise_position, []);
      byPos.get(s.exercise_position).push(s);
    }
    return html`<details class="card" style="box-shadow:var(--shadow-sm)">
      <summary style="cursor:pointer;list-style:none"><div class="row-between"><b>${snap.name || 'Workout'}</b>
        <span class="row">${l.pain_reported ? html`<span class="chip chip-danger">pain reported</span>` : ''}${l.status === 'skipped' ? html`<span class="chip">skipped: ${l.skip_reason || ''}</span>` : l.status === 'in_progress' ? html`<span class="chip chip-warn">in progress</span>` : html`<span class="chip chip-ok">${completedSets(l)}/${l.sets.length} sets</span>`}</span></div>
        <span class="small muted">${formatDate(logDate(l))}${snap.scheduled_date && snap.scheduled_date !== logDate(l) ? ` (planned ${formatDate(snap.scheduled_date, { weekday: false })})` : ''}${l.session_rpe ? ` · session RPE ${l.session_rpe}` : ''}</span></summary>
      ${l.notes ? html`<p class="paul-note" style="margin-top:10px">${l.notes}</p>` : ''}
      ${[...byPos.entries()].map(([pos, ss]) => html`<h4 style="margin:12px 0 4px">${exName(ss[0].exercise_id)}${(snap.prescriptions || [])[pos]?.deviated ? html` <span class="chip chip-dev">changed by athlete</span>` : ''}</h4>
        <table class="cmp"><thead><tr><th>Set</th><th>Planned</th><th>Done</th><th>RPE</th></tr></thead><tbody>
        ${ss.map((s) => {
          const tg = s.target || {};
          const planned = `${tg.reps ?? '?'} × ${tg.bodyweight ? (tg.kg ? `BW+${fmtKg(tg.kg)}` : 'BW') : `${fmtKg(tg.kg)} kg`}`;
          const doneTxt = s.completed ? `${s.actual_reps ?? '?'} × ${fmtKg(s.actual_load_kg) || (tg.bodyweight ? 'BW' : '0')}${tg.bodyweight || !s.actual_load_kg ? '' : ' kg'}` : 'not done';
          const diff = s.completed && (Number(s.actual_reps) !== Number(tg.reps) || (tg.kg != null && Number(s.actual_load_kg) !== Number(tg.kg)));
          return html`<tr class="${!s.completed ? 'miss' : diff ? 'diff' : ''}"><td>${s.set_index + 1}</td><td>${planned}</td><td>${doneTxt}${s.notes ? html`<br><span class="small">${s.notes}</span>` : ''}</td><td>${s.rpe ?? ''}</td></tr>`;
        })}</tbody></table>`)}
    </details>`;
  };

  root.innerHTML = String(html`<div class="page no-nav wide stack">
    ${topBar({ title: c.display_name, sub: d.program ? d.program.name : 'No active program', back: '/coach' })}
    <div class="card"><h2>Personal link</h2>
      <p class="small muted">Send this to ${c.display_name}. It opens their program, no account needed.</p>
      <div class="btn-row"><button class="btn" data-share>${raw(ICONS.share)} Share link</button><button class="btn btn-ghost" data-rotate>New link</button></div>
      <div class="field" style="margin-top:14px"><label for="cn">Name</label><div class="link-box"><input id="cn" type="text" value="${c.display_name}" maxlength="80"><button class="btn btn-sm btn-ghost" data-rename>Save</button></div></div>
      <label class="check"><input type="checkbox" data-archive ${c.archived ? raw('checked') : ''}> Archived (link stops working)</label>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-label">Adherence</div><div class="stat-value">${adh.pct === null ? '–' : `${adh.pct}%`}</div><div class="small muted">${adh.done}/${adh.due} due</div></div>
      <div class="stat"><div class="stat-label">Streak</div><div class="stat-value">${weeklyStreak(logs, today)} <small>wk</small></div></div>
      <div class="stat"><div class="stat-label">Done</div><div class="stat-value">${logs.filter((l) => l.status === 'completed').length}</div></div>
      <div class="stat"><div class="stat-label">XP</div><div class="stat-value">${totalXP(logs)}</div></div>
    </div>
    ${d.program ? html`<a class="btn btn-block btn-ghost" href="#/coach/p/${d.program.id}">${raw(ICONS.edit)} Edit ${d.program.name}</a>` : html`<a class="btn btn-block" href="#/coach">Assign a program from the dashboard</a>`}

    <div class="section-title"><h2>Changes by athlete</h2></div>
    ${activeDevs.length ? html`<p class="notice">${activeDevs.length} active ${activeDevs.length === 1 ? 'change' : 'changes'} to your plan. Your original prescription is untouched.</p>` : ''}
    ${devs.length ? html`<div class="stack-sm">${devs.map(devRow)}</div>` : html`<p class="muted">No changes. They're following your plan to the letter.</p>`}

    ${lifts.length ? html`<div class="section-title"><h2>Lifts</h2></div><div class="card">
      <div class="lift-tabs" role="group" aria-label="Choose lift">${lifts.map((id) => html`<button type="button" data-lift="${id}" aria-pressed="${id === lift}">${exName(id)}</button>`)}</div>
      <div data-lift-body>${raw(liftChart(liftHistory(logs, lift)))}</div>
      <p class="estimate-note">Estimated 1RM (Epley) is an estimate, not a tested max.</p></div>` : ''}

    <div class="section-title"><h2>Sessions</h2></div>
    ${sessions.length ? html`<div class="stack-sm">${sessions.map(logRow)}</div>` : html`<p class="muted">Nothing logged yet.</p>`}
  </div>`);

  const offs = [bindCharts(root)];
  offs.push(on(root, 'click', '[data-share]', () => shareSheet(c, { programName: d.program?.name })));
  offs.push(on(root, 'click', '[data-rotate]', async () => {
    const ok = await confirmSheet({ title: 'Make a new link?', text: `The current link stops working immediately. You'll need to send ${c.display_name} the new one. Their data is kept.`, ok: 'New link' });
    if (!ok) return;
    try { const r = await app.coach.rotateLink(c.id); c.access_token = r.access_token; shareSheet(c, { programName: d.program?.name }); } catch (e) { toast(e.message, { kind: 'error' }); }
  }));
  offs.push(on(root, 'click', '[data-rename]', async () => {
    const v = root.querySelector('#cn').value.trim();
    if (!v) return;
    try { await app.coach.updateClient(c.id, v, c.archived); toast('Saved.', { kind: 'ok' }); app.refresh(); } catch (e) { toast(e.message, { kind: 'error' }); }
  }));
  offs.push(on(root, 'change', '[data-archive]', async (e, el) => {
    try { await app.coach.updateClient(c.id, c.display_name, el.checked); c.archived = el.checked; toast(el.checked ? 'Archived. The link no longer works.' : 'Restored.', { kind: 'ok' }); } catch (err) { toast(err.message, { kind: 'error' }); el.checked = !el.checked; }
  }));
  offs.push(on(root, 'click', '[data-lift]', (e, el) => {
    lift = el.dataset.lift;
    root.querySelectorAll('[data-lift]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lift === lift)));
    root.querySelector('[data-lift-body]').innerHTML = liftChart(liftHistory(logs, lift));
  }));
  return () => offs.forEach((f) => f());
}

function workoutName(program, wid) {
  for (const b of program.blocks || []) for (const w of b.workouts || []) if (w.id === wid) return w.name;
  return 'workout';
}

