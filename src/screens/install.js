// How to install the PWA on each platform.
import { html, raw, toast } from '../ui/dom.js';
import { topBar } from '../ui/layout.js';
import { mascot } from '../ui/paulino.js';

export default function install(root, _p, app) {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  root.innerHTML = String(html`<div class="page no-nav stack">
    ${topBar({ title: 'Install Paulino', back: '/' })}
    <div class="card">${raw(mascot({ mood: 'happy', text: standalone ? "Already installed. Look at you!" : 'Put me on your home screen!', size: 'md' }))}</div>
    ${app.installPrompt ? html`<button class="btn btn-block btn-lg" data-install>Install app</button>` : ''}
    <div class="card"><h2>Android (Chrome)</h2><ol>
      <li>Open your Paulino link in Chrome.</li>
      <li>Tap the <b>⋮</b> menu → <b>Install app</b> (or <b>Add to Home screen</b>).</li>
      <li>Open Paulino from the new icon.</li></ol></div>
    <div class="card"><h2>iPhone / iPad (Safari)</h2><ol>
      <li>Open your Paulino link in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button (square with an arrow).</li>
      <li>Choose <b>Add to Home Screen</b> → <b>Add</b>.</li></ol>
      <p class="small muted">Athletes: install from <em>your personal link</em> so the icon opens your program.</p></div>
    <div class="card"><h2>Desktop (Chrome / Edge)</h2>
      <p>Click the install icon at the right of the address bar, or open the browser menu and choose <b>Install Paulino</b>.</p></div>
    <div class="card"><h2>Offline</h2>
      <p>Once opened online, Paulino keeps working without a connection: your program is readable and every set you log is stored on the phone and synced to Paul automatically when you're back online.</p></div>
  </div>`);
  root.querySelector('[data-install]')?.addEventListener('click', async () => {
    const p = app.installPrompt;
    if (!p) return;
    p.prompt();
    const r = await p.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') toast('Installed! 💪', { kind: 'ok' });
    app.installPrompt = null;
  });
}
