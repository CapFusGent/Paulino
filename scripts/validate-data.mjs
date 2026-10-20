// Content & configuration validation. Exit code 1 on any failure.
//   npm run validate
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISES, GENERAL_TIPS } from '../src/data/exercises.js';
import { LINES, STATES, SAFETY } from '../src/data/messages.js';
import { validateExerciseLibrary, validateProgram } from '../src/core/validation.js';
import { novice5x5, emptyProgram } from '../src/core/templates.js';
import { MOODS } from '../src/ui/paulino-art.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const section = (name, fn) => { const before = failures.length; fn(); console.log(`${failures.length === before ? '✔' : '✖'} ${name}`); };

section('exercise library', () => {
  for (const e of validateExerciseLibrary(EXERCISES)) check(false, e);
  for (const t of GENERAL_TIPS) check(t.text.length <= 140, `general tip too long: ${t.text}`);
  // Never claim a cue guarantees safety.
  const all = JSON.stringify(EXERCISES) + JSON.stringify(GENERAL_TIPS) + JSON.stringify(LINES);
  check(!/guarantee|never get injured|injury[- ]proof|100% safe/i.test(all), 'content must not promise injury prevention');
});

section('generated exercise SQL is in sync', () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261020120100_exercise_library.sql'), 'utf8');
  for (const e of EXERCISES) {
    check(sql.includes(`'${e.id}'`), `exercise ${e.id} missing from SQL: run node scripts/gen-exercise-sql.mjs`);
    check(sql.includes(JSON.stringify(e.tips).replace(/'/g, "''")), `tips for ${e.id} out of date in SQL: run node scripts/gen-exercise-sql.mjs`);
  }
});

section('templates', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const [name, p] of [['novice5x5', novice5x5()], ['empty', emptyProgram('Test')]]) {
    const { errors } = validateProgram(p, { exerciseIds: ids });
    for (const e of errors) check(false, `${name}: ${e.message}`);
  }
});

section('Paulino lines', () => {
  check(STATES.length >= 5, 'need at least five emotional states');
  for (const s of STATES) {
    check(MOODS.includes(s), `no artwork for state ${s}`);
    const lines = Object.values(LINES[s] || {}).flat();
    check(lines.length >= 4, `state ${s} needs at least 4 lines`);
    for (const l of lines) check(l.length <= 60, `line too long for a bubble (${l.length}): ${l}`);
    const dup = lines.filter((l, i) => lines.indexOf(l) !== i);
    check(dup.length === 0, `duplicate lines in ${s}: ${dup.join(', ')}`);
  }
  // Disappointment never appears in safety contexts.
  for (const ctx of ['pain', 'fatigue', 'skip']) check(!LINES.disappointed[ctx], `disappointed must not have a "${ctx}" context`);
  check(/stop/i.test(SAFETY.painStop) && /professional|doctor|physio/i.test(SAFETY.painContact), 'pain copy must say stop + seek assessment');
});

// ---- WCAG contrast for every palette -------------------------------------
const lum = (hex) => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

section('palette contrast ≥ 4.5:1 for text', () => {
  const css = readFileSync(join(ROOT, 'styles/app.css'), 'utf8');
  const root = Object.fromEntries([...css.matchAll(/--(ink|ink-2|white):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
  const blocks = [...css.matchAll(/\[data-palette="(\w+)"\]\s*\{([^}]+)\}/g)];
  check(blocks.length === 4, `expected 4 palettes, found ${blocks.length}`);
  const expected = { original: ['#F5EFE3', '#F4B942'], pink: ['#F7D6E5', '#EF6497'], teal: ['#D5F0EA', '#169E96'], blue: ['#DCE9FA', '#285BC7'] };
  for (const [, name, body] of blocks) {
    const t = Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
    check(t.bg?.toUpperCase() === expected[name][0] && t.accent?.toUpperCase() === expected[name][1], `${name}: background/accent must be ${expected[name].join(' / ')}`);
    const pairs = [
      ['ink', root.ink, 'bg', t.bg], ['ink', root.ink, 'paper', t.paper], ['ink', root.ink, 'paper-2', t['paper-2']],
      ['ink-2', root['ink-2'], 'bg', t.bg], ['ink-2', root['ink-2'], 'paper', t.paper],
      ['accent-ink', t['accent-ink'], 'accent', t.accent], ['ink', root.ink, 'accent-soft', t['accent-soft']],
      ['accent-strong', t['accent-strong'], 'accent-soft', t['accent-soft']], ['accent-strong', t['accent-strong'], 'paper', t.paper],
    ];
    for (const [fn, f, bn, b] of pairs) {
      const c = contrast(f, b);
      check(c >= 4.5, `${name}: ${fn} on ${bn} is ${c.toFixed(2)}:1 (< 4.5)`);
    }
  }
});

// ---- PWA -----------------------------------------------------------------
section('service worker caches the whole app shell', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  check(/const VERSION = 'paulino-v[\d.]+'/.test(sw), 'sw.js needs a versioned cache name');
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    check(sw.includes(`'${rel}'`), `sw.js SHELL is missing ${rel}`);
  }
  for (const m of sw.matchAll(/^\s+'([^']+\.(?:js|css|png|svg|webmanifest|html))',$/gm)) check(existsSync(join(ROOT, m[1])), `sw.js lists missing file ${m[1]}`);
});

section('manifest & icons', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check(m.name && m.short_name && m.start_url && m.display === 'standalone', 'manifest needs name, short_name, start_url, display');
  for (const size of ['32x32', '180x180', '192x192', '512x512']) check(m.icons.some((i) => i.sizes === size), `manifest missing ${size} icon`);
  check(m.icons.some((i) => i.purpose === 'maskable'), 'manifest needs a maskable icon');
  for (const i of m.icons) check(existsSync(join(ROOT, i.src)), `icon file missing: ${i.src}`);
});

section('no secrets in the deployable config', () => {
  const cfg = readFileSync(join(ROOT, 'config.js'), 'utf8');
  check(!/service_role|sb_secret_/i.test(cfg), 'config.js must never contain a service-role / secret key');
});

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll content checks passed.');
