// Results after a workout: celebration (or care, if pain was reported).
import { html, raw } from '../../ui/dom.js';
import { mascot } from '../../ui/paulino.js';
import { topBar, ICONS } from '../../ui/layout.js';
import { athleteOr404, ensureBundle, live, exName, badgeSlot } from './common.js';
import { personalRecords, xpForLog, totalXP, weeklyStreak, volume, completedSets, milestoneReached, XP, level } from '../../core/stats.js';
import { fmtKg, isoDate } from '../../core/util.js';

export default function results(root, params, app) {
  const store = athleteOr404(root, params, app);
  if (!store || !ensureBundle(root, store, app)) return;
  const t = params.token;
  const log = store.logFor(params.workoutId);
  if (!log || log.status !== 'completed') { app.navigate(`/a/${t}/w/${params.workoutId}`, { replace: true }); return; }
  const found = store.findWorkout(params.workoutId);
  const logs = store.logs();
  const { events } = personalRecords(logs);
  const prs = events.filter((e) => e.logId === log.id);
  const xp = xpForLog(log, events);
  const total = totalXP(logs);
  const lv = level(total);
  const streak = weeklyStreak(logs, isoDate());
  const doneCount = logs.filter((l) => l.status === 'completed').length;
  const milestone = milestoneReached(doneCount - 1, doneCount);
  const sets = completedSets(log);
  const vol = volume(log);
  const exercises = [...new Set(log.sets.map((s) => s.exercise_id))];
  const pain = log.pain_reported;
  const heavyPR = prs.some((p) => !p.withinPlan);

  const perEx = exercises.map((id) => {
    const ss = log.sets.filter((s) => s.exercise_id === id);
    return { id, done: ss.filter((s) => s.completed).length, total: ss.length };
  });

  const confetti = pain ? '' : Array.from({ length: 18 }, (_, i) =>
    `<i style="left:${(i * 37) % 100}%;background:${['var(--accent)', 'var(--pop-1)', 'var(--pop-2)', 'var(--pop-3)'][i % 4]};animation-delay:${(i % 6) * 0.12}s;border-radius:${i % 3 ? '2px' : '50%'}"></i>`).join('');

  root.innerHTML = String(html`<div class="page no-nav stack">
    ${topBar({ title: 'Results', back: `/a/${t}/program`, right: String(badgeSlot(store)) })}
    <section class="celebrate">
      <div class="burst" aria-hidden="true">${raw(confetti)}</div>
      ${raw(mascot({ mood: pain ? 'concerned' : 'happy', context: pain ? 'pain' : prs.length && !heavyPR ? 'pr' : 'finish', size: 'lg', layout: 'stack' }))}
      <h1 style="margin-top:14px">${pain ? 'Session logged' : 'Session done!'}</h1>
      <p class="muted">${found?.workout.name || log.workout_snapshot?.name || ''}</p>
    </section>
    ${pain ? html`<div class="notice notice-danger">You reported pain. Rest it, and tell Paul what happened. If it's severe or getting worse, get it checked by a professional.</div>` : ''}
    <div class="stats">
      <div class="stat"><div class="stat-label">${raw(ICONS.bolt)} XP earned</div><div class="stat-value">+${xp}</div></div>
      <div class="stat"><div class="stat-label">${raw(ICONS.flame)} Streak</div><div class="stat-value">${streak} <small>wk</small></div></div>
      <div class="stat"><div class="stat-label">${raw(ICONS.check)} Sets</div><div class="stat-value">${sets}<small>/${log.sets.length}</small></div></div>
      <div class="stat"><div class="stat-label">${raw(ICONS.progress)} Volume</div><div class="stat-value">${vol ? fmtKg(Math.round(vol)) : '–'} <small>${vol ? 'kg' : ''}</small></div></div>
    </div>
    <p class="small muted">XP: ${XP.workout} for finishing + ${XP.set} per completed set${prs.some((p) => p.withinPlan) && !pain ? ` + ${XP.pr} per PR within Paul's plan` : ''}. Level ${lv.level}, ${lv.need - lv.into} XP to the next.</p>
    ${milestone ? html`<div class="card card-accent center"><h2>${raw(ICONS.trophy)} ${milestone} ${milestone === 1 ? 'workout' : 'workouts'} done!</h2><p style="margin:0">Milestone unlocked.</p></div>` : ''}
    ${prs.length ? html`<div class="card"><h2>New personal records</h2><ul class="pr-list">${prs.map((p) => html`<li class="pr-item">${raw(ICONS.trophy)}<span class="grow"><b>${exName(store, p.exercise_id)}</b><br>
        <span class="mono small">${p.kind === 'reps' ? `${p.value} reps` : `${fmtKg(p.kg)} kg × ${p.reps}`}${p.kind === 'e1rm' ? ` · est. 1RM ${fmtKg(p.value)} kg` : ''}</span></span></li>`)}</ul>
      ${heavyPR ? html`<p class="notice" style="margin-top:10px">Some of that was heavier than Paul planned. No bonus XP for going over the plan. Check with Paul before adding weight.</p>` : ''}</div>` : ''}
    <div class="card"><h2>What you did</h2>
      <table class="table"><thead><tr><th>Exercise</th><th class="num">Sets done</th></tr></thead><tbody>
      ${perEx.map((e) => html`<tr><td>${exName(store, e.id)}</td><td class="num">${e.done}/${e.total}</td></tr>`)}</tbody></table>
      ${log.session_rpe ? html`<p class="small" style="margin:10px 0 0">Session RPE: <b>${log.session_rpe}</b></p>` : ''}
      ${log.notes ? html`<p class="small" style="margin:6px 0 0">Your note: ${log.notes}</p>` : ''}
    </div>
    <a class="btn btn-block btn-lg" href="#/a/${t}/program">Back to program</a>
    <a class="btn btn-block btn-ghost" href="#/a/${t}">Home</a>
  </div>`);
  return live(root, store, app, { rerender: false });
}
