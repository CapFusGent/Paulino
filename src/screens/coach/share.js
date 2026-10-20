// Share an athlete's personal link (copy / native share).
import { html, raw, sheet, toast, copyText } from '../../ui/dom.js';
import { ICONS } from '../../ui/layout.js';
import { shareLink } from '../../store/coach.js';

export function shareSheet(client, { programName = '' } = {}) {
  const url = shareLink(client.access_token);
  return sheet({ title: `Share with ${client.display_name}` }, (body, close) => {
    body.innerHTML = String(html`
      <p>This personal link opens ${client.display_name}'s program directly. No account needed. Anyone with the link can see and log this athlete's training, so send it only to them.</p>
      <div class="link-box"><input type="text" readonly value="${url}" aria-label="Personal link" data-link><button class="btn btn-sm" data-copy>${raw(ICONS.copy)} Copy</button></div>
      <div class="btn-row" style="margin-top:12px">
        ${navigator.share ? html`<button class="btn" data-share>${raw(ICONS.share)} Share…</button>` : ''}
        <button class="btn btn-ghost" data-close-sheet>Done</button>
      </div>`);
    body.querySelector('[data-link]').onfocus = (e) => e.target.select();
    body.querySelector('[data-copy]').onclick = async () => toast((await copyText(url)) ? 'Link copied!' : 'Copy failed, select the text and copy it.', { kind: 'ok' });
    body.querySelector('[data-share]')?.addEventListener('click', async () => {
      try { await navigator.share({ title: 'Paulino', text: `${programName ? `${programName}: ` : ''}your training with Paul`, url }); } catch { /* cancelled */ }
    });
    body.querySelector('[data-close-sheet]').onclick = () => close(true);
  });
}
