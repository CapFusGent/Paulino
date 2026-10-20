// Athlete home: greeting, next session, streak/XP/week, PRs, Paulino.
import { html, raw } from '../../ui/dom.js';
import { mascot } from '../../ui/paulino.js';
import { athleteNav, topBar, ICONS } from '../../ui/layout.js';
import { athleteOr404, ensureBundle, live, badgeSlot, exName } from './common.js';
import { nextWorkout, weeklyStreak, totalXP, level, weekProgress, personalRecords } from '../../core/stats.js';
import { isoDate, relativeDay, formatDate, fmtKg } from '../../core/util.js';

export default function home(root, params, app) {
  const store = athleteOr404(root, params, app);
  if (!store || !ensureBundle(root, store, app)) return;
  const t = params.token;
  const { client } = store.state.bundle;
  const program = store.program();
  const logs = store.logs();
  const today = isoDate();
  const name = client?.display_name || 'champ';

  const right = String(html`${badgeSlot(store)}`);
  let body;

  if (!program) {
    body = html`
      <section class="hero"><h1>Hey <span class="hero-name">${name}</span>!</h1></section>
      <div class="card">${raw(mascot({ mood: 'motivational', context: 'no_program', size: 'md' }))}
        <p style="margin-top:12px">Paul hasn't assigned a program to you yet. When he does, it shows up here automatically.</p></div>`;
  } else {
    const next = nextWorkout(program, logs, today);
    const { byWorkout } = store.effective();
    const streak = weeklyStreak(logs, today);
    const xp = totalXP(logs);
    const lv = level(xp);
    const wk = weekProgress(program, logs, today);
    const done = logs.filter((l) => l.status === 'completed').length;
    const prs = personalRecords(logs).events.slice(-3).reverse();
    const restDay = next && next.workout.scheduled_date && next.workout.scheduled_date > today && !next.inProgress;

    let nextCard = html`<div class="card card-accent"><h2>Program complete!</h2><p>Every session is done. Paul will set up what comes next.</p></div>`;
    if (next) {
      const w = next.workout;
      const items = (byWorkout.get(w.id) || []).filter((i) => !i.removed);
      nextCard = html`<div class="card tape" data-next-workout>
        <div class="row-between"><span class="chip chip-ink">${next.inProgress ? 'In progress' : 'Next session'}</span>
          <span class="chip">${w.scheduled_date ? relativeDay(w.scheduled_date, today) : 'Any day'}</span></div>
        <h2 style="margin-top:12px">${w.name}</h2>
        <p class="muted small">${w.scheduled_date ? formatDate(w.scheduled_date) : ''} · ${next.block.name}</p>
        <ul class="workout-list" style="margin:6px 0 14px">
          ${items.map((it) => html`<li class="row-between" style="padding:4px 0;border-bottom:2px dashed rgba(0,0,0,.15)">
            <b>${exName(store, it.exercise_id)}</b><span class="mono small">${it.summary}</span></li>`)}
        </ul>
        <a class="btn btn-block btn-lg" href="#/a/${t}/w/${w.id}${next.inProgress ? '/go' : ''}">${next.inProgress ? 'Continue workout' : "Let's train"}</a>
      </div>`;
    }

    body = html`
      <section class="hero">
        <span class="scrap scrap-1" aria-hidden="true"></span>
        <h1>Hey <span class="hero-name">${name}</span>!</h1>
        <p class="muted" style="position:relative">${program.name}</p>
      </section>
      <div class="card">${raw(mascot({ mood: 'motivational', context: restDay ? 'rest_day' : 'home', size: 'md' }))}</div>
      ${nextCard}
      <div class="stats" aria-label="Your stats">
        <div class="stat"><div class="stat-label">${raw(ICONS.flame)} Streak</div><div class="stat-value">${streak} <small>${streak === 1 ? 'week' : 'weeks'}</small></div></div>
        <div class="stat"><div class="stat-label">${raw(ICONS.bolt)} XP</div><div class="stat-value">${xp} <small>Lv ${lv.level}</small></div></div>
        <div class="stat"><div class="stat-label">${raw(ICONS.program)} This week</div><div class="stat-value">${wk.completed}<small>/${wk.scheduled}</small></div>
          <div class="progress progress-sm" style="margin-top:6px" role="progressbar" aria-valuemin="0" aria-valuemax="${wk.scheduled}" aria-valuenow="${wk.completed}" ${wk.scheduled && wk.completed >= wk.scheduled ? raw('data-full') : ''}><span style="width:${wk.scheduled ? Math.round((wk.completed / wk.scheduled) * 100) : 0}%"></span></div></div>
        <div class="stat"><div class="stat-label">${raw(ICONS.check)} Done</div><div class="stat-value">${done} <small>workouts</small></div></div>
      </div>
      <div class="section-title"><h2>Personal records</h2></div>
      ${prs.length ? html`<ul class="pr-list">${prs.map((e) => html`<li class="pr-item">${raw(ICONS.trophy)}
          <span class="grow"><b>${exName(store, e.exercise_id)}</b><br><span class="small mono">${e.kind === 'reps' ? `${e.value} reps (bodyweight)` : e.kind === 'e1rm' ? `${fmtKg(e.kg)} kg × ${e.reps} · est. 1RM ${fmtKg(e.value)} kg` : `${fmtKg(e.kg)} kg × ${e.reps}`}</span></span>
          <span class="chip">${formatDate(e.date, { weekday: false })}</span></li>`)}</ul>
          <p class="small"><a href="#/a/${t}/progress">All progress →</a></p>`
        : html`<p class="muted">Your first PRs show up after a couple of sessions. Lift well, the numbers will come.</p>`}`;
  }

  root.innerHTML = String(html`<div class="page stack">
    ${topBar({ right })}
    ${body}
  </div>${athleteNav(t, 'home')}`);
  return live(root, store, app);
}
