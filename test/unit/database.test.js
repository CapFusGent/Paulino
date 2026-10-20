// Database tests: the real migrations in PGlite, called exactly as PostgREST
// would (role switching + JWT claims). Covers access control, integrity and
// history preservation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { createDatabase } from '../../server/db.mjs';
import { novice5x5 } from '../../src/core/templates.js';

let db, paul, eve, client, otherClient;
const as = (session) => ({ sub: session.user.id, role: 'authenticated' });
const anon = { role: 'anon' };
const rejects = async (p, re) => { await assert.rejects(p, (e) => (re ? re.test(`${e.code} ${e.message}`) : true)); };
const now = () => new Date().toISOString();

before(async () => {
  db = await createDatabase();
  paul = await db.auth.signUp('paul@test.test', 'password-123');
  eve = await db.auth.signUp('eve@test.test', 'password-456');
  await db.rpc('coach_me', { p_display_name: 'Paul' }, as(paul));
  await db.rpc('coach_me', { p_display_name: 'Eve' }, as(eve));
  client = await db.rpc('coach_create_client', { p_display_name: 'Leo' }, as(paul));
  otherClient = await db.rpc('coach_create_client', { p_display_name: 'Mallory' }, as(eve));
});
after(() => db.close());

async function savedProgram(owner = paul, c = client, opts = {}) {
  const p = novice5x5({ start: '2026-01-05', weeks: 2, clientId: c.id, ...opts });
  p.status = 'active';
  const r = await db.rpc('coach_save_program', { p_program: p, p_expected_version: null }, as(owner));
  return { p, r };
}

test('coach creates, names, saves and edits a program (versioned)', async () => {
  const { p, r } = await savedProgram();
  assert.equal(r.version, 1);
  assert.equal(r.program.name, p.name);
  assert.equal(r.program.blocks.length, 2);
  const edited = structuredClone(r.program);
  edited.name = 'Leo: block 1';
  edited.blocks[0].workouts[0].prescriptions[0].sets[0].load.value = 65;
  const r2 = await db.rpc('coach_save_program', { p_program: edited, p_expected_version: 1 }, as(paul));
  assert.equal(r2.version, 2);
  assert.equal(r2.program.name, 'Leo: block 1');
  const revs = await db.rpc('coach_program_revisions', { p_program_id: p.id }, as(paul));
  assert.deepEqual(revs.map((x) => x.version), [2, 1]);
  // stale editor → conflict, nothing overwritten
  await rejects(db.rpc('coach_save_program', { p_program: { ...edited, name: 'stale' }, p_expected_version: 1 }, as(paul)), /version_conflict/);
  const cur = await db.rpc('coach_get_program', { p_program_id: p.id }, as(paul));
  assert.equal(cur.name, 'Leo: block 1');
});

test('duplicate creates an independent draft with new ids and shifted dates', async () => {
  const { p } = await savedProgram();
  const d = await db.rpc('coach_duplicate_program', { p_program_id: p.id, p_name: 'Copy', p_client_id: null, p_shift_days: 7 }, as(paul));
  assert.equal(d.status, 'draft');
  assert.notEqual(d.blocks[0].id, p.blocks[0].id);
  assert.equal(d.blocks[0].workouts[0].scheduled_date, '2026-01-12');
});

test('one active program per client: activating a new one archives the old', async () => {
  const c = await db.rpc('coach_create_client', { p_display_name: 'Ana' }, as(paul));
  const a = await savedProgram(paul, c);
  const b = await savedProgram(paul, c);
  const dash = await db.rpc('coach_dashboard', {}, as(paul));
  assert.equal(dash.programs.find((x) => x.id === a.p.id).status, 'archived');
  assert.equal(dash.programs.find((x) => x.id === b.p.id).status, 'active');
});

test('anon has no table access and cannot call coach functions', async () => {
  await rejects(db.rpc('coach_dashboard', {}, anon), /permission denied/);
  await rejects(db.rpc('coach_save_program', { p_program: novice5x5(), p_expected_version: null }, anon), /permission denied/);
  for (const t of ['programs', 'clients', 'workout_logs', 'prescriptions', 'deviations', 'profiles']) {
    await rejects(db.pg.transaction(async (tx) => { await tx.exec('set local role anon'); await tx.query(`select * from public.${t}`); }), /permission denied/);
  }
});

test('coaches are isolated from each other (RLS)', async () => {
  const { p } = await savedProgram();
  await rejects(db.rpc('coach_get_program', { p_program_id: p.id }, as(eve)), /not_found/);
  const dash = await db.rpc('coach_dashboard', {}, as(eve));
  assert.ok(!dash.programs.some((x) => x.id === p.id));
  assert.ok(!dash.clients.some((x) => x.id === client.id));
  assert.equal(await db.rpc('coach_delete_program', { p_program_id: p.id }, as(eve)), false);
  await rejects(db.rpc('coach_client_overview', { p_client_id: client.id }, as(eve)), /not_found/);
  await rejects(db.rpc('coach_rotate_client_link', { p_client_id: client.id }, as(eve)), /not_found/);
  // Eve cannot assign her program to Paul's client…
  const ep = novice5x5({ weeks: 1, clientId: client.id });
  await rejects(db.rpc('coach_save_program', { p_program: ep, p_expected_version: null }, as(eve)), /invalid_assignment/);
  // …nor hijack Paul's ids by re-using them in her own program.
  const hijack = novice5x5({ weeks: 1 });
  hijack.blocks[0].id = p.blocks[0].id;
  await rejects(db.rpc('coach_save_program', { p_program: hijack, p_expected_version: null }, as(eve)));
  const still = await db.rpc('coach_get_program', { p_program_id: p.id }, as(paul));
  assert.equal(still.blocks[0].id, p.blocks[0].id);
  // direct table access is filtered too
  const rows = await db.pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(as(eve))]);
    await tx.exec('set local role authenticated');
    return (await tx.query('select id from public.programs')).rows;
  });
  assert.ok(!rows.some((r) => r.id === p.id));
});

test('database rejects invalid training data', async () => {
  const bad = (mut) => { const p = novice5x5({ weeks: 1 }); mut(p); return db.rpc('coach_save_program', { p_program: p, p_expected_version: null }, as(paul)); };
  await rejects(bad((p) => { p.blocks[0].workouts[0].prescriptions[0].sets[0].reps = 0; }), /valid_sets|check/);
  await rejects(bad((p) => { p.blocks[0].workouts[0].prescriptions[0].sets[0].load.value = -1; }), /valid_sets|check/);
  await rejects(bad((p) => { p.blocks[0].workouts[0].prescriptions[0].sets = []; }), /valid_sets|check/);
  await rejects(bad((p) => { p.blocks[0].workouts[0].prescriptions[0].exercise_id = 'leg-press'; }), /unknown_exercise|foreign key/);
  await rejects(bad((p) => { p.blocks[0].end_date = '2000-01-01'; }), /check/);
  await rejects(bad((p) => { p.blocks[0].workouts[0].scheduled_date = '2026-02-31'; }), /date/);
  await rejects(bad((p) => { p.name = ''; }), /check|null/);
  await rejects(bad((p) => { p.blocks[0].workouts[0].prescriptions[0].progression = { type: 'linear', increment_kg: -2 }; }), /valid_progression|check/);
});

test('client link: sees only their own program; bad or rotated links fail', async () => {
  const { p } = await savedProgram();
  const b = await db.rpc('client_get_bundle', { p_token: client.access_token }, anon);
  assert.equal(b.client.display_name, 'Leo');
  assert.equal(b.program.id, p.id);
  assert.ok(!('access_token' in b.client));
  await rejects(db.rpc('client_get_bundle', { p_token: 'x'.repeat(64) }, anon), /invalid_link/);
  await rejects(db.rpc('client_get_bundle', { p_token: client.access_token.replace(/.$/, (c) => (c === '0' ? '1' : '0')) }, anon), /invalid_link/);
  const c2 = await db.rpc('coach_create_client', { p_display_name: 'Temp' }, as(paul));
  const rotated = await db.rpc('coach_rotate_client_link', { p_client_id: c2.id }, as(paul));
  await rejects(db.rpc('client_get_bundle', { p_token: c2.access_token }, anon), /invalid_link/);
  assert.ok(await db.rpc('client_get_bundle', { p_token: rotated.access_token }, anon));
});

test('client logs a workout; cannot write into another athlete’s program', async () => {
  const { p } = await savedProgram();
  const w = p.blocks[0].workouts[0];
  const x = w.prescriptions[0];
  const log = {
    id: uuid(), workout_id: w.id, status: 'completed', started_at: now(), completed_at: now(), client_updated_at: now(),
    sets: x.sets.map((s, i) => ({ prescription_id: x.id, exercise_id: x.exercise_id, exercise_position: 0, set_index: i, target: { reps: 5, kg: 60 }, actual_reps: i === 4 ? 4 : 5, actual_load_kg: 60, completed: true })),
  };
  const res = await db.rpc('client_sync', { p_token: client.access_token, p_logs: [log], p_deviations: [] }, anon);
  assert.equal(res.logs[0].result, 'accepted');
  assert.equal(res.logs[0].server.sets.length, 5);
  assert.equal(res.logs[0].server.sets[4].actual_reps, 4);
  // Mallory (Eve's athlete) tries to log into Leo's workout
  const evil = await db.rpc('client_sync', { p_token: otherClient.access_token, p_logs: [{ ...log, id: uuid() }], p_deviations: [] }, anon);
  assert.equal(evil.logs[0].result, 'rejected');
  // …or overwrite Leo's log by guessing its id
  const evil2 = await db.rpc('client_sync', { p_token: otherClient.access_token, p_logs: [{ ...log, client_updated_at: new Date(Date.now() + 60_000).toISOString() }], p_deviations: [] }, anon);
  assert.equal(evil2.logs[0].result, 'rejected');
  // Paul sees it read-only
  const ov = await db.rpc('coach_client_overview', { p_client_id: client.id }, as(paul));
  assert.ok(ov.logs.some((l) => l.id === log.id));
  // negative values are refused by the DB
  await rejects(db.rpc('client_sync', { p_token: client.access_token, p_logs: [{ ...log, client_updated_at: new Date(Date.now() + 120_000).toISOString(), sets: [{ ...log.sets[0], actual_load_kg: -5 }] }], p_deviations: [] }, anon), /check/);
});

test('newest write wins; an older device copy is returned as stale, not applied', async () => {
  const { p } = await savedProgram();
  const w = p.blocks[0].workouts[1];
  const t1 = new Date(Date.now() - 60_000).toISOString();
  const t2 = now();
  const base = { workout_id: w.id, status: 'in_progress', sets: [] };
  const a = await db.rpc('client_sync', { p_token: client.access_token, p_logs: [{ ...base, id: uuid(), notes: 'device B (newer)', client_updated_at: t2 }], p_deviations: [] }, anon);
  assert.equal(a.logs[0].result, 'accepted');
  const b = await db.rpc('client_sync', { p_token: client.access_token, p_logs: [{ ...base, id: uuid(), notes: 'device A (older, offline)', client_updated_at: t1 }], p_deviations: [] }, anon);
  assert.equal(b.logs[0].result, 'stale');
  assert.equal(b.logs[0].server.notes, 'device B (newer)');
  // idempotent re-send of the same accepted write
  const again = await db.rpc('client_sync', { p_token: client.access_token, p_logs: [{ ...base, id: a.logs[0].server.id, notes: 'device B (newer)', client_updated_at: t2 }], p_deviations: [] }, anon);
  assert.equal(again.logs[0].result, 'stale');
});

test('deviation: server stores Paul’s original, restore keeps history', async () => {
  const { p } = await savedProgram();
  const w = p.blocks[0].workouts[0];
  const x = w.prescriptions[1];
  const dev = { id: uuid(), workout_id: w.id, prescription_id: x.id, modification_type: 'change_sets', reason: 'preference', client_updated_at: now(),
    original: { forged: true }, // must be ignored
    modified: { exercise_id: x.exercise_id, sets: x.sets.slice(0, 3), removed: false } };
  const r = await db.rpc('client_sync', { p_token: client.access_token, p_logs: [], p_deviations: [dev] }, anon);
  assert.equal(r.deviations[0].result, 'accepted');
  assert.equal(r.deviations[0].server.original.id, x.id, 'original comes from the server');
  assert.equal(r.deviations[0].server.original.sets.length, 5);
  // prescription itself untouched
  const prog = await db.rpc('coach_get_program', { p_program_id: p.id }, as(paul));
  assert.equal(prog.blocks[0].workouts[0].prescriptions[1].sets.length, 5);
  // restore
  const back = await db.rpc('client_sync', { p_token: client.access_token, p_logs: [], p_deviations: [{ ...dev, status: 'reverted', client_updated_at: new Date(Date.now() + 1000).toISOString() }] }, anon);
  assert.equal(back.deviations[0].server.status, 'reverted');
  const ov = await db.rpc('coach_client_overview', { p_client_id: client.id }, as(paul));
  assert.ok(ov.deviations.some((d) => d.id === dev.id && d.status === 'reverted'), 'kept for Paul to see');
  // invalid modification rejected
  const bad = await db.rpc('client_sync', { p_token: client.access_token, p_logs: [], p_deviations: [{ ...dev, id: uuid(), modified: { exercise_id: 'leg-press', sets: x.sets } }] }, anon);
  assert.equal(bad.deviations[0].result, 'rejected');
});

test('history survives program edits and deletions', async () => {
  const { p, r } = await savedProgram();
  const w = p.blocks[0].workouts[0];
  const x = w.prescriptions[0];
  await db.rpc('client_sync', { p_token: client.access_token, p_deviations: [], p_logs: [{
    id: uuid(), workout_id: w.id, status: 'completed', completed_at: now(), client_updated_at: now(),
    sets: [{ prescription_id: x.id, exercise_id: 'squat', exercise_position: 0, set_index: 0, target: { reps: 5, kg: 60 }, actual_reps: 5, actual_load_kg: 60, completed: true }] }] }, anon);
  // Paul edits the logged workout's prescription and then deletes the workout
  const edited = structuredClone(r.program);
  edited.blocks[0].workouts[0].prescriptions[0].sets = [{ reps: 1, reps_max: null, load: { kind: 'kg', value: 200 }, rpe: null, rir: null }];
  const r2 = await db.rpc('coach_save_program', { p_program: edited, p_expected_version: 1 }, as(paul));
  edited.blocks[0].workouts.shift();
  await db.rpc('coach_save_program', { p_program: edited, p_expected_version: r2.version }, as(paul));
  const ov = await db.rpc('coach_client_overview', { p_client_id: client.id }, as(paul));
  const log = ov.logs.find((l) => l.workout_snapshot?.id === w.id);
  assert.ok(log, 'log still there');
  assert.equal(log.workout_id, null, 'workout gone, log kept');
  assert.equal(log.workout_snapshot.prescriptions[0].sets.length, 5, 'snapshot shows what was prescribed at the time');
  assert.equal(log.sets[0].actual_load_kg, 60);
});
