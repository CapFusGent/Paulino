// Paulino, drawn as an editorial-collage sticker: a black-and-white "photo"
// cut-out (grain, halftone shading, white sticker edge, flat ink shadow) over
// torn paper in the active palette's accent colour.
//
// Pure string generation (no DOM) so the same art is used in the app and by
// scripts/build-icons.mjs. If real cut-out photos of Paulino are supplied,
// set PAULINO_CONFIG.mascotImages = { motivational: 'assets/paulino/….png', … }
// and the app uses those instead (see ui/paulino.js).

export const MOODS = ['motivational', 'focused', 'happy', 'disappointed', 'concerned'];

const INK = '#141414';
const HAIR = '#1b1b1b';
const SKIN = '#cdcac4';
const SKIN_SHADE = '#a9a59e';
const SKIN_DEEP = '#8d8982';
const TANK = '#262626';

// Deterministic pseudo-random for torn edges.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A torn-paper blob path around an ellipse. */
export function tornPath(cx, cy, rx, ry, seed = 7, points = 34, jag = 0.09) {
  const r = rng(seed);
  let d = '';
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 - jag + r() * jag * 2;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${(240 - Number(x)).toFixed(1)},${y}`);

// --- body parts (viewBox -20 0 280 260, face centre x = 120) ----------------

const TORSO = 'M8,262 C10,222 28,196 60,186 C78,180 92,172 100,163 L140,163 C148,172 162,180 180,186 C212,196 230,222 232,262 Z';
const NECK = 'M100,146 L100,170 C108,180 132,180 140,170 L140,146 Z';
const TANK_TOP = 'M64,262 L72,198 C78,191 85,189 90,191 C98,208 142,208 150,191 C155,189 162,191 168,198 L176,262 Z';
const FACE = 'M84,92 C84,60 156,60 156,92 L157,118 C157,150 140,168 120,168 C100,168 83,150 83,118 Z';
const HAIR_TOP = 'M84,98 C79,74 85,54 100,45 C111,37 133,35 147,43 C159,50 163,65 158,86 L156,98 C154,86 151,79 145,75 C133,70 109,72 97,77 C90,82 87,89 86,98 Z';
const QUIFF = 'M94,56 C98,34 122,22 146,32 C156,36 162,46 160,58 C154,46 142,40 130,42 C138,36 124,34 116,40 C110,44 104,46 94,56 Z';
const SIDEBURNS = 'M83,90 L90,90 L90,116 L83,116 Z M150,90 L157,90 L157,116 L150,116 Z';
const BEARD = 'M83,112 C82,142 96,174 120,176 C144,174 158,142 157,112 C154,126 148,134 140,136 C132,131 108,131 100,136 C92,134 86,126 83,112 Z';
const MUSTACHE = 'M98,140 C106,132 134,132 142,140 C134,144 106,144 98,140 Z';

// Flexed arm on the image's right side; mirrored for the left.
const ARM_FLEX = 'M172,206 C200,214 234,210 248,190 C262,170 262,144 254,122 L224,120 C226,136 226,148 222,158 C214,136 186,138 180,168 Z';
const BICEP_LINE = 'M188,170 C196,152 212,150 220,160';
const FIST = (x, y) => `
  <path d="M${x - 15},${y - 8} q0,-12 15,-12 q15,0 15,12 v12 q0,10 -15,10 q-15,0 -15,-10 Z" fill="${SKIN}" stroke="${INK}" stroke-width="2.5"/>
  <path d="M${x - 9},${y - 9} v6 M${x - 2},${y - 10} v6 M${x + 5},${y - 9} v6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
const POINT_HAND = (x, y) => `
  <path d="M${x + 3},${y - 36} q0,-6 6,-6 q6,0 6,6 v26 h-12 Z" fill="${SKIN}" stroke="${INK}" stroke-width="2.5"/>
  <path d="M${x - 15},${y - 8} q0,-12 15,-12 q15,0 15,12 v12 q0,10 -15,10 q-15,0 -15,-10 Z" fill="${SKIN}" stroke="${INK}" stroke-width="2.5"/>
  <path d="M${x - 10},${y - 4} q8,-4 16,2" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
const PALM = (x, y) => `
  <path d="M${x - 16},${y + 8} v-22 q0,-5 4,-5 q4,0 4,5 v-8 q0,-5 4,-5 q4,0 4,5 v-2 q0,-5 4,-5 q4,0 4,5 v4 q0,-5 4,-5 q4,0 4,5 v22 q0,14 -14,14 q-14,0 -18,-8 Z"
        fill="${SKIN}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;

function arm(side, hand, p) {
  const d = side === 'right' ? ARM_FLEX : mirror(ARM_FLEX);
  const line = side === 'right' ? BICEP_LINE : mirror(BICEP_LINE);
  const hx = side === 'right' ? 239 : 1;
  const handSvg = hand === 'fist' ? FIST(hx, 110) : hand === 'point' ? POINT_HAND(hx, 112) : PALM(hx, 108);
  return `<g>
    <path d="${d}" fill="${SKIN}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${d}" fill="url(#${p}-ht)" opacity=".55" clip-path="url(#${p}-armclip-${side})"/>
    <path d="${line}" fill="none" stroke="${SKIN_DEEP}" stroke-width="2.5" stroke-linecap="round"/>
    ${handSvg}
  </g>`;
}

// --- faces -----------------------------------------------------------------

function brows(kind) {
  const s = `fill="none" stroke="${HAIR}" stroke-width="6" stroke-linecap="round"`;
  switch (kind) {
    case 'determined': return `<path d="M92,92 L114,98" ${s}/><path d="M148,92 L126,98" ${s}/>`;
    case 'sad': return `<path d="M92,98 L113,90" ${s}/><path d="M148,98 L127,90" ${s}/>`;
    case 'raised': return `<path d="M92,88 Q103,80 114,86" ${s}/><path d="M126,86 Q137,80 148,88" ${s}/>`;
    case 'happy': return `<path d="M92,90 Q103,84 114,90" ${s}/><path d="M126,90 Q137,84 148,90" ${s}/>`;
    default: return `<path d="M92,93 Q103,88 114,93" ${s}/><path d="M126,93 Q137,88 148,93" ${s}/>`;
  }
}

function eyes(kind, p) {
  switch (kind) {
    case 'shades':
      return `<g>
        <path d="M86,99 h30 q2,0 2,3 l-3,13 q-1,5 -7,5 h-12 q-7,0 -9,-6 l-3,-12 q0,-3 2,-3 Z" fill="${INK}"/>
        <path d="M124,99 h30 q2,0 2,3 l-3,13 q-2,6 -9,6 h-12 q-6,0 -7,-5 l-3,-13 q0,-3 2,-3 Z" fill="${INK}"/>
        <path d="M116,103 q4,-3 8,0" stroke="${INK}" stroke-width="3" fill="none"/>
        <path d="M84,101 l-4,-3 M156,101 l4,-3" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <path d="M92,103 l8,0 l-9,13 l-3,0 Z" fill="var(--p-accent, #F4B942)" opacity=".9"/>
        <path d="M130,103 l8,0 l-9,13 l-3,0 Z" fill="var(--p-accent, #F4B942)" opacity=".9"/>
        <path d="M104,104 l3,0 l-7,10 l-2,0 Z M142,104 l3,0 l-7,10 l-2,0 Z" fill="#fff" opacity=".85"/>
      </g>`;
    case 'closed':
      return `<path d="M94,110 Q103,99 112,110" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
              <path d="M128,110 Q137,99 146,110" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'droopy':
      return `<ellipse cx="103" cy="108" rx="9" ry="7" fill="#fff" stroke="${INK}" stroke-width="2"/>
              <ellipse cx="137" cy="108" rx="9" ry="7" fill="#fff" stroke="${INK}" stroke-width="2"/>
              <circle cx="103" cy="111" r="3.6" fill="${INK}"/><circle cx="137" cy="111" r="3.6" fill="${INK}"/>
              <path d="M93,106 Q103,101 113,106 L113,102 L93,102 Z" fill="${SKIN_SHADE}" stroke="${INK}" stroke-width="2"/>
              <path d="M127,106 Q137,101 147,106 L147,102 L127,102 Z" fill="${SKIN_SHADE}" stroke="${INK}" stroke-width="2"/>`;
    case 'wide':
      return `<ellipse cx="103" cy="107" rx="9" ry="10" fill="#fff" stroke="${INK}" stroke-width="2"/>
              <ellipse cx="137" cy="107" rx="9" ry="10" fill="#fff" stroke="${INK}" stroke-width="2"/>
              <circle cx="104" cy="108" r="3" fill="${INK}"/><circle cx="136" cy="108" r="3" fill="${INK}"/>`;
    default:
      return `<ellipse cx="103" cy="107" rx="8" ry="8" fill="#fff" stroke="${INK}" stroke-width="2"/>
              <ellipse cx="137" cy="107" rx="8" ry="8" fill="#fff" stroke="${INK}" stroke-width="2"/>
              <circle cx="105" cy="108" r="3.6" fill="${INK}"/><circle cx="139" cy="108" r="3.6" fill="${INK}"/>`;
  }
}

function mouth(kind) {
  switch (kind) {
    case 'grin':
      return `<path d="M104,147 Q120,166 136,147 Z" fill="${INK}"/>
              <path d="M106,148 Q120,154 134,148 L133,151 Q120,157 107,151 Z" fill="#fff"/>`;
    case 'laugh':
      return `<path d="M100,145 Q120,178 140,145 Z" fill="${INK}"/>
              <path d="M103,146 Q120,152 137,146 L136,150 Q120,156 104,150 Z" fill="#fff"/>
              <path d="M110,162 Q120,154 130,162 Q120,170 110,162 Z" fill="#8a7f7f"/>`;
    case 'teeth':
      return `<rect x="105" y="145" width="30" height="9" rx="2" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
              <path d="M112,145 v9 M120,145 v9 M128,145 v9 M105,149.5 h30" stroke="${INK}" stroke-width="1.5"/>`;
    case 'frown':
      return `<path d="M104,157 Q120,141 136,157" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'o':
      return `<ellipse cx="120" cy="151" rx="6" ry="7.5" fill="${INK}"/>`;
    default:
      return `<path d="M106,149 Q120,158 134,149" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  }
}

function head(face, p) {
  return `<g>
    <ellipse cx="82" cy="112" rx="7" ry="11" fill="${SKIN_SHADE}" stroke="${INK}" stroke-width="2.5"/>
    <ellipse cx="158" cy="112" rx="7" ry="11" fill="${SKIN_SHADE}" stroke="${INK}" stroke-width="2.5"/>
    <path d="${FACE}" fill="${SKIN}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M138,74 C152,84 158,100 156,124 C150,140 146,150 138,160 C150,130 148,100 138,74 Z" fill="url(#${p}-ht)" opacity=".7"/>
    <path d="${SIDEBURNS}" fill="#3a3a3a"/>
    <path d="${SIDEBURNS}" fill="url(#${p}-ht)" opacity=".8"/>
    <path d="${HAIR_TOP}" fill="${HAIR}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${QUIFF}" fill="${HAIR}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M104,48 C114,36 132,32 146,38 M110,56 C120,46 138,44 152,50 M100,64 C112,58 130,56 148,60" fill="none" stroke="#6a6a6a" stroke-width="2" stroke-linecap="round" opacity=".85"/>
    <path d="${BEARD}" fill="${HAIR}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M92,150 q4,8 2,14 M148,150 q-4,8 -2,14 M106,166 q6,4 14,4" fill="none" stroke="#4d4d4d" stroke-width="1.6" stroke-linecap="round"/>
    ${mouth(face.mouth)}
    <path d="${MUSTACHE}" fill="${HAIR}" stroke="${INK}" stroke-width="2"/>
    <path d="M120,104 C117,118 113,125 115,129 C118,132 124,132 127,129" fill="none" stroke="${SKIN_DEEP}" stroke-width="3" stroke-linecap="round"/>
    ${eyes(face.eyes, p)}
    ${brows(face.brows)}
  </g>`;
}

function body(p) {
  return `<g>
    <path d="${TORSO}" fill="${SKIN}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M30,230 C40,206 56,196 74,194 M210,230 C200,206 184,196 166,194" fill="none" stroke="${SKIN_DEEP}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M150,190 C180,186 214,200 228,240 L232,262 L176,262 Z" fill="url(#${p}-ht)" opacity=".6"/>
    <path d="${NECK}" fill="${SKIN_SHADE}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M104,170 C112,178 128,178 136,170" fill="none" stroke="${SKIN_DEEP}" stroke-width="2"/>
    <path d="${TANK_TOP}" fill="${TANK}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="120" cy="234" r="15" fill="var(--p-accent, #F4B942)" stroke="${INK}" stroke-width="2.5"/>
    <text x="120" y="241" text-anchor="middle" font-family="Bricolage Grotesque, Arial Black, sans-serif" font-weight="800" font-size="19" fill="${INK}">P</text>
  </g>`;
}

// --- per-mood composition -----------------------------------------------------

const POSES = {
  motivational: { face: { eyes: 'shades', brows: 'normal', mouth: 'grin' }, arms: [['right', 'fist']], tilt: 0, drop: 0 },
  focused:      { face: { eyes: 'shades', brows: 'determined', mouth: 'teeth' }, arms: [['left', 'point']], tilt: 0, drop: 0 },
  happy:        { face: { eyes: 'closed', brows: 'happy', mouth: 'laugh' }, arms: [['right', 'fist'], ['left', 'fist']], tilt: 4, drop: 0 },
  disappointed: { face: { eyes: 'droopy', brows: 'sad', mouth: 'frown' }, arms: [], tilt: -7, drop: 7 },
  concerned:    { face: { eyes: 'wide', brows: 'raised', mouth: 'o' }, arms: [['right', 'palm']], tilt: 3, drop: 0 },
};

function extras(mood) {
  const a = 'var(--p-accent, #F4B942)';
  switch (mood) {
    case 'motivational':
      return `<g stroke="${INK}" stroke-width="4" stroke-linecap="round">
        <path d="M222,78 l-6,-16 M240,76 l4,-17 M256,90 l12,-10"/></g>
        <path d="M-6,70 l10,8 -12,4 12,6 -10,8" fill="none" stroke="${a}" stroke-width="5" stroke-linejoin="round"/>`;
    case 'focused':
      return `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round">
        <path d="M180,60 q16,-4 26,6 M186,44 q22,-6 36,10 M192,28 q28,-8 46,14"/></g>`;
    case 'happy':
      return `<g fill="${a}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
        <path d="M120,6 l5,12 13,1 -10,8 3,13 -11,-7 -11,7 3,-13 -10,-8 13,-1 Z"/>
        <path d="M50,40 l3,7 8,1 -6,5 2,8 -7,-4 -7,4 2,-8 -6,-5 8,-1 Z"/>
        <path d="M196,44 l3,7 8,1 -6,5 2,8 -7,-4 -7,4 2,-8 -6,-5 8,-1 Z"/></g>
        <g stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M30,20 l4,10 M210,18 l-4,10"/></g>`;
    case 'disappointed':
      return `<path d="M166,70 q8,12 0,18 q-8,-6 0,-18 Z" fill="#9fc6e8" stroke="${INK}" stroke-width="2.5"/>
        <g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round">
        <path d="M34,50 q8,-10 16,0 q8,10 16,0 M40,30 q6,-8 12,0"/></g>`;
    case 'concerned':
      return `<path d="M168,62 q7,10 0,16 q-7,-6 0,-16 Z" fill="#9fc6e8" stroke="${INK}" stroke-width="2.5"/>
        <g transform="translate(26,38)"><path d="M0,-22 L8,-6 26,-8 14,6 20,22 0,12 -20,22 -14,6 -26,-8 -8,-6 Z" fill="${a}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
        <text x="0" y="9" text-anchor="middle" font-family="Bricolage Grotesque, Arial Black, sans-serif" font-weight="800" font-size="22" fill="${INK}">!</text></g>`;
    default: return '';
  }
}

/**
 * @param mood one of MOODS
 * @param opts.id        unique prefix for defs (required when several are on a page)
 * @param opts.backdrop  draw the torn-paper collage behind him
 * @param opts.accent    override accent colour (icons); defaults to the CSS var
 * @param opts.title     accessible title
 */
export function paulinoSVG(mood = 'motivational', { id = 'pl', backdrop = true, accent = null, paper = null, title = null } = {}) {
  const pose = POSES[mood] || POSES.motivational;
  const p = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const acc = accent || 'var(--accent, #F4B942)';
  const pap = paper || 'var(--paper-2, #fffaf0)';
  const armClips = ['left', 'right'].map((side) =>
    `<clipPath id="${p}-armclip-${side}"><rect x="${side === 'right' ? 205 : -30}" y="100" width="65" height="120"/></clipPath>`).join('');
  const back = backdrop
    ? `<g>
        <path d="${tornPath(124, 140, 132, 118, 11)}" fill="${mood === 'disappointed' ? '#cfcac0' : acc}" stroke="${INK}" stroke-width="2.5" transform="rotate(-4 124 140)"/>
        <path d="${tornPath(110, 160, 96, 90, 29, 26, 0.12)}" fill="${pap}" opacity=".9" transform="rotate(8 110 160)"/>
        <circle cx="190" cy="70" r="46" fill="url(#${p}-htInk)" opacity=".55"/>
        <path d="M-10,214 L250,180 L250,198 L-10,232 Z" fill="${INK}" opacity=".9"/>
      </g>`
    : '';
  const figure = `<g filter="url(#${p}-cut)">
      <g transform="translate(0 ${pose.drop})">${body(p)}</g>
      ${pose.arms.map(([side, hand]) => arm(side, hand, p)).join('')}
      <g transform="rotate(${pose.tilt} 120 170) translate(0 ${pose.drop})">${head(pose.face, p)}</g>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -6 280 268" class="paulino-svg mood-${mood}" style="--p-accent:${acc}" role="img" aria-label="${title || `Paulino looking ${mood}`}">
  <defs>
    <pattern id="${p}-ht" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.5" cy="2.5" r="1.25" fill="${INK}"/></pattern>
    <pattern id="${p}-htInk" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="2" fill="${INK}"/></pattern>
    ${armClips}
    <filter id="${p}-cut" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.32 -0.1" result="grain"/>
      <feComposite in="grain" in2="SourceAlpha" operator="in" result="grainIn"/>
      <feMerge result="tex"><feMergeNode in="SourceGraphic"/><feMergeNode in="grainIn"/></feMerge>
      <feMorphology in="SourceAlpha" operator="dilate" radius="4.5" result="edge"/>
      <feFlood flood-color="#ffffff"/><feComposite in2="edge" operator="in" result="sticker"/>
      <feOffset in="edge" dx="5" dy="6" result="off"/>
      <feFlood flood-color="${INK}"/><feComposite in2="off" operator="in" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="sticker"/><feMergeNode in="tex"/></feMerge>
    </filter>
  </defs>
  ${back}
  ${extras(mood)}
  ${figure}
</svg>`;
}
