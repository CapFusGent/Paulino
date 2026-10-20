// Local demo data so the app has something to show on first run.
// Credentials below exist ONLY in the local PGlite database (never Supabase).
import { novice5x5 } from '../src/core/templates.js';
import { addDays, weekStart, isoDate } from '../src/core/util.js';

export const DEV_COACH = { email: 'paul@paulino.test', password: 'paulino-dev-1234', name: 'Paul' };

export async function seedDemo(db, { quiet = false } = {}) {
  const exists = await db.admin('select id from auth.users where email = $1', [DEV_COACH.email]);
  if (exists.rows.length) {
    if (!quiet) await printLinks(db, exists.rows[0].id);
    return;
  }
  const s = await db.auth.signUp(DEV_COACH.email, DEV_COACH.password);
  const claims = { sub: s.user.id, role: 'authenticated' };
  await db.rpc('coach_me', { p_display_name: DEV_COACH.name }, claims);
  const client = await db.rpc('coach_create_client', { p_display_name: 'Demo Athlete' }, claims);
  // Started two weeks ago so there is a current week, history and an upcoming session.
  const start = addDays(weekStart(isoDate()), -14);
  const program = novice5x5({ start, clientId: client.id });
  program.status = 'active';
  await db.rpc('coach_save_program', { p_program: program, p_expected_version: null }, claims);
  if (!quiet) await printLinks(db, s.user.id);
}

async function printLinks(db, coachId) {
  const r = await db.admin('select display_name, access_token from public.clients where coach_id = $1', [coachId]);
  console.log(`\n  Coach login   ${DEV_COACH.email} / ${DEV_COACH.password}`);
  for (const c of r.rows) console.log(`  Athlete link  ${c.display_name}: http://localhost:${process.env.PORT || 5173}/#/a/${c.access_token}`);
  console.log('');
}
