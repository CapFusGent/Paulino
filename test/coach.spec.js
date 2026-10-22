// Separate coach / athlete entry routes, persistent navigation, unsaved-changes
// guard, Paul's own exercises (editor, Academy, programs, sharing) and palettes.
import { test, expect, open, noHScroll, settle, seedPaulProgram } from './helpers.js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('test-results/files', { recursive: true });
// a real (tiny) PNG, so the in-browser resize step actually decodes an image
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAAP//AwBn/wIEpJ4IGgAAAABJRU5ErkJggg==', 'base64');
const photo = (n) => ({ name: `step${n}.png`, mimeType: 'image/png', buffer: PNG });

async function addPhoto(page, stepIndex) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator(`.step-ed[data-si="${stepIndex}"]`).getByRole('button', { name: 'Add a photo for this step' }).click(),
  ]);
  await chooser.setFiles(photo(stepIndex + 1));
  await expect(page.locator(`.step-ed[data-si="${stepIndex}"] .ph-thumb img`).first()).toBeVisible();
}

/** Paul builds "Romanian deadlift" with five steps and five photos through the UI; returns its id. */
async function createFiveStepExercise(page) {
  await open(page, '#/coach');
  await page.getByRole('link', { name: /Manage Exercises/ }).click();
  await page.getByRole('link', { name: /Add an exercise/ }).click();
  await page.getByLabel('Exercise name').fill('Romanian deadlift');
  await page.getByLabel('Category (optional)').selectOption('deadlift');
  await page.getByLabel('Short description').fill('A hip hinge with straight-ish legs for the hamstrings.');
  await page.getByLabel('How to do it').fill('Stand tall with the bar.\nPush the hips back and slide the bar down the thighs.');
  await page.getByLabel('Coaching notes (optional)').fill('Stop when the hamstrings stop you.');
  await page.getByLabel('Number of steps').fill('5');
  await page.getByLabel('Number of steps').dispatchEvent('change');
  await expect(page.locator('.step-ed')).toHaveCount(5);
  const titles = ['Stand tall', 'Soft knees', 'Hips back', 'Bar on the thighs', 'Stand up'];
  for (let i = 0; i < 5; i++) {
    await page.locator(`#st-t-${i}`).fill(titles[i]);
    await page.locator(`#st-b-${i}`).fill(`Explanation for ${titles[i].toLowerCase()}.`);
    await addPhoto(page, i);
  }
  await page.locator('#st-c-2').fill('Push the hips back!');
  await page.locator('#st-w-3').fill('Rounding the lower back.');
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByText(/Exercise saved/)).toBeVisible();
  await expect(page).toHaveURL(/#\/paul\/exercises\/cx_[0-9a-f]+$/);
  return page.url().match(/(cx_[0-9a-f]+)$/)[1];
}

test('separate entry routes: athlete at /, coach at /coach, no role choice, no "Meet Paulino"', async ({ page }) => {
  await open(page, '#/');
  await expect(page.locator('[data-nav="athlete"] .nav-item')).toHaveText(['Home', 'My Program', 'Academy', 'History']);
  await expect(page.getByText(/I'M AN|I'M PAUL/)).toHaveCount(0);
  await open(page, '#/coach');
  await expect(page.getByRole('heading', { name: "Paul's desk" })).toBeVisible();
  await expect(page.locator('[data-nav="coach"] .nav-item')).toHaveText(['Home', 'Programs', 'Exercises']);
  for (const t of ['Create Program', 'Saved Programs', 'Manage Exercises']) await expect(page.getByRole('heading', { name: t })).toBeVisible();
  await expect(page.getByText(/not a login/)).toBeVisible();
  // no pep talk on the coach home
  await expect(page.locator('.coach-home .bubble')).toHaveCount(0);
  for (const hash of ['#/', '#/coach', '#/settings', '#/academy', '#/paul/library']) {
    await open(page, hash);
    await expect(page.getByText('Meet Paulino')).toHaveCount(0);
  }
  // old addresses still land somewhere sensible
  await open(page, '#/paul'); await expect(page).toHaveURL(/#\/coach$/);
  await open(page, '#/athlete'); await expect(page).toHaveURL(/#\/$/);
});

test('bottom navigation works from every main section, including editor, lesson and workout', async ({ page }) => {
  await open(page);
  const pid = await seedPaulProgram(page, { name: 'Nav block' });
  const url = await page.evaluate(async (id) => (await window.Paulino.share.makeLink(await window.Paulino.store.get('paul', id))).url, pid);
  await page.goto(url);
  await page.getByRole('button', { name: 'Save & start training' }).click();
  await expect(page.getByRole('heading', { name: /Hey Marco/ })).toBeVisible();
  const prog = await page.evaluate(async () => (await window.Paulino.store.all('athlete'))[0]);

  const athlete = [['My Program', /#\/a\/program$/], ['Academy', /#\/academy$/], ['History', /#\/a\/history$/], ['Home', /#\/$/]];
  for (const start of ['#/', '#/a/program', '#/academy', '#/academy/squat', `#/a/p/${prog.id}/d/${prog.weeks[0].days[0].id}`, '#/a/history', '#/settings']) {
    for (const [label, re] of athlete) {
      await open(page, start);
      const item = page.locator('.bottom-nav').getByRole('link', { name: label });
      await expect(item).toBeVisible();
      await item.click();
      await expect(page).toHaveURL(re);
      await expect(page.locator('.bottom-nav').getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    }
  }
  const coach = [['Programs', /#\/paul\/library$/], ['Exercises', /#\/paul\/exercises$/], ['Home', /#\/coach$/]];
  for (const start of ['#/coach', '#/paul/library', `#/paul/p/${pid}`, '#/paul/exercises']) {
    for (const [label, re] of coach) {
      await open(page, start);
      await page.locator('.bottom-nav').getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(re);
    }
  }
  // the bar never covers the last control on a page with a form, and browser Back still works
  await open(page, `#/paul/p/${pid}`);
  await page.locator('.bottom-nav').getByRole('link', { name: 'Exercises' }).click();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#/paul/p/${pid}`));
  await open(page, '#/paul/exercises/new');
  const save = page.getByRole('button', { name: 'Save exercise' });
  await save.scrollIntoViewIfNeeded();
  const [b, n] = [await save.boundingBox(), await page.locator('.bottom-nav').boundingBox()];
  expect(b.y + b.height).toBeLessThanOrEqual(n.y);
  // print view has no bar
  await open(page, `#/paul/p/${pid}/print`);
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
});

test('leaving with unsaved changes asks first (nav, back button, link)', async ({ page }) => {
  await open(page, '#/coach');
  await page.getByRole('link', { name: /Manage Exercises/ }).click();
  await page.getByRole('link', { name: /Add an exercise/ }).click();
  await page.getByLabel('Exercise name').fill('Half-finished');
  // bottom bar → stay
  await page.locator('.bottom-nav').getByRole('link', { name: 'Programs' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay here' }).click();
  await settle(page);
  await expect(page).toHaveURL(/exercises\/new$/);
  await expect(page.getByLabel('Exercise name')).toHaveValue('Half-finished');
  // browser Back → stay
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay here' }).click();
  await settle(page);
  await expect(page).toHaveURL(/exercises\/new$/);
  await expect(page.getByLabel('Exercise name')).toHaveValue('Half-finished');
  // back arrow → leave
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/#\/paul\/exercises$/);
  // after saving, nothing asks
  await page.getByRole('link', { name: /Add an exercise/ }).click();
  await page.getByLabel('Exercise name').fill('Saved one');
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByText(/Exercise saved/)).toBeVisible();
  await page.locator('.bottom-nav').getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL(/#\/coach$/);
});

test('Paul creates a five-step exercise with five photos; it becomes a lesson and a program exercise', async ({ page }) => {
  const id = await createFiveStepExercise(page);
  await noHScroll(page);
  // preview before athletes see it
  await page.getByRole('button', { name: 'Preview lesson' }).click();
  const pv = page.getByRole('dialog', { name: 'Lesson preview' });
  await expect(pv.locator('.lesson-step[data-step]:not([data-step="0"]):not(.lesson-recap):not(.lesson-mistakes)')).toHaveCount(5);
  await pv.getByRole('button', { name: 'Close preview' }).click();
  await expect(pv).toHaveCount(0);

  // Academy
  await page.locator('.bottom-nav').getByRole('link', { name: 'Home' }).click();
  await open(page, '#/academy');
  const link = page.locator(`[data-lesson-link="${id}"]`);
  await expect(link).toContainText('Romanian deadlift');
  await expect(link).toContainText("Paul's exercise");
  await link.click();
  await expect(page.locator('.lesson-title')).toHaveText('Romanian deadlift');
  await expect(page.locator('.photo-set img')).toHaveCount(5);
  expect(await page.locator('.photo-set img').evaluateAll((els) => els.every((i) => i.src.startsWith('data:image/')))).toBe(true);
  await expect(page.locator('.lesson-howto')).toContainText('Push the hips back and slide the bar');
  await expect(page.locator('.lesson-howto .pref-note')).toContainText('Stop when the hamstrings stop you.');
  await expect(page.locator('.warn-note')).toContainText('Rounding the lower back.');
  await expect(page.locator('.lesson-mistakes')).toContainText('Rounding the lower back.');
  await noHScroll(page);

  // program editor: in the picker, addable, with sets/reps/kg/rest/notes like any other exercise
  await open(page);
  const pid = await seedPaulProgram(page, { name: 'RDL block', weeks: 4 });
  await open(page, `#/paul/p/${pid}`);
  await page.getByRole('button', { name: 'Add exercise' }).first().click();
  await expect(page.locator('.sheet .pick-grid .choice-btn').first()).toBeVisible();
  await expect(page.locator('.sheet .pick-grid .choice-btn small')).toHaveCount(0);   // names only
  await page.getByRole('button', { name: /Romanian deadlift/ }).click();
  await settle(page);
  const row = page.locator('.grid-row', { has: page.locator(`option[value="${id}"]:checked`) });
  await expect(row.getByLabel('Exercise')).toHaveValue(id);
  await row.getByLabel('Sets').fill('3');
  await row.getByLabel('Reps').fill('8');
  await row.getByLabel('Weight in kg').fill('80');
  await expect(page.locator('[data-save-state]')).toHaveText('Saved on this device');
  const p = await page.evaluate((x) => window.Paulino.store.get('paul', x), pid);
  const ex = p.weeks[0].days[0].exercises.at(-1);
  expect(ex.exerciseId).toBe(id);
  expect(ex.sets).toHaveLength(3);
  expect(ex.sets[0]).toMatchObject({ reps: 8, kg: 80 });
  // Repeat / Progress treats it like the others
  const rules = await page.evaluate((x) => {
    const P = window.Paulino;
    return P.store.get('paul', x).then((prog) => {
      const r = P.rules.apply(prog, { from: 0, count: 3, replace: true, rules: [P.rules.newRule('weight', { amount: 2.5, every: 1 })] });
      return r.program.weeks.map((w) => w.days[0].exercises.at(-1).sets[0].kg);
    });
  }, pid);
  expect(rules).toEqual([80, 82.5, 85, 87.5]);
});

test('edit and delete a custom exercise; deleting is blocked while a program uses it', async ({ page }) => {
  const id = await createFiveStepExercise(page);
  // edit: rename, reorder, delete a step, replace a photo
  await page.getByLabel('Exercise name').fill('RDL');
  await page.getByRole('button', { name: 'Move step 2 up' }).click();
  await expect(page.locator('#st-t-0')).toHaveValue('Soft knees');
  await page.getByRole('button', { name: 'Delete step 5' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.step-ed')).toHaveCount(4);
  const before = await page.locator('.step-ed[data-si="0"] .ph-thumb img').getAttribute('src');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.step-ed[data-si="0"]').getByRole('button', { name: 'Replace' }).click()]);
  await chooser.setFiles({ name: 'other.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.step-ed[data-si="0"] .ph-thumb img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove photo 1 of step 2' }).click();
  await expect(page.locator('.step-ed[data-si="1"] .ph-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByText(/Exercise saved/)).toBeVisible();
  const saved = await page.evaluate((x) => window.Paulino.store.get('exercises', x), id);
  expect(saved.name).toBe('RDL');
  expect(saved.steps.map((s) => s.title)).toEqual(['Soft knees', 'Stand tall', 'Hips back', 'Bar on the thighs']);
  expect(saved.steps[1].photos).toHaveLength(0);
  expect(typeof before).toBe('string');

  // used in a program → can't delete
  const pid = await seedPaulProgram(page, { name: 'Uses RDL', weeks: 1 });
  await page.evaluate(async ([x, eid]) => {
    const P = window.Paulino; const prog = await P.store.get('paul', x);
    prog.weeks[0].days[0].exercises.push({ ...prog.weeks[0].days[0].exercises[0], id: 'e_rdl', exerciseId: eid });
    await P.store.put('paul', prog);
  }, [pid, id]);
  await open(page, `#/paul/exercises/${id}`);
  await page.getByRole('button', { name: 'Delete this exercise' }).click();
  await expect(page.getByText(/Used in Uses RDL/)).toBeVisible();
  await page.evaluate((x) => window.Paulino.store.del('paul', x), pid);
  await page.getByRole('button', { name: 'Delete this exercise' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/#\/paul\/exercises$/);
  await expect(page.locator(`[data-custom-ex="${id}"]`)).toHaveCount(0);
  await open(page, '#/academy');
  await expect(page.locator(`[data-lesson-link="${id}"]`)).toHaveCount(0);
});

test('a shared program carries its custom exercises; the athlete sees the lesson on another device', async ({ page, browser }) => {
  const id = await createFiveStepExercise(page);
  const pid = await seedPaulProgram(page, { name: 'Shared RDL', weeks: 2 });
  await page.evaluate(async ([x, eid]) => {
    const P = window.Paulino; const prog = await P.store.get('paul', x);
    prog.weeks.forEach((w, i) => w.days[0].exercises.push({ ...w.days[0].exercises[0], id: `e_rdl${i}`, exerciseId: eid, notes: 'Slow on the way down' }));
    await P.store.put('paul', prog);
  }, [pid, id]);

  // share sheet names the included exercise
  await open(page, `#/paul/p/${pid}`);
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('[data-own-ex]')).toContainText('Romanian deadlift');

  const { file, link } = await page.evaluate(async (x) => {
    const P = window.Paulino; const prog = await P.store.get('paul', x);
    return { file: P.share.toFile(prog), link: await P.share.makeLink(prog) };
  }, pid);
  const data = JSON.parse(file.text);
  expect(data.custom).toHaveLength(1);
  expect(data.custom[0]).toMatchObject({ id, name: 'Romanian deadlift', category: 'deadlift' });
  expect(data.custom[0].steps).toHaveLength(5);
  expect(data.custom[0].steps.every((s) => s.photos.length === 1)).toBe(true);
  // the link holds the definition; photos only if they fit
  const linked = await page.evaluate((u) => window.Paulino.share.decode(u.split('#program=')[1]), link.url);
  expect(linked.custom[0].steps.map((s) => s.title)).toEqual(data.custom[0].steps.map((s) => s.title));
  if (link.photosLeftOut) {
    expect(linked.custom[0].steps.every((s) => s.photos.length === 0)).toBe(true);
    await expect(page.locator('[data-photos-left-out]')).toBeVisible();
  }
  // a fake huge photo forces the warning
  const big = await page.evaluate(async ([x, eid]) => {
    const P = window.Paulino;
    const d = P.data.exById(eid);
    const noise = Array.from({ length: 60000 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[Math.floor(Math.random() * 64)]).join('');
    P.data.registerCustom([{ ...d, steps: d.steps.map((s) => ({ ...s, photos: [`data:image/png;base64,${noise}`] })) }]);
    const l = await P.share.makeLink(await P.store.get('paul', x));
    P.data.registerCustom([d]);
    return l;
  }, [pid, id]);
  expect(big.photosLeftOut).toBe(true);
  expect(big.length).toBeLessThan(8000);

  // the athlete's phone: a fresh browser, nothing from Paul's storage
  const path = 'test-results/files/shared-rdl.paulino';
  writeFileSync(path, file.text);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const phone = await ctx.newPage();
  const errs = [];
  phone.on('pageerror', (e) => errs.push(e.message));
  await open(phone, '#/');
  expect(await phone.evaluate((eid) => window.Paulino.data.exById(eid), id)).toBeNull();
  const [chooser] = await Promise.all([phone.waitForEvent('filechooser'), phone.getByRole('button', { name: /Import a \.paulino file/ }).click()]);
  await chooser.setFiles(path);
  await phone.getByRole('button', { name: 'Save & start training' }).click();
  await expect(phone.getByRole('heading', { name: /Hey Marco/ })).toBeVisible();
  await expect(phone.locator('[data-next]')).toContainText('Romanian deadlift');
  await phone.locator('.bottom-nav').getByRole('link', { name: 'Academy' }).click();
  await phone.locator(`[data-lesson-link="${id}"]`).click();
  await expect(phone.locator('.photo-set img')).toHaveCount(5);
  // still there after a reload (stored on the phone)
  await phone.reload();
  await phone.waitForFunction(() => window.Paulino?.app && !document.querySelector('.boot'));
  await expect(phone.locator('.photo-set img')).toHaveCount(5);
  // the workout card links to the lesson and shows Paul's cue
  const day = (await phone.evaluate(async () => (await window.Paulino.store.all('athlete'))[0])).weeks[0].days[0].id;
  const progId = await phone.evaluate(async () => (await window.Paulino.store.all('athlete'))[0].id);
  await open(phone, `#/a/p/${progId}/d/${day}`);
  await expect(phone.locator('.ex-card').last()).toContainText('Romanian deadlift');
  await expect(phone.locator('.ex-card').last().getByRole('link', { name: /Learn the lift/ })).toHaveAttribute('href', `#/academy/${id}`);
  // a link-only athlete gets the lesson text too
  const ctx2 = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const p2 = await ctx2.newPage();
  await p2.goto(link.url);
  await p2.getByRole('button', { name: 'Save & start training' }).click();
  await expect(p2.getByRole('heading', { name: /Hey Marco/ })).toBeVisible();
  await open(p2, `#/academy/${id}`);
  await expect(p2.locator('.lesson-title')).toHaveText('Romanian deadlift');
  await expect(p2.locator('.lesson-step h2').first()).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close(); await ctx2.close();
});

test('five funny palettes, orange-and-black included; text stays readable, photos untouched', async ({ page }) => {
  await open(page, '#/settings');
  const want = { 'NEVER SKIP LEG DAY': 'legday', 'BRACE! BRACE! BRACE!': 'brace', 'PROTEIN PANIC': 'protein', 'PUSH THE FLOOR': 'floor', 'GO DEEPER!': 'deeper' };
  for (const [name, id] of Object.entries(want)) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-palette', id);
    const r = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const hex = (v) => v.trim().replace('#', '');
      const lum = (h) => { const c = h.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const cr = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const v = (k) => css.getPropertyValue(`--${k}`);
      return { accent: v('accent').trim(), ink: v('ink').trim(), pairs: [cr(v('ink'), v('bg')), cr(v('ink'), v('paper')), cr(v('ink'), v('pop-1')), cr(v('accent-ink'), v('accent')), cr(v('accent-strong'), v('bg'))] };
    });
    for (const c of r.pairs) expect(c).toBeGreaterThanOrEqual(4.5);
    if (id === 'brace') expect([r.accent.toUpperCase(), r.ink.toUpperCase()]).toEqual(['#F47B20', '#171717']);
  }
  // Paul's cut-outs keep their own photo treatment under every palette
  await page.getByRole('button', { name: 'BRACE! BRACE! BRACE!', exact: true }).click();
  await open(page, '#/');
  const imgs = page.locator('.home-hero img');
  expect(await imgs.evaluateAll((els) => els.every((i) => i.complete && i.naturalWidth > 0 && !/hue|sepia|invert/.test(getComputedStyle(i).filter)))).toBe(true);
  // an old saved palette name still works
  await page.evaluate(() => { localStorage.setItem('paulino:palette', JSON.stringify('pink')); window.Paulino.ui.applyPalette(); });
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'protein');
});
