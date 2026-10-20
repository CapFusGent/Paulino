// Lift progress line chart (inline SVG, one kg axis, two series).
// Colours validated with the dataviz palette checker (#285BC7 / #C7306B pass
// lightness, chroma, CVD and contrast); the estimate line is also dashed so
// identity is never colour alone. Hover / tap shows a crosshair tooltip.
import { esc } from './dom.js';
import { fmtKg, formatDate } from '../core/util.js';

export const SERIES = {
  top: { color: '#285BC7', label: 'Heaviest set (kg)' },
  e1rm: { color: '#C7306B', label: 'Estimated 1RM (kg)' },
};

/**
 * @param points [{ date, top, reps, e1rm }]
 * @param opts.showE1rm include the estimate line
 */
export function liftChart(points, { showE1rm = true } = {}) {
  if (!points.length) return '<p class="muted">No logged sets for this lift yet.</p>';
  const W = 340, H = 200, L = 38, R = 46, T = 14, B = 26;
  const vals = points.flatMap((p) => [p.top, showE1rm ? p.e1rm : null]).filter((v) => v !== null && v !== undefined);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 5; hi += 5; }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(0, Math.floor((lo - pad) / 5) * 5);
  hi = Math.ceil((hi + pad) / 5) * 5;
  const x = (i) => (points.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (points.length - 1));
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => lo + ((hi - lo) * i) / ticks);
  const path = (key) => points.map((p, i) => (p[key] == null ? null : `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`)).filter(Boolean);
  const line = (key, dash) => {
    const pts = path(key);
    if (pts.length < 2) return '';
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${SERIES[key].color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${dash ? 'stroke-dasharray="6 4"' : ''}/>`;
  };
  const dots = (key) => points.map((p, i) => (p[key] == null ? '' :
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="4.5" fill="${key === 'top' ? SERIES[key].color : 'var(--paper)'}" stroke="${key === 'top' ? 'var(--paper)' : SERIES[key].color}" stroke-width="2"/>`)).join('');
  const last = points[points.length - 1];
  const endLabel = (key) => (last[key] == null ? '' : `<text x="${x(points.length - 1) + 8}" y="${y(last[key]) + 4}" style="fill:var(--ink);font-weight:700">${fmtKg(last[key])}</text>`);
  const xLabels = [0, points.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${points.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}">${esc(formatDate(points[i].date, { weekday: false }))}</text>`).join('');

  const data = esc(JSON.stringify(points.map((p, i) => ({ x: x(i), d: formatDate(p.date, { weekday: false }), top: p.top, reps: p.reps, e: showE1rm ? p.e1rm : null }))));
  return `<div class="chart-wrap" style="position:relative">
    <div class="legend" style="margin:0 0 6px">
      <span><i style="background:${SERIES.top.color}"></i>${SERIES.top.label}</span>
      ${showE1rm ? `<span><i style="background:repeating-linear-gradient(90deg, ${SERIES.e1rm.color} 0 5px, transparent 5px 8px);border-color:${SERIES.e1rm.color}"></i>${SERIES.e1rm.label}: estimate</span>` : ''}
    </div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lift history chart, ${points.length} sessions" data-chart='${data}'>
      ${grid.map((g) => `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="var(--ink)" stroke-opacity=".12" stroke-width="1"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end">${fmtKg(g)}</text>`).join('')}
      <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--ink)" stroke-width="2"/>
      ${showE1rm ? line('e1rm', true) : ''}${line('top', false)}
      ${showE1rm ? dots('e1rm') : ''}${dots('top')}
      ${endLabel('top')}${showE1rm && last.e1rm !== last.top ? endLabel('e1rm') : ''}
      ${xLabels}
      <line data-cross x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>
      <rect data-hit x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
    </svg>
    <div class="chart-tip" data-tip hidden></div>
  </div>`;
}

/** Crosshair tooltip for every chart inside root. */
export function bindCharts(root) {
  const move = (e) => {
    const svg = e.target.closest?.('svg[data-chart]');
    if (!svg) return;
    const pts = JSON.parse(svg.dataset.chart);
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const cx = ((e.clientX - box.left) / box.width) * vb.width;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.x - cx) < Math.abs(best.x - cx)) best = p;
    const cross = svg.querySelector('[data-cross]');
    cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x); cross.setAttribute('visibility', 'visible');
    const tip = svg.parentElement.querySelector('[data-tip]');
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(best.d)}</b><br>Heaviest: ${fmtKg(best.top)} kg × ${best.reps}${best.e ? `<br>Est. 1RM: ${fmtKg(best.e)} kg` : ''}`;
    const left = (best.x / vb.width) * box.width;
    tip.style.left = `${Math.min(Math.max(0, left - 70), box.width - 150)}px`;
  };
  const leave = (e) => {
    const svg = e.target.closest?.('svg[data-chart]');
    if (!svg) return;
    svg.querySelector('[data-cross]').setAttribute('visibility', 'hidden');
    svg.parentElement.querySelector('[data-tip]').hidden = true;
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerdown', move);
  root.addEventListener('pointerleave', leave, true);
  return () => { root.removeEventListener('pointermove', move); root.removeEventListener('pointerdown', move); root.removeEventListener('pointerleave', leave, true); };
}
