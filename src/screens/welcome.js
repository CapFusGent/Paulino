// Start screen: who are you? Paul → coach sign-in. Athlete → open your link.
import { html, raw } from '../ui/dom.js';
import { mascot } from '../ui/paulino.js';
import { logo } from '../ui/layout.js';
import { rememberedAthletes } from '../store/athlete.js';

export default function welcome(root, _params, app) {
  const athletes = rememberedAthletes();
  // When the app opens on a device used by a single athlete, go straight to
  // their training. Only on the first visit of a session, so "Home" still works.
  let first = false;
  try { first = !sessionStorage.getItem('paulino.seen'); sessionStorage.setItem('paulino.seen', '1'); } catch { /* ignore */ }
  if (first && athletes.length === 1 && !app.coach.signedIn) {
    app.navigate(`/a/${athletes[0].token}`, { replace: true });
    return;
  }
  root.innerHTML = String(html`<div class="page no-nav stack">
    <section class="welcome-hero">
      <span class="scrap scrap-1" style="left:-20px;top:30px;right:auto"></span>
      <span class="scrap scrap-2" style="right:-30px;top:40px"></span>
      ${logo()}
      <p class="tagline">Powerlifting coaching by Paul.<br>Hype and form checks by Paulino.</p>
    </section>
    <div class="card card-tilt">${raw(mascot({ mood: 'motivational', context: 'home', size: 'lg', layout: 'stack' }))}</div>

    ${athletes.length ? html`<div class="card stack-sm"><h2>Continue training</h2>
      ${athletes.map((a) => html`<a class="btn btn-block" href="#/a/${a.token}">Continue as ${a.name}</a>`)}</div>` : ''}

    <a class="card choice" href="#/coach">
      <span class="choice-icon" aria-hidden="true">P</span>
      <span class="grow"><h3>I'm Paul, the coach</h3><p>Sign in to build programs and share them.</p></span>
    </a>
    <div class="card choice">
      <span class="choice-icon" aria-hidden="true" style="background:var(--pop-2)">★</span>
      <span class="grow"><h3>I'm an athlete</h3><p>Open the personal link Paul sent you. It takes you straight to your program.</p></span>
    </div>
    <p class="center"><a href="#/install">Install Paulino on your phone</a></p>
    ${!app.api.configured ? html`<p class="notice">Backend not configured: set supabaseUrl and supabaseAnonKey in config.js (see README).</p>` : ''}
  </div>`);
}
