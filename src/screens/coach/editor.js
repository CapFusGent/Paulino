// Coach program editor. Fast path: name → add exercises with quick entry
// ("5x5@60") → Save → Share. Everything is editable per set when needed.
//
// Edits go to a local draft immediately (survives reloads and going offline).
// Save sends the whole tree with the version it was based on; if someone saved
// in between, Paul chooses explicitly what to keep.
import { html, raw, esc, on, sheet, toast, confirmSheet } from '../../ui/dom.js';
import { topBar, ICONS } from '../../ui/layout.js';
import { mascot } from '../../ui/paulino.js';
import { validateProgram } from '../../core/validation.js';
import { parseQuick, toQuick, resolveSets, summarize, makeSet } from '../../core/prescription.js';
import { progressionPlan } from '../../core/progression.js';
import { cloneBlock, cloneWorkout } from '../../core/templates.js';
import { CATEGORIES } from '../../data/exercises.js';
import { uid, addDays, formatDate, clone, fmtKg } from '../../core/util.js';
import { shareSheet } from './share.js';

const REST = [0, 60, 90, 120, 150, 180, 240, 300];
const restText = (s) => (s ? (s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s / 60} min`) : 'none');

export default async function editor(root, params, app) {
  if (!app.coach.signedIn) { app.navigate('/coach', { replace: true }); return; }
  const id = params.programId;
  root.innerHTML = String(html`<div class="page no-nav">${topBar({ title: 'Program', back: '/coach' })}<div class="card"><p>Loading…</p></div></div>`);

  let exercises = [];
  let clients = app.coach.cachedDashboard()?.clients || [];
  let server = null;
  let offline = false;
  try {
    [exercises] = await Promise.all([
      app.coach.exercises(),
      app.coach.dashboard().then((r) => { clients = r.data.clients; }).catch(() => {}),
    ]);
  } catch (e) { toast(e.message, { kind: 'error' }); }
  try {
    const r = await app.coach.getProgram(id);
    server = r.data;
    offline = r.offline;
  } catch (e) {
    if (e.status !== 404 && !/not_found/.test(e.message) && !e.offline) { toast(e.message, { kind: 'error' }); }
    offline = e.offline;
  }
  const draft = app.coach.draft(id);
  if (!server && !draft) {
    root.innerHTML = String(html`<div class="page no-nav">${topBar({ title: 'Program', back: '/coach' })}<div class="card"><p>${offline ? 'You are offline and this program is not stored on this device.' : 'Program not found.'}</p><a class="btn" href="#/coach">Back</a></div></div>`);
    return;
  }

  let prog, baseVersion, banner = '';
  if (draft && (!server || draft.baseVersion === server.version)) {
    prog = draft.program;
    baseVersion = draft.baseVersion;
    if (server && JSON.stringify(strip(draft.program)) !== JSON.stringify(strip(server))) banner = 'restored';
  } else if (draft && server) {
    prog = clone(server);
    baseVersion = server.version;
    banner = 'stale-draft';
  } else {
    prog = clone(server);
    baseVersion = server.version;
  }
  let dirty = banner === 'restored' || (!server && Boolean(draft));
  let errors = [];
  const open = new Set([prog.blocks[0]?.id].filter(Boolean));
  let saveTimer = null;

  const exById = (eid) => exercises.find((e) => e.id === eid);
  const markDirty = () => {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => app.coach.saveDraft(id, prog, baseVersion), 300);
    const s = root.querySelector('[data-save-state]');
    if (s) { s.textContent = 'Unsaved changes (kept on this device)'; s.classList.add('dirty'); }
  };

  // id → object lookup, rebuilt every render
  let index = new Map();
  const reindex = () => {
    index = new Map([[prog.id, { kind: 'program', obj: prog }]]);
    prog.blocks.forEach((b, bi) => {
      index.set(b.id, { kind: 'block', obj: b, list: prog.blocks, i: bi });
      (b.workouts ||= []).forEach((w, wi) => {
        index.set(w.id, { kind: 'workout', obj: w, list: b.workouts, i: wi, block: b });
        (w.prescriptions ||= []).forEach((x, xi) => index.set(x.id, { kind: 'presc', obj: x, list: w.prescriptions, i: xi, workout: w }));
      });
    });
  };

  const exOptions = (sel) => Object.entries(CATEGORIES).map(([cat, label]) => {
    const list = exercises.filter((e) => e.category === cat);
    return list.length ? `<optgroup label="${esc(label)}">${list.map((e) => `<option value="${esc(e.id)}"${e.id === sel ? ' selected' : ''}>${esc(e.name)}${e.custom ? ' ★' : ''}</option>`).join('')}</optgroup>` : '';
  }).join('');

  function prescHtml(x, xi, w, plan) {
    const pr = plan.get(x.id) || { basis: 'manual' };
    const resolved = resolveSets(x.sets, pr.delta || 0);
    const autoNote = x.progression && pr.basis !== 'start' && pr.basis !== 'manual'
      ? html`<p class="small" style="margin:6px 0 0">Auto weight: follows the +${fmtKg(x.progression.increment_kg)} kg rule from the previous session. Weight typed here is only used if the rule is off.</p>` : '';
    return html`<div class="ed-presc" data-presc="${x.id}">
      <div class="ed-presc-head">
        <span class="ed-num">${xi + 1}</span>
        <select data-k="presc" data-id="${x.id}" data-f="exercise_id" aria-label="Exercise">${raw(exOptions(x.exercise_id))}</select>
      </div>
      <div class="tools" style="margin-top:8px">
        <button class="icon-btn sq" data-move="${x.id}" data-dir="-1" aria-label="Move up" ${xi === 0 ? raw('disabled') : ''}>${raw(ICONS.up)}</button>
        <button class="icon-btn sq" data-move="${x.id}" data-dir="1" aria-label="Move down" ${xi === w.prescriptions.length - 1 ? raw('disabled') : ''}>${raw(ICONS.down)}</button>
        <button class="icon-btn sq" data-dup-item="${x.id}" aria-label="Duplicate exercise">${raw(ICONS.dup)}</button>
        <button class="icon-btn sq" data-remove="${x.id}" aria-label="Remove exercise">${raw(ICONS.trash)}</button>
      </div>
      <p class="ex-presc" style="font-size:.95rem">${summarize(resolved)}</p>
      <div class="quick"><input type="text" value="${toQuick(x.sets)}" data-quick="${x.id}" aria-label="Quick entry, e.g. 5x5@60" spellcheck="false" autocapitalize="off"><button class="btn btn-sm" data-apply="${x.id}">Apply</button></div>
      <p class="small muted" style="margin:4px 0 0">e.g. <span class="mono">5x5@60</span> · <span class="mono">3x8-10@40</span> · <span class="mono">5x3 bw</span> · <span class="mono">1x1@100, 4x5@86%</span> · <span class="mono">3x5@80 rpe8</span></p>
      <details style="margin-top:8px" ${open.has(`sets-${x.id}`) ? raw('open') : ''} data-open-key="sets-${x.id}"><summary class="small" style="cursor:pointer;font-weight:700">Edit sets one by one</summary>
        <div class="set-edit set-edit-head"><span>#</span><span>Reps</span><span>Load</span><span>kg / %</span><span>RPE</span><span></span></div>
        ${x.sets.map((s, si) => html`<div class="set-edit">
          <span class="n">${si + 1}</span>
          <input type="text" inputmode="numeric" value="${s.reps_max && s.reps_max !== s.reps ? `${s.reps}-${s.reps_max}` : s.reps}" data-set="${x.id}" data-si="${si}" data-sf="reps" aria-label="Set ${si + 1} reps">
          <select data-set="${x.id}" data-si="${si}" data-sf="kind" aria-label="Set ${si + 1} load type">
            ${[['kg', 'kg'], ['bw', 'BW'], ['bw_plus', 'BW +'], ['pct_top', '% set 1']].map(([k, l]) => html`<option value="${k}" ${s.load.kind === k ? raw('selected') : ''} ${k === 'pct_top' && si === 0 ? raw('disabled') : ''}>${l}</option>`)}
          </select>
          <input type="number" inputmode="decimal" min="0" step="0.5" value="${s.load.kind === 'bw' ? '' : s.load.value}" ${s.load.kind === 'bw' ? raw('disabled') : ''} data-set="${x.id}" data-si="${si}" data-sf="value" aria-label="Set ${si + 1} weight">
          <input type="number" inputmode="decimal" min="1" max="10" step="0.5" value="${s.rpe ?? ''}" data-set="${x.id}" data-si="${si}" data-sf="rpe" aria-label="Set ${si + 1} RPE">
          <button class="icon-btn sq" style="width:30px;height:30px" data-del-set="${x.id}" data-si="${si}" aria-label="Delete set ${si + 1}" ${x.sets.length === 1 ? raw('disabled') : ''}>✕</button>
        </div>`)}
        <button class="btn btn-sm btn-ghost" data-add-set="${x.id}" style="margin-top:8px">+ Set</button>
      </details>
      <div class="ed-grid" style="margin-top:10px">
        <div><label for="r-${x.id}">Rest</label><select id="r-${x.id}" data-k="presc" data-id="${x.id}" data-f="rest_seconds">${REST.map((r) => html`<option value="${r}" ${(x.rest_seconds ?? 0) === r ? raw('selected') : ''}>${restText(r)}</option>`)}</select></div>
        <div><label for="t-${x.id}">Tempo</label><input id="t-${x.id}" type="text" maxlength="20" placeholder="e.g. 3-1-1" value="${x.tempo || ''}" data-k="presc" data-id="${x.id}" data-f="tempo"></div>
      </div>
      <div class="field" style="margin:10px 0 0"><label for="n-${x.id}">Your cue for the athlete</label><textarea id="n-${x.id}" maxlength="2000" rows="2" placeholder="Shown first, before Paulino's generic tips" data-k="presc" data-id="${x.id}" data-f="coach_notes">${x.coach_notes || ''}</textarea></div>
      <label class="check"><input type="checkbox" data-prog="${x.id}" ${x.progression ? raw('checked') : ''} ${['kg', 'bw_plus'].includes(x.sets[0]?.load.kind) ? '' : raw('disabled')}>
        Auto +<input type="number" inputmode="decimal" min="0.5" max="50" step="0.5" value="${x.progression?.increment_kg ?? 2.5}" data-prog-inc="${x.id}" style="width:72px;min-height:36px;padding:4px" aria-label="Increment kg"> kg after a clean session</label>
      ${autoNote}
    </div>`;
  }

  function workoutHtml(w, wi, b, plan) {
    const isOpen = open.has(w.id);
    return html`<details class="ed-workout" data-open-key="${w.id}" ${isOpen ? raw('open') : ''}>
      <summary><span class="wdate" style="width:46px;flex-basis:46px">${w.scheduled_date ? html`<b>${Number(w.scheduled_date.slice(8))}</b><span>${formatDate(w.scheduled_date).split(' ')[0]}</span>` : html`<b>·</b><span>date</span>`}</span>
        <span class="grow"><b data-title-for="${w.id}">${w.name || 'Untitled workout'}</b><br><span class="small muted">${w.prescriptions.length} exercises${w.prescriptions.length ? ` · ${w.prescriptions.map((x) => exById(x.exercise_id)?.name || x.exercise_id).join(', ')}` : ''}</span></span>
        <span class="chev" aria-hidden="true">${raw(ICONS.down)}</span></summary>
      ${isOpen ? html`<div class="ed-workout-body">
        <div class="ed-grid">
          <div><label for="wn-${w.id}">Name</label><input id="wn-${w.id}" type="text" maxlength="120" value="${w.name}" data-k="workout" data-id="${w.id}" data-f="name"></div>
          <div><label for="wd-${w.id}">Date</label><input id="wd-${w.id}" type="date" value="${w.scheduled_date || ''}" data-k="workout" data-id="${w.id}" data-f="scheduled_date"></div>
        </div>
        <div class="field" style="margin-top:10px"><label for="wo-${w.id}">Notes for this session</label><textarea id="wo-${w.id}" rows="2" maxlength="2000" data-k="workout" data-id="${w.id}" data-f="notes">${w.notes || ''}</textarea></div>
        ${w.prescriptions.map((x, xi) => prescHtml(x, xi, w, plan))}
        <button class="btn btn-block" data-add-ex="${w.id}" style="margin-top:12px">${raw(ICONS.plus)} Add exercise</button>
        <div class="tools" style="margin-top:12px">
          <button class="btn btn-sm btn-ghost" data-move="${w.id}" data-dir="-1" ${wi === 0 ? raw('disabled') : ''}>${raw(ICONS.up)} Up</button>
          <button class="btn btn-sm btn-ghost" data-move="${w.id}" data-dir="1" ${wi === b.workouts.length - 1 ? raw('disabled') : ''}>${raw(ICONS.down)} Down</button>
          <button class="btn btn-sm btn-ghost" data-dup-item="${w.id}">${raw(ICONS.dup)} Duplicate</button>
          <button class="btn btn-sm btn-ghost" data-remove="${w.id}">${raw(ICONS.trash)} Delete</button>
        </div></div>` : ''}
    </details>`;
  }

  function blockHtml(b, bi, plan) {
    const isOpen = open.has(b.id);
    return html`<details class="block ed-block" data-open-key="${b.id}" ${isOpen ? raw('open') : ''}>
      <summary><div class="block-head"><h3 data-title-for="${b.id}">${b.name || `Block ${bi + 1}`}</h3><span class="chip">${b.workouts.length} workouts</span><span class="chev" aria-hidden="true">${raw(ICONS.down)}</span></div>
        ${b.start_date ? html`<span class="small muted">${formatDate(b.start_date, { weekday: false })}${b.end_date ? ` – ${formatDate(b.end_date, { weekday: false })}` : ''}</span>` : ''}</summary>
      ${isOpen ? html`<div class="ed-block-body">
        <div class="field"><label for="bn-${b.id}">Block / week name</label><input id="bn-${b.id}" type="text" maxlength="120" value="${b.name}" data-k="block" data-id="${b.id}" data-f="name"></div>
        <div class="ed-grid">
          <div><label for="bs-${b.id}">Starts</label><input id="bs-${b.id}" type="date" value="${b.start_date || ''}" data-k="block" data-id="${b.id}" data-f="start_date"></div>
          <div><label for="be-${b.id}">Ends</label><input id="be-${b.id}" type="date" value="${b.end_date || ''}" data-k="block" data-id="${b.id}" data-f="end_date"></div>
        </div>
        ${b.workouts.map((w, wi) => workoutHtml(w, wi, b, plan))}
        <button class="btn btn-block btn-ghost" data-add-workout="${b.id}" style="margin-top:12px">${raw(ICONS.plus)} Add workout</button>
        <div class="tools" style="margin-top:12px">
          <button class="btn btn-sm btn-ghost" data-move="${b.id}" data-dir="-1" ${bi === 0 ? raw('disabled') : ''}>${raw(ICONS.up)}</button>
          <button class="btn btn-sm btn-ghost" data-move="${b.id}" data-dir="1" ${bi === prog.blocks.length - 1 ? raw('disabled') : ''}>${raw(ICONS.down)}</button>
          <button class="btn btn-sm btn-ghost" data-dup-item="${b.id}">${raw(ICONS.dup)} Copy as next week</button>
          <button class="btn btn-sm btn-ghost" data-remove="${b.id}">${raw(ICONS.trash)} Delete</button>
        </div></div>` : ''}
    </details>`;
  }

  function render() {
    reindex();
    const plan = progressionPlan(prog, []);
    const y = window.scrollY;
    const client = clients.find((c) => c.id === prog.client_id);
    root.innerHTML = String(html`<div class="page no-nav">
      <div class="editor-bar">
        <button class="icon-btn" data-action="back" data-fallback="/coach" aria-label="Back">←</button>
        <span class="save-state ${dirty ? 'dirty' : ''}" data-save-state>${dirty ? 'Unsaved changes (kept on this device)' : baseVersion ? `Saved · version ${baseVersion}` : 'New program, not saved yet'}</span>
        ${client && baseVersion && !dirty ? html`<button class="btn btn-sm btn-ghost" data-share>${raw(ICONS.share)} Share</button>` : ''}
        <button class="btn btn-sm" data-save>Save</button>
      </div>
      ${banner === 'restored' ? html`<p class="notice" style="margin-top:12px">Your unsaved changes were restored. <button class="link-btn" data-discard>Discard them</button></p>` : ''}
      ${banner === 'stale-draft' ? html`<p class="notice" style="margin-top:12px">You have an unsaved draft based on an older version. This program was saved elsewhere since. <button class="link-btn" data-use-draft>Open my draft instead</button></p>` : ''}
      ${offline ? html`<p class="notice" style="margin-top:12px">Offline: edits are kept on this device. Save when you're back online.</p>` : ''}
      ${errors.length ? html`<div class="card ed-errors" style="margin-top:14px" data-errors tabindex="-1"><h3>Fix these before saving</h3><ul>${errors.slice(0, 12).map((e) => html`<li>${e.message}</li>`)}</ul>${errors.length > 12 ? html`<p>…and ${errors.length - 12} more.</p>` : ''}</div>` : ''}
      <div class="card" style="margin-top:16px">
        <div class="field"><label for="p-name">Program name</label><input id="p-name" class="input-big" type="text" maxlength="120" value="${prog.name}" placeholder="Name this program" data-k="program" data-id="${prog.id}" data-f="name"></div>
        <div>
          <div class="field"><label for="p-client">Athlete</label><select id="p-client" data-k="program" data-id="${prog.id}" data-f="client_id">
            <option value="">Not assigned</option>${clients.filter((c) => !c.archived || c.id === prog.client_id).map((c) => html`<option value="${c.id}" ${c.id === prog.client_id ? raw('selected') : ''}>${c.display_name}</option>`)}<option value="__new">+ New athlete…</option></select></div>
          <div class="field"><span class="label">Status</span><div class="seg" role="group" aria-label="Status">
            ${['draft', 'active', 'archived'].map((s) => html`<button type="button" data-status="${s}" aria-pressed="${prog.status === s}">${s[0].toUpperCase() + s.slice(1)}</button>`)}</div></div>
        </div>
        <p class="small muted" style="margin:0 0 10px">${prog.status === 'active' ? 'Active: the athlete sees this program through their link.' : prog.status === 'draft' ? 'Draft: only you can see it. Set it to Active to publish.' : 'Archived: kept for history, hidden from the athlete.'}</p>
        <div class="field" style="margin:0"><label for="p-notes">Program notes for the athlete</label><textarea id="p-notes" rows="3" maxlength="4000" data-k="program" data-id="${prog.id}" data-f="notes">${prog.notes || ''}</textarea></div>
      </div>
      <div class="section-title"><h2>Weeks & blocks</h2></div>
      ${prog.blocks.map((b, bi) => blockHtml(b, bi, plan))}
      <div class="btn-row"><button class="btn btn-ghost" data-add-block>${raw(ICONS.plus)} Add empty week</button>${prog.blocks.length ? html`<button class="btn btn-ghost" data-copy-last>${raw(ICONS.dup)} Copy last week</button>` : ''}</div>
      <div class="card" style="margin-top:22px">${raw(mascot({ mood: 'focused', text: 'Save, then share. Paul, you legend.', size: 'sm', still: true }))}</div>
      <button class="btn btn-block btn-lg" data-save style="margin-top:16px">Save program</button>
      ${baseVersion ? html`<p class="center small" style="margin-top:12px"><button class="link-btn" data-history>Version history</button></p>` : ''}
    </div>`);
    window.scrollTo(0, y);
  }

  const update = (kind, idv, f, v) => {
    const e = index.get(idv);
    if (!e) return;
    e.obj[f] = v;
    markDirty();
  };

  const offs = [];
  offs.push(on(root, 'input', '[data-k]', (e, el) => {
    const f = el.dataset.f;
    if (f === 'client_id' || f === 'exercise_id' || f === 'rest_seconds') return; // handled on change
    update(el.dataset.k, el.dataset.id, f, el.value);
    // Keep collapsed headers in sync without re-rendering (a re-render on blur would eat the next tap).
    if (f === 'name') root.querySelectorAll(`[data-title-for="${el.dataset.id}"]`).forEach((t) => { t.textContent = el.value || 'Untitled'; });
  }));
  offs.push(on(root, 'change', '[data-k]', async (e, el) => {
    const f = el.dataset.f;
    let v = el.value;
    if (f === 'client_id' && v === '__new') {
      const name = await askName();
      if (!name) { el.value = prog.client_id || ''; return; }
      try {
        const c = await app.coach.createClient(name);
        clients = [...clients, c];
        v = c.id;
      } catch (err) { toast(err.message, { kind: 'error' }); el.value = prog.client_id || ''; return; }
    }
    if (f === 'rest_seconds') v = Number(v) || null;
    if (f === 'client_id') v = v || null;
    if (f === 'scheduled_date' || f === 'start_date' || f === 'end_date') v = v || null;
    update(el.dataset.k, el.dataset.id, f, v);
    // Selects and date pickers fire `change` on selection, so re-rendering is safe; text fields fire it on blur, so they don't re-render.
    if (['client_id', 'exercise_id', 'scheduled_date', 'start_date', 'end_date'].includes(f)) render();
  }));
  offs.push(on(root, 'toggle', 'details[data-open-key]', (e, el) => {
    if (e.target !== el) return;
    const k = el.dataset.openKey;
    const was = open.has(k);
    if (el.open) open.add(k); else open.delete(k);
    if (was !== el.open && !k.startsWith('sets-')) render();
  }, true));
  offs.push(on(root, 'click', '[data-status]', (e, el) => { prog.status = el.dataset.status; markDirty(); render(); }));

  const applyQuick = (pid) => {
    const x = index.get(pid)?.obj;
    const input = root.querySelector(`[data-quick="${pid}"]`);
    const r = parseQuick(input.value, x.sets[0]?.load);
    if (r.error) { toast(r.error, { kind: 'error' }); input.classList.add('invalid'); return; }
    x.sets = r.sets;
    if (x.progression && !['kg', 'bw_plus'].includes(x.sets[0].load.kind)) x.progression = null;
    markDirty();
    render();
  };
  offs.push(on(root, 'click', '[data-apply]', (e, el) => applyQuick(el.dataset.apply)));
  offs.push(on(root, 'keydown', '[data-quick]', (e, el) => { if (e.key === 'Enter') { e.preventDefault(); applyQuick(el.dataset.quick); } }));

  offs.push(on(root, 'change', '[data-set]', (e, el) => {
    const x = index.get(el.dataset.set).obj;
    const s = x.sets[Number(el.dataset.si)];
    const f = el.dataset.sf;
    if (f === 'reps') {
      const m = el.value.trim().match(/^(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/);
      if (!m) { toast('Reps: a number like 5, or a range like 8-10', { kind: 'error' }); el.classList.add('invalid'); return; }
      s.reps = Number(m[1]);
      s.reps_max = m[2] ? Number(m[2]) : null;
    } else if (f === 'kind') {
      const prev = s.load;
      s.load = el.value === 'bw' ? { kind: 'bw' } : { kind: el.value, value: el.value === 'pct_top' ? 85 : Number(prev.value) || 0 };
      if (x.progression && !['kg', 'bw_plus'].includes(x.sets[0].load.kind)) x.progression = null;
    } else if (f === 'value') s.load.value = el.value === '' ? 0 : Number(el.value);
    else if (f === 'rpe') s.rpe = el.value === '' ? null : Number(el.value);
    markDirty();
    render();
  }));
  offs.push(on(root, 'click', '[data-add-set]', (e, el) => {
    const x = index.get(el.dataset.addSet).obj;
    x.sets.push(clone(x.sets[x.sets.length - 1] || makeSet(5, 20)));
    open.add(`sets-${x.id}`);
    markDirty(); render();
  }));
  offs.push(on(root, 'click', '[data-del-set]', (e, el) => {
    const x = index.get(el.dataset.delSet).obj;
    if (x.sets.length > 1) x.sets.splice(Number(el.dataset.si), 1);
    if (x.sets[0].load.kind === 'pct_top') x.sets[0].load = { kind: 'kg', value: 0 };
    markDirty(); render();
  }));
  offs.push(on(root, 'change', '[data-prog]', (e, el) => {
    const x = index.get(el.dataset.prog).obj;
    const inc = Number(root.querySelector(`[data-prog-inc="${x.id}"]`).value) || 2.5;
    x.progression = el.checked ? { type: 'linear', increment_kg: inc } : null;
    markDirty(); render();
  }));
  offs.push(on(root, 'change', '[data-prog-inc]', (e, el) => {
    const x = index.get(el.dataset.progInc).obj;
    const v = Number(el.value);
    if (!(v > 0 && v <= 50)) { toast('Increment must be between 0.5 and 50 kg', { kind: 'error' }); return; }
    if (x.progression) { x.progression.increment_kg = v; markDirty(); }
  }));

  offs.push(on(root, 'click', '[data-move]', (e, el) => {
    e.preventDefault();
    const ent = index.get(el.dataset.move);
    const j = ent.i + Number(el.dataset.dir);
    if (j < 0 || j >= ent.list.length) return;
    [ent.list[ent.i], ent.list[j]] = [ent.list[j], ent.list[ent.i]];
    markDirty(); render();
  }));
  offs.push(on(root, 'click', '[data-dup-item]', (e, el) => {
    e.preventDefault();
    const ent = index.get(el.dataset.dupItem);
    if (ent.kind === 'presc') ent.list.splice(ent.i + 1, 0, { ...clone(ent.obj), id: uid() });
    else if (ent.kind === 'workout') {
      const c = cloneWorkout(ent.obj, ent.obj.scheduled_date ? 2 : 0);
      ent.list.splice(ent.i + 1, 0, c);
      open.add(c.id);
    } else if (ent.kind === 'block') {
      const n = nextWeekName(ent.obj.name, prog.blocks.length);
      const c = cloneBlock(ent.obj, 7, n);
      ent.list.splice(ent.i + 1, 0, c);
      open.add(c.id);
    }
    markDirty(); render();
  }));
  offs.push(on(root, 'click', '[data-remove]', async (e, el) => {
    e.preventDefault();
    const ent = index.get(el.dataset.remove);
    if (ent.kind !== 'presc') {
      const what = ent.kind === 'block' ? `"${ent.obj.name}" and its ${ent.obj.workouts.length} workouts` : `"${ent.obj.name}"`;
      const ok = await confirmSheet({ title: 'Delete?', text: `${what} will be removed when you save. Workouts already logged by the athlete stay in their history.`, ok: 'Delete', danger: true });
      if (!ok) return;
    }
    ent.list.splice(ent.i, 1);
    markDirty(); render();
  }));
  offs.push(on(root, 'click', '[data-add-ex]', async (e, el) => {
    const w = index.get(el.dataset.addEx).obj;
    const exId = await pickExercise();
    if (!exId) return;
    const prev = [...w.prescriptions].reverse().find((x) => x.exercise_id === exId);
    w.prescriptions.push({ id: uid(), exercise_id: exId, position: w.prescriptions.length, sets: prev ? clone(prev.sets) : Array.from({ length: 3 }, () => makeSet(5, 20)), rest_seconds: 120, tempo: null, coach_notes: '', progression: null });
    markDirty(); render();
  }));
  offs.push(on(root, 'click', '[data-add-workout]', (e, el) => {
    const b = index.get(el.dataset.addWorkout).obj;
    const last = b.workouts[b.workouts.length - 1];
    const date = last?.scheduled_date ? addDays(last.scheduled_date, 2) : b.start_date || null;
    const w = { id: uid(), name: `Workout ${b.workouts.length + 1}`, scheduled_date: date, position: b.workouts.length, notes: '', prescriptions: [] };
    b.workouts.push(w);
    open.add(w.id);
    markDirty(); render();
  }));
  offs.push(on(root, 'click', '[data-add-block]', () => {
    const last = prog.blocks[prog.blocks.length - 1];
    const start = last?.end_date ? addDays(last.end_date, 1) : null;
    const b = { id: uid(), name: `Week ${prog.blocks.length + 1}`, position: prog.blocks.length, start_date: start, end_date: start ? addDays(start, 6) : null, notes: '', workouts: [] };
    prog.blocks.push(b);
    open.add(b.id);
    markDirty(); render();
  }));
  offs.push(on(root, 'click', '[data-copy-last]', () => {
    const last = prog.blocks[prog.blocks.length - 1];
    const c = cloneBlock(last, 7, nextWeekName(last.name, prog.blocks.length));
    prog.blocks.push(c);
    open.add(c.id);
    markDirty(); render();
  }));
  offs.push(on(root, 'click', '[data-discard]', () => { app.coach.clearDraft(id); prog = clone(server); baseVersion = server.version; dirty = false; banner = ''; render(); }));
  offs.push(on(root, 'click', '[data-use-draft]', () => { prog = draft.program; dirty = true; banner = ''; render(); }));
  offs.push(on(root, 'click', '[data-share]', () => shareSheet(clients.find((c) => c.id === prog.client_id), { programName: prog.name })));
  offs.push(on(root, 'click', '[data-history]', async () => {
    let list = [];
    try { list = await app.coach.revisions(id); } catch (err) { toast(err.message, { kind: 'error' }); return; }
    sheet({ title: 'Version history' }, (body) => {
      body.innerHTML = String(html`<p class="small muted">Every save is kept as a version. Athlete changes are stored separately and never create versions.</p>
        <table class="table"><tbody>${list.map((r) => html`<tr><td>v${r.version}</td><td>${new Date(r.saved_at).toLocaleString()}</td></tr>`)}</tbody></table>`);
    });
  }));
  offs.push(on(root, 'click', '[data-save]', () => save()));

  async function save(force = false) {
    reindex();
    const ids = new Set(exercises.map((e) => e.id));
    const { errors: errs } = validateProgram(prog, { exerciseIds: ids, clientIds: new Set(clients.map((c) => c.id)) });
    errors = errs;
    if (errs.length) { render(); root.querySelector('[data-errors]')?.focus(); root.querySelector('[data-errors]')?.scrollIntoView({ block: 'center' }); return; }
    prog.blocks.forEach((b, bi) => { b.position = bi; b.workouts.forEach((w, wi) => { w.position = wi; w.prescriptions.forEach((x, xi) => { x.position = xi; }); }); });
    const btns = root.querySelectorAll('[data-save]');
    btns.forEach((b) => { b.disabled = true; });
    try {
      const res = await app.coach.saveProgram(prog, force ? force : baseVersion);
      baseVersion = res.version;
      server = res.program;
      prog = clone(res.program);
      dirty = false;
      banner = '';
      offline = false;
      app.coach.clearDraft(id);
      render();
      const client = clients.find((c) => c.id === prog.client_id);
      toast(`Saved (version ${res.version}).`, { kind: 'ok' });
      if (client && prog.status === 'active' && res.version === 1) shareSheet(client, { programName: prog.name });
      else if (client && prog.status !== 'active') toast('Tip: set status to Active so the athlete can see it.', { kind: 'warn', ms: 4500 });
    } catch (e) {
      btns.forEach((b) => { b.disabled = false; });
      if (e.code === 'PT409' || /version_conflict/.test(e.message)) return conflict();
      app.coach.saveDraft(id, prog, baseVersion);
      toast(e.offline ? 'Offline. Your changes are kept on this device. Save again when online.' : `Couldn't save: ${e.message}`, { kind: 'error', ms: 5000 });
    }
  }

  async function conflict() {
    const choice = await sheet({ title: 'Saved somewhere else', dismissable: false }, (body, close) => {
      body.innerHTML = String(html`<p>This program was saved from another device or tab after you opened it. Which version do you want?</p>
        <div class="stack-sm"><button class="btn btn-block" data-c="mine">Keep mine (overwrite theirs)</button>
        <button class="btn btn-block btn-ghost" data-c="theirs">Load the latest (discard mine)</button>
        <button class="btn btn-block btn-ghost" data-c="cancel">Decide later</button></div>`);
      body.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => close(b.dataset.c)));
    });
    if (choice === 'mine') {
      const latest = await app.coach.getProgram(id);
      return save(latest.data.version);
    }
    if (choice === 'theirs') {
      const latest = await app.coach.getProgram(id);
      server = latest.data; prog = clone(server); baseVersion = server.version; dirty = false;
      app.coach.clearDraft(id);
      render();
    }
  }

  async function pickExercise() {
    return sheet({ title: 'Add exercise' }, (body, close) => {
      const draw = () => {
        body.innerHTML = String(html`${Object.entries(CATEGORIES).map(([cat, label]) => {
          const list = exercises.filter((e) => e.category === cat);
          return list.length ? html`<h3 style="margin:14px 0 8px">${label}</h3><div class="choices">${list.map((e) => html`<button class="choice-btn" data-pick="${e.id}">${e.name}${e.custom ? ' ★' : ''}<small>${e.description}</small></button>`)}</div>` : '';
        })}
        <details style="margin-top:18px"><summary style="cursor:pointer;font-weight:700">Exercise not listed? Add it to your library</summary>
          <div class="field" style="margin-top:10px"><label for="ne-name">Name</label><input id="ne-name" type="text" maxlength="80"></div>
          <div class="field"><label for="ne-cat">Category</label><select id="ne-cat">${Object.entries(CATEGORIES).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div>
          <div class="field"><label for="ne-desc">Short description</label><textarea id="ne-desc" rows="2"></textarea></div>
          <button class="btn" data-new-ex>Add to library</button></details>`);
        body.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => close(b.dataset.pick)));
        body.querySelector('[data-new-ex]').onclick = async () => {
          const name = body.querySelector('#ne-name').value.trim();
          if (!name) return;
          try {
            const ex = await app.coach.addExercise(name, body.querySelector('#ne-cat').value, body.querySelector('#ne-desc').value.trim());
            exercises = [...exercises, ex];
            close(ex.id);
          } catch (err) { toast(err.message, { kind: 'error' }); }
        };
      };
      draw();
    });
  }

  render();
  return () => { offs.forEach((f) => f()); clearTimeout(saveTimer); if (dirty) app.coach.saveDraft(id, prog, baseVersion); };
}

function nextWeekName(name, count) {
  const m = String(name || '').match(/^(.*?)(\d+)\s*$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `Week ${count + 1}`;
}

function askName() {
  return sheet({ title: 'New athlete' }, (body, close) => {
    body.innerHTML = '<div class="field"><label for="na">Name</label><input id="na" type="text" maxlength="80" autofocus></div><button class="btn btn-block" data-go>Add</button>';
    body.querySelector('[data-go]').onclick = () => close(body.querySelector('#na').value.trim() || null);
  });
}

// Compare only the editable content (server adds timestamps).
function strip(p) {
  return {
    name: p.name, client_id: p.client_id, status: p.status, notes: p.notes,
    blocks: (p.blocks || []).map((b) => ({ id: b.id, name: b.name, start_date: b.start_date, end_date: b.end_date, notes: b.notes,
      workouts: (b.workouts || []).map((w) => ({ id: w.id, name: w.name, scheduled_date: w.scheduled_date, notes: w.notes,
        prescriptions: (w.prescriptions || []).map((x) => ({ id: x.id, exercise_id: x.exercise_id, sets: x.sets, rest_seconds: x.rest_seconds, tempo: x.tempo, coach_notes: x.coach_notes, progression: x.progression })) })) })),
  };
}
