// Renders the app icons and standalone mascot SVGs from src/ui/paulino-art.js.
//   npm run icons
// Uses Playwright's Chromium (or installed Chrome with PW_CHANNEL=chrome).
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { paulinoSVG, MOODS } from '../src/ui/paulino-art.js';

const out = (p) => new URL(`../assets/${p}`, import.meta.url);
mkdirSync(out('icons'), { recursive: true });
mkdirSync(out('paulino'), { recursive: true });

const ACCENT = '#F4B942';
const BG = '#F5EFE3';

for (const m of MOODS) {
  writeFileSync(out(`paulino/${m}.svg`), paulinoSVG(m, { id: m, accent: ACCENT, paper: '#FFF5DD' }));
}

// Icon: Paulino's face on accent, inside a rounded ink frame.
const face = paulinoSVG('motivational', { id: 'ic', backdrop: false, accent: ACCENT });
const iconSvg = (pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="${round}" fill="${BG}"/>
  <circle cx="256" cy="256" r="${236 - pad}" fill="${ACCENT}" stroke="#141414" stroke-width="18"/>
  <svg x="${70 + pad}" y="${62 + pad}" width="${372 - pad * 2}" height="${372 - pad * 2}">${face.replace(/^<svg[^>]*>/, '<svg viewBox="48 24 144 144">')}</svg>
</svg>`;
writeFileSync(out('icons/favicon.svg'), iconSvg(0, 110));

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage();
async function png(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out(`icons/${file}`).pathname.replace(/^\/([A-Za-z]:)/, '$1'), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await png(iconSvg(0, 110), 32, 'icon-32.png');
await png(iconSvg(0, 0), 180, 'apple-touch-icon.png');
await png(iconSvg(0, 110), 192, 'icon-192.png');
await png(iconSvg(0, 110), 512, 'icon-512.png');
await png(iconSvg(40, 0), 512, 'icon-maskable-512.png');
await browser.close();
console.log('icons + mascot SVGs written to assets/');
