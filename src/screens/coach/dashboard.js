// Coach home: sign-in, then programs + clients at a glance.
import { html, raw, on, sheet, toast, confirmSheet } from '../../ui/dom.js';
import { mascot } from '../../ui/paulino.js';
import { topBar, ICONS } from '../../ui/layout.js';
import { novice5x5, emptyProgram } from '../../core/templates.js';
import { formatDate } from '../../core/util.js';
import { paletteCard, bindPalette } from '../athlete/settings.js';
import { shareSheet } from './share.js';

export default async function dashboard(root, _p, app) {
  if (!app.coach.signedIn) return login(root, app);
  root.innerHTML = String(html`<div class="page no-nav">${topBar({ title: 'Coach' })}<div class="card"><p>Loading…</p></div></div>`);
  let res;
  try {
    res = await app.coach.dashboard();
  } catch (e) {
    if (e.status === 401 || e.code === 'not_authenticated') { await app.api.signOut(); return login(root, app); }
    root.innerHTML = String(html`<div class="page no-nav">${topBar({ title: 'Coach' })}<div class="card error-card"><p>${e.message}</p><button class="btn" data-retry>Retry</button></div></div>`);
    root.querySelector('[data-retry]').onclick = () => app.refresh();
    return;
  }
  const d = res.data;
  const name = d.profile?.display_name || 'Paul';
  const clientName = (id) => d.clients.find((c) => c.id === id)?.display_name;
  const STATUS = { draft: 'chip', active: 'chip chip-ok', archived: 'chip' };

  root.innerHTML = String(html`<div class="page no-nav wide stack">
    ${topBar({ right: '<button class="btn btn-sm btn-ghost" data-signout>Sign out</button>' })}
    <section class="hero"><span class="scrap scrap-1" aria-hidden="true"></span><h1>Hi <span class="hero-name">${name}</span>!</h1>
      <p class="muted" style="position:relative">${d.programs.length} programs · ${d.clients.filter((c) => !c.archived).length} athletes</p></section>
    ${res.offline ? html`<p class="notice">Offline: showing the last copy. Saving needs a connection.</p>` : ''}
    <div class="card">${raw(mascot({ mood: 'motivational', text: 'Who are we making stronger today?', size: 'sm' }))}</div>

    <div class="section-title"><h2>Programs</h2></div>
    <button class="btn btn-block btn-lg" data-new>${raw(ICONS.plus)} New program</button>
    <div class="stack-sm" style="margin-top:14px">
      ${d.programs.length ? d.programs.map((p) => html`<div class="card list-card" data-program="${p.id}">
        <a class="grow" href="#/coach/p/${p.id}" style="text-decoration:none;color:inherit">
          <h3>${p.name}</h3>
          <p><span class="${STATUS[p.status]}">${p.status}</span> ${clientName(p.client_id) ? html`· for <b>${clientName(p.client_id)}</b>` : '· not assigned'}
          ${p.first_date ? html` · ${formatDate(p.first_date, { weekday: false })} – ${formatDate(p.last_date, { weekday: false })}` : ''} · ${p.workout_count} workouts · v${p.version}</p></a>
        <div class="tools">
          <button class="icon-btn sq" data-dup="${p.id}" aria-label="Duplicate ${p.name}">${raw(ICONS.dup)}</button>
          <button class="icon-btn sq" data-del="${p.id}" aria-label="Delete ${p.name}">${raw(ICONS.trash)}</button>
        </div></div>`) : html`<p class="muted">No programs yet. Make the first one!</p>`}
    </div>

    <div class="section-title"><h2>Athletes</h2></div>
    <button class="btn btn-block btn-ghost" data-add-client>${raw(ICONS.plus)} Add athlete</button>
    <div class="stack-sm" style="margin-top:14px">
      ${d.clients.map((c) => html`<a class="card list-card" href="#/coach/c/${c.id}" data-client="${c.id}">
        <span class="choice-icon" aria-hidden="true">${c.display_name.slice(0, 1).toUpperCase()}</span>
        <span class="grow"><h3>${c.display_name} ${c.archived ? html`<span class="chip">archived</span>` : ''}</h3>
          <p>${c.active_program_id ? `Program: ${d.programs.find((p) => p.id === c.active_program_id)?.name || ''}` : 'No active program'} · ${c.completed_workouts} done${c.last_activity ? ` · last ${formatDate(c.last_activity.slice(0, 10), { weekday: false })}` : ''}</p></span>
        ${c.active_deviations ? html`<span class="chip chip-dev" title="Changes by the athlete">${c.active_deviations} changed</span>` : ''}
      </a>`)}
    </div>
    <div style="margin-top:22px">${paletteCard()}</div>
  </div>`);

  const offs = [bindPalette(root, app)];
  offs.push(on(root, 'click', '[data-signout]', async () => { await app.api.signOut(); app.refresh(); }));
  offs.push(on(root, 'click', '[data-new]', () => newProgram(app, d)));
  offs.push(on(root, 'click', '[data-add-client]', () => addClient(app)));
  offs.push(on(root, 'click', '[data-dup]', async (e, el) => {
    const p = d.programs.find((x) => x.id === el.dataset.dup);
    const r = await sheet({ title: 'Duplicate program' }, (body, close) => {
      body.innerHTML = String(html`<div class="field"><label for="d-name">New name</label><input id="d-name" type="text" value="${p.name} (copy)" maxlength="120"></div>
        <div class="field"><label for="d-client">Assign to</label><select id="d-client"><option value="">Nobody yet</option>${d.clients.filter((c) => !c.archived).map((c) => html`<option value="${c.id}" ${c.id === p.client_id ? raw('selected') : ''}>${c.display_name}</option>`)}</select></div>
        <div class="field"><label for="d-shift">Move all dates by (days)</label><input id="d-shift" type="number" inputmode="numeric" value="0" step="1"></div>
        <button class="btn btn-block" data-go>Duplicate</button>`);
      body.querySelector('[data-go]').onclick = () => close({ name: body.querySelector('#d-name').value.trim(), client: body.querySelector('#d-client').value || null, shift: Number(body.querySelector('#d-shift').value) || 0 });
    });
    if (!r) return;
    try {
      const np = await app.coach.duplicateProgram(p.id, r.name, r.client, r.shift);
      toast('Duplicated. It starts as a draft.', { kind: 'ok' });
      app.navigate(`/coach/p/${np.id}`);
    } catch (err) { toast(err.message, { kind: 'error' }); }
  }));
  offs.push(on(root, 'click', '[data-del]', async (e, el) => {
    const p = d.programs.find((x) => x.id === el.dataset.del);
    const ok = await confirmSheet({ title: 'Delete program?', text: `"${p.name}" will be deleted. Workouts your athlete already logged stay in their history.`, ok: 'Delete', danger: true });
    if (!ok) return;
    try { await app.coach.deleteProgram(p.id); toast('Deleted.'); app.refresh(); } catch (err) { toast(err.message, { kind: 'error' }); }
  }));
  return () => offs.forEach((f) => f());
}

async function newProgram(app, d) {
  const r = await sheet({ title: 'New program' }, (body, close) => {
    body.innerHTML = String(html`<div class="field"><label for="n-name">Program name</label><input id="n-name" type="text" maxlength="120" placeholder="e.g. Leo: block 1" autofocus></div>
      <div class="field"><label for="n-client">Athlete</label><select id="n-client"><option value="">Choose later</option>${d.clients.filter((c) => !c.archived).map((c) => html`<option value="${c.id}">${c.display_name}</option>`)}</select></div>
      <fieldset style="border:0;padding:0;margin:0 0 14px"><legend class="label">Start from</legend><div class="choices">
        <button type="button" class="choice-btn" data-tpl="empty" aria-pressed="true">Blank program<small>One empty week to fill in</small></button>
        <button type="button" class="choice-btn" data-tpl="5x5" aria-pressed="false">Paul's beginner 5×5<small>12 weeks, Mon/Wed/Fri, days A/B alternating, +2.5 kg after clean sessions</small></button>
      </div></fieldset>
      <p class="field-error" data-err hidden></p>
      <button class="btn btn-block btn-lg" data-go>Create</button>`);
    let tpl = 'empty';
    body.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => { tpl = b.dataset.tpl; body.querySelectorAll('[data-tpl]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
    body.querySelector('[data-go]').onclick = () => {
      const name = body.querySelector('#n-name').value.trim();
      if (!name) { const e = body.querySelector('[data-err]'); e.textContent = 'Give the program a name.'; e.hidden = false; return; }
      close({ name, client: body.querySelector('#n-client').value || null, tpl });
    };
  });
  if (!r) return;
  const program = r.tpl === '5x5' ? novice5x5({ name: r.name, clientId: r.client }) : emptyProgram(r.name);
  program.client_id = r.client;
  app.coach.saveDraft(program.id, program, null);
  app.navigate(`/coach/p/${program.id}`);
}

async function addClient(app) {
  const name = await sheet({ title: 'Add athlete' }, (body, close) => {
    body.innerHTML = String(html`<div class="field"><label for="c-name">Name</label><input id="c-name" type="text" maxlength="80" autofocus></div><button class="btn btn-block" data-go>Add & get link</button>`);
    const go = () => { const v = body.querySelector('#c-name').value.trim(); if (v) close(v); };
    body.querySelector('[data-go]').onclick = go;
    body.querySelector('#c-name').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
  if (!name) return;
  try {
    const c = await app.coach.createClient(name);
    await shareSheet(c);
    app.refresh();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

function login(root, app) {
  let mode = 'in';
  const draw = () => {
    root.innerHTML = String(html`<div class="page no-nav stack">
      ${topBar({ title: 'Coach sign-in', back: '/' })}
      <div class="card">${raw(mascot({ mood: 'focused', text: 'Coaches only, champ!', size: 'sm' }))}</div>
      ${!app.api.configured ? html`<p class="notice">The backend is not configured yet. See README → "Supabase setup".</p>` : ''}
      <form class="card" data-form novalidate>
        <h2>${mode === 'in' ? 'Sign in' : 'Create coach account'}</h2>
        <div class="field"><label for="l-email">Email</label><input id="l-email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="l-pw">Password</label><input id="l-pw" type="password" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" minlength="8" required></div>
        <p class="field-error" data-err hidden></p>
        <button class="btn btn-block btn-lg" type="submit">${mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <p class="center small" style="margin:12px 0 0"><button type="button" class="link-btn" data-mode>${mode === 'in' ? 'First time? Create the coach account' : 'I already have an account'}</button></p>
      </form>
      <p class="small muted">Athletes don't need an account: they use the personal link from Paul.</p>
    </div>`);
    root.querySelector('[data-mode]').onclick = () => { mode = mode === 'in' ? 'up' : 'in'; draw(); };
    root.querySelector('[data-form]').onsubmit = async (e) => {
      e.preventDefault();
      const email = root.querySelector('#l-email').value.trim();
      const pw = root.querySelector('#l-pw').value;
      const err = root.querySelector('[data-err]');
      const btn = root.querySelector('[type=submit]');
      err.hidden = true;
      btn.disabled = true;
      try {
        if (mode === 'in') await app.api.signIn(email, pw);
        else {
          const r = await app.api.signUp(email, pw);
          if (r.needsConfirmation) { err.textContent = 'Check your email to confirm the account, then sign in.'; err.hidden = false; btn.disabled = false; mode = 'in'; return; }
        }
        await app.api.rpcCoach('coach_me', {});
        app.refresh();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
      }
    };
  };
  draw();
}
