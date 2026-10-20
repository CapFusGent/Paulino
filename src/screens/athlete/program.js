// Program overview: collapsible weeks/blocks, current one open.
import { html, raw } from '../../ui/dom.js';
import { athleteNav, topBar, ICONS } from '../../ui/layout.js';
import { athleteOr404, ensureBundle, live, badgeSlot, exName } from './common.js';
import { nextWorkout } from '../../core/stats.js';
import { isoDate, formatDate, parseIsoDate } from '../../core/util.js';

export function workoutStatus(log, date, today) {
  if (log?.status === 'completed') return 'done';
  if (log?.status === 'skipped') return 'skipped';
  if (log?.status === 'in_progress') return 'progress';
  if (date && date < today) return 'missed';
  if (date === today) return 'today';
  return 'upcoming';
}

const STATUS = {
  done: { cls: 'status-done', icon: ICONS.check, label: 'Done' },
  skipped: { cls: 'status-skipped', icon: '', label: 'Skipped' },
  progress: { cls: 'status-progress', icon: '…', label: 'In progress' },
  missed: { cls: '', icon: '', label: 'Not logged' },
  today: { cls: 'status-progress', icon: '!', label: 'Today' },
  upcoming: { cls: '', icon: '', label: 'Upcoming' },
};

export default function program(root, params, app) {
  const store = athleteOr404(root, params, app);
  if (!store || !ensureBundle(root, store, app)) return;
  const t = params.token;
  const prog = store.program();
  const today = isoDate();
  if (!prog) {
    root.innerHTML = String(html`<div class="page stack">${topBar({ title: 'Program', right: String(badgeSlot(store)) })}
      <div class="card"><p>No program assigned yet.</p></div></div>${athleteNav(t, 'program')}`);
    return live(root, store, app);
  }
  const logs = store.logs();
  const byWorkout = new Map(logs.map((l) => [l.workout_id, l]));
  const { byWorkout: eff } = store.effective();
  const next = nextWorkout(prog, logs, today);
  const currentBlockId =
    prog.blocks.find((b) => b.start_date && b.end_date && b.start_date <= today && today <= b.end_date)?.id ||
    next?.block.id || prog.blocks[0]?.id;

  const blockHtml = prog.blocks.map((b) => {
    const ws = b.workouts || [];
    const done = ws.filter((w) => ['completed', 'skipped'].includes(byWorkout.get(w.id)?.status)).length;
    const pct = ws.length ? Math.round((done / ws.length) * 100) : 0;
    const dates = b.start_date ? `${formatDate(b.start_date, { weekday: false })}${b.end_date ? ` – ${formatDate(b.end_date, { weekday: false })}` : ''}` : '';
    return html`<details class="block" ${b.id === currentBlockId ? raw('open') : ''} data-block="${b.id}">
      <summary>
        <div class="block-head"><h3>${b.name}</h3>${b.id === currentBlockId ? html`<span class="chip chip-accent">Now</span>` : ''}<span class="chev" aria-hidden="true">${raw(ICONS.down)}</span></div>
        <div class="row-between small"><span class="muted">${dates}</span><span class="mono">${done}/${ws.length} done</span></div>
        <div class="progress progress-sm" role="progressbar" aria-label="${b.name} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" ${pct === 100 ? raw('data-full') : ''}><span style="width:${pct}%"></span></div>
      </summary>
      ${b.notes ? html`<p class="paul-note" style="margin:12px 16px">${b.notes}</p>` : ''}
      <ul class="workout-list">
        ${ws.map((w) => {
          const st = workoutStatus(byWorkout.get(w.id), w.scheduled_date, today);
          const items = (eff.get(w.id) || []).filter((i) => !i.removed);
          const d = parseIsoDate(w.scheduled_date);
          const dev = items.some((i) => i.deviation);
          return html`<li><a class="workout-row" href="#/a/${t}/w/${w.id}" data-workout="${w.id}">
            <span class="wdate ${w.scheduled_date === today ? 'today' : ''}">${d ? html`<b>${d.getDate()}</b><span>${formatDate(w.scheduled_date, { weekday: true }).split(' ')[0]}</span>` : html`<b>·</b><span>any</span>`}</span>
            <span class="wbody"><h4>${w.name}</h4><p>${items.map((i) => `${exName(store, i.exercise_id)} ${shortSets(i)}`).join(' · ')}</p>
              ${dev ? html`<span class="chip chip-dev" style="margin-top:4px">You changed this</span>` : ''}</span>
            <span class="wstatus" title="${STATUS[st].label}"><span class="status-dot ${STATUS[st].cls}" aria-label="${STATUS[st].label}">${raw(STATUS[st].icon)}</span></span>
          </a></li>`;
        })}
      </ul>
    </details>`;
  });

  root.innerHTML = String(html`<div class="page">
    ${topBar({ title: prog.name, sub: `${prog.blocks.length} blocks · by ${store.state.bundle.client?.coach_name || 'Paul'}`, right: String(badgeSlot(store)) })}
    ${prog.notes ? html`<details class="card" style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:700">Paul's notes for this program</summary><p class="paul-note" style="margin-top:10px">${prog.notes}</p></details>` : ''}
    ${blockHtml}
  </div>${athleteNav(t, 'program')}`);
  return live(root, store, app);
}

function shortSets(item) {
  const r = item.resolved;
  if (!r.length) return '';
  const same = r.every((x) => x.reps === r[0].reps);
  return same ? `${r.length}×${r[0].reps}` : `${r.length} sets`;
}
