// Progress: calendar, adherence, lift charts with estimated 1RM, PRs, history.
import { html, raw, on } from '../../ui/dom.js';
import { athleteNav, topBar, ICONS } from '../../ui/layout.js';
import { liftChart, bindCharts } from '../../ui/charts.js';
import { athleteOr404, ensureBundle, live, badgeSlot, exName } from './common.js';
import { liftHistory, personalRecords, adherence, weeklyStreak, totalXP, level, logDate, completedSets } from '../../core/stats.js';
import { flattenWorkouts } from '../../core/prescription.js';
import { isoDate, formatDate, fmtKg } from '../../core/util.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function calendar(year, month, { done, skipped, scheduled, today }) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-d"></span>');
  for (let d = 1; d <= days; d++) {
    const iso = isoDate(new Date(year, month, d));
    const cls = ['cal-d', 'in', done.has(iso) ? 'done' : skipped.has(iso) ? 'skip' : scheduled.has(iso) ? 'sched' : '', iso === today ? 'today' : ''].join(' ');
    const label = done.has(iso) ? 'trained' : skipped.has(iso) ? 'skipped' : scheduled.has(iso) ? 'planned' : '';
    cells.push(`<span class="${cls}" ${label ? `aria-label="${d}: ${label}"` : ''}>${d}</span>`);
  }
  return `<div class="cal" role="grid" aria-label="${MONTHS[month]} ${year}">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h) => `<span class="cal-h">${h}</span>`).join('')}${cells.join('')}</div>`;
}

export function calendarSets(program, logs) {
  const done = new Set(), skipped = new Set(), scheduled = new Set();
  for (const l of logs) {
    const d = logDate(l);
    if (!d) continue;
    if (l.status === 'completed') done.add(d);
    else if (l.status === 'skipped') skipped.add(d);
  }
  for (const { workout } of flattenWorkouts(program)) if (workout.scheduled_date) scheduled.add(workout.scheduled_date);
  return { done, skipped, scheduled };
}

export default function progress(root, params, app, query) {
  const store = athleteOr404(root, params, app);
  if (!store || !ensureBundle(root, store, app)) return;
  const t = params.token;
  const program = store.program() || { blocks: [] };
  const logs = store.logs();
  const today = isoDate();
  const now = new Date();
  let ym = { y: now.getFullYear(), m: now.getMonth() };
  const sets = { ...calendarSets(program, logs), today };
  const adh = adherence(program, logs, today);
  const streak = weeklyStreak(logs, today);
  const xp = totalXP(logs);
  const { events, best } = personalRecords(logs);
  const lifts = Object.keys(best).filter((id) => liftHistory(logs, id).length);
  let lift = query?.get('lift') && lifts.includes(query.get('lift')) ? query.get('lift') : lifts.includes('squat') ? 'squat' : lifts[0];
  const completed = logs.filter((l) => l.status !== 'in_progress').sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));

  const liftSection = () => {
    if (!lift) return '<p class="muted">Log a workout to see your lifts here.</p>';
    const pts = liftHistory(logs, lift);
    const bodyweight = pts.every((p) => !p.top);
    return String(html`
      <div class="lift-tabs" role="group" aria-label="Choose lift">${lifts.map((id) => html`<button type="button" data-lift="${id}" aria-pressed="${id === lift}">${exName(store, id)}</button>`)}</div>
      ${bodyweight ? html`<p>Bodyweight exercise: best set <b>${best[lift].bwReps} reps</b>.</p>` : raw(liftChart(pts, { showE1rm: true }))}
      ${bodyweight ? '' : html`<p class="estimate-note">Estimated 1RM uses the Epley formula on sets of 10 reps or fewer. It is an <b>estimate</b>, not a tested max.</p>`}
      <div class="table-wrap"><table class="table" style="margin-top:10px"><thead><tr><th>Date</th><th>Heaviest set</th><th class="num">Sets</th><th class="num">Est. 1RM</th></tr></thead><tbody>
        ${pts.slice().reverse().map((p) => html`<tr><td>${formatDate(p.date, { weekday: false })}</td><td class="mono">${p.top ? `${fmtKg(p.top)} kg` : 'BW'} × ${p.reps}</td><td class="num">${p.sets}</td><td class="num">${p.e1rm ? `~${fmtKg(p.e1rm)}` : '–'}</td></tr>`)}
      </tbody></table></div>`);
  };

  root.innerHTML = String(html`<div class="page stack">
    ${topBar({ title: 'Progress', right: String(badgeSlot(store)) })}
    <div class="stats">
      <div class="stat"><div class="stat-label">${raw(ICONS.check)} Adherence</div><div class="stat-value">${adh.pct === null ? '–' : `${adh.pct}%`}</div><div class="small muted">${adh.done}/${adh.due} planned so far</div></div>
      <div class="stat"><div class="stat-label">${raw(ICONS.flame)} Streak</div><div class="stat-value">${streak} <small>wk</small></div></div>
      <div class="stat"><div class="stat-label">${raw(ICONS.bolt)} XP</div><div class="stat-value">${xp} <small>Lv ${level(xp).level}</small></div></div>
      <div class="stat"><div class="stat-label">${raw(ICONS.trophy)} PRs</div><div class="stat-value">${events.length}</div></div>
    </div>
    <div class="card">
      <div class="row-between"><button class="icon-btn" data-cal="-1" aria-label="Previous month">‹</button><h2 data-cal-title style="margin:0">${MONTHS[ym.m]} ${ym.y}</h2><button class="icon-btn" data-cal="1" aria-label="Next month">›</button></div>
      <div data-cal-body style="margin-top:12px">${raw(calendar(ym.y, ym.m, sets))}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Trained</span><span><i style="border-style:dashed;background:var(--paper)"></i>Planned</span><span><i style="background:repeating-linear-gradient(45deg,#ddd 0 3px,#fff 3px 6px)"></i>Skipped</span></div>
    </div>
    <div class="card"><h2>Lifts</h2><div data-lift-body>${raw(liftSection())}</div></div>
    <div class="card"><h2>Personal records</h2>
      ${events.length ? html`<ul class="pr-list">${events.slice().reverse().map((e) => html`<li class="pr-item">${raw(ICONS.trophy)}<span class="grow"><b>${exName(store, e.exercise_id)}</b> · <span class="mono small">${e.kind === 'reps' ? `${e.value} reps` : `${fmtKg(e.kg)} kg × ${e.reps}`}${e.kind === 'e1rm' ? ` (est. 1RM ${fmtKg(e.value)})` : ''}</span></span><span class="chip">${formatDate(e.date, { weekday: false })}</span></li>`)}</ul>`
        : html`<p class="muted">No PRs yet. Your first session sets the baseline.</p>`}
    </div>
    <div class="card"><h2>Workout history</h2>
      ${completed.length ? html`<table class="table"><tbody>${completed.map((l) => html`<tr>
        <td>${formatDate(logDate(l), { weekday: false })}</td>
        <td>${l.workout_id ? html`<a href="#/a/${t}/w/${l.workout_id}${l.status === 'completed' ? '/done' : ''}">${l.workout_snapshot?.name || 'Workout'}</a>` : l.workout_snapshot?.name || 'Workout (removed by Paul)'}</td>
        <td class="num">${l.status === 'completed' ? `${completedSets(l)} sets` : html`<span class="chip">skipped</span>`}</td></tr>`)}</tbody></table>`
        : html`<p class="muted">Nothing logged yet.</p>`}
    </div>
  </div>${athleteNav(t, 'progress')}`);

  const offs = [live(root, store, app), bindCharts(root)];
  offs.push(on(root, 'click', '[data-cal]', (e, el) => {
    ym.m += Number(el.dataset.cal);
    if (ym.m < 0) { ym.m = 11; ym.y -= 1; }
    if (ym.m > 11) { ym.m = 0; ym.y += 1; }
    root.querySelector('[data-cal-title]').textContent = `${MONTHS[ym.m]} ${ym.y}`;
    root.querySelector('[data-cal-body]').innerHTML = calendar(ym.y, ym.m, sets);
  }));
  offs.push(on(root, 'click', '[data-lift]', (e, el) => {
    lift = el.dataset.lift;
    root.querySelector('[data-lift-body]').innerHTML = liftSection();
  }));
  return () => offs.forEach((f) => f());
}
