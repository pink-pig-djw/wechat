/**
 * 「泡泡」表情 —— 泡泡自己的表情形象。
 *
 * Every face is a little chat bubble (round body + a speech-bubble tail at the bottom-left,
 * echoing the app logo) with a glossy highlight, rosy cheeks and a soft brown outline.
 * Faces are composed from parts (eyes / mouth / brows / extras) so the set stays consistent.
 * All artwork is drawn on a 64×64 grid and exported as standalone SVG strings.
 */

export const INK = '#3b2416';
const PINK = '#ff7b8b';
const MOUTH = '#7a2f22';
const WATER = '#8ad8ff';
const RED = '#ff4f6d';

export const BODY_PATH =
  'M22.6 53.2A25 25 0 1 0 9.9 41.7C9.6 46.6 8.2 51.6 5.6 55.6Q4.8 57.4 6.8 57.1C11.8 56.4 17.6 55.2 22.6 53.2Z';

const TONES = {
  sunny: ['#ffec9c', '#ffc53d'],
  angry: ['#ffb894', '#ff7a55'],
  rage: ['#ff9480', '#e9452f'],
  sick: ['#e6f5a6', '#acd85a'],
  pale: ['#fff3c4', '#ffd76a'],
};

/* ---------- drawing helpers ---------- */

const stroke = (d, w = 2.6, color = INK) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A coloured stroke with a white halo, so marks drawn outside the face stay visible on dark backgrounds. */
const haloStroke = (d, color, w = 2.6) => stroke(d, w + 2.6, '#fff') + stroke(d, w, color);

const shape = (d, fill, w = 2, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${extra}/>`;

export function dropPath(x, y, s = 1) {
  return `M${x} ${y - 5.5 * s}C${x + 3.2 * s} ${y - 1 * s} ${x + 4.4 * s} ${y + 1.4 * s} ${x + 4.4 * s} ${y + 3.2 * s}A${4.4 * s} ${4.4 * s} 0 0 1 ${x - 4.4 * s} ${y + 3.2 * s}C${x - 4.4 * s} ${y + 1.4 * s} ${x - 3.2 * s} ${y - 1 * s} ${x} ${y - 5.5 * s}Z`;
}

const drop = (x, y, s = 1, fill = WATER) =>
  shape(dropPath(x, y, s), fill, 1.6) + `<ellipse cx="${x - 1.4 * s}" cy="${y + 2.4 * s}" rx="${1 * s}" ry="${1.4 * s}" fill="#fff" opacity=".8"/>`;

export function heartPath(x, y, s = 1) {
  return `M${x} ${y + 4.5 * s}C${x - 7.5 * s} ${y - 0.5 * s} ${x - 5.2 * s} ${y - 7 * s} ${x} ${y - 3.2 * s}C${x + 5.2 * s} ${y - 7 * s} ${x + 7.5 * s} ${y - 0.5 * s} ${x} ${y + 4.5 * s}Z`;
}

const heart = (x, y, s = 1, w = 1.6) =>
  shape(heartPath(x, y, s), RED, w) + `<ellipse cx="${x - 2.6 * s}" cy="${y - 2 * s}" rx="${1.3 * s}" ry="${0.9 * s}" fill="#fff" opacity=".8" transform="rotate(-35 ${x - 2.6 * s} ${y - 2 * s})"/>`;

function starPath(x, y, R, r = R * 0.45) {
  let d = '';
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? r : R;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i ? 'L' : 'M'}${(x + radius * Math.cos(a)).toFixed(2)} ${(y + radius * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}

export function sparklePath(x, y, r) {
  const k = r * 0.22;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
}

const sparkle = (x, y, r, fill = '#ffb020') => shape(sparklePath(x, y, r), fill, 1.3);

/** Mirror an x coordinate across the face's vertical centre line. */
const mx = (x) => 64 - x;

/* ---------- face parts ---------- */

const pair = (fn) => fn(23) + fn(41);

const EYES = {
  dot: pair((x) => `<ellipse cx="${x}" cy="28" rx="3.3" ry="4.3" fill="${INK}"/><circle cx="${x + 1.3}" cy="26.3" r="1.25" fill="#fff"/>`),
  big: pair(
    (x) =>
      `<ellipse cx="${x}" cy="27.5" rx="4.3" ry="5.4" fill="${INK}"/><circle cx="${x + 1.5}" cy="25.4" r="1.7" fill="#fff"/><circle cx="${x - 1.4}" cy="29.8" r=".9" fill="#fff"/>`,
  ),
  teary: pair(
    (x) =>
      `<ellipse cx="${x}" cy="27.5" rx="4.4" ry="5.5" fill="${INK}"/><circle cx="${x + 1.5}" cy="25.3" r="1.8" fill="#fff"/><circle cx="${x - 1.5}" cy="29.6" r="1" fill="#fff"/>` +
      stroke(`M${x - 3.6} 30.6Q${x} 33.6 ${x + 3.6} 30.6`, 1.5, WATER),
  ),
  happy: stroke('M18.5 29.5Q23 23 27.5 29.5', 2.8) + stroke('M36.5 29.5Q41 23 45.5 29.5', 2.8),
  closed: stroke('M18.5 27Q23 32 27.5 27', 2.8) + stroke('M36.5 27Q41 32 45.5 27', 2.8),
  sleepy: stroke('M18.5 28.5Q23 30.8 27.5 28.5', 2.8) + stroke('M36.5 28.5Q41 30.8 45.5 28.5', 2.8),
  line: stroke('M18.5 28.5H27.5', 2.8) + stroke('M36.5 28.5H45.5', 2.8),
  wink: `<ellipse cx="23" cy="28" rx="3.3" ry="4.3" fill="${INK}"/><circle cx="24.3" cy="26.3" r="1.25" fill="#fff"/>` + stroke('M36.5 29.5Q41 23 45.5 29.5', 2.8),
  squint: stroke('M19 23.5L26.5 28L19 32.5', 2.8) + stroke('M45 23.5L37.5 28L45 32.5', 2.8),
  heart: heart(23, 28, 1.05) + heart(41, 28, 1.05),
  star: pair((x) => shape(starPath(x, 28, 6.6), '#fff', 1.7) + `<circle cx="${x}" cy="28.6" r="1.3" fill="#ffb020"/>`),
  x: stroke('M19.5 24.5L26.5 31.5M26.5 24.5L19.5 31.5', 2.8) + stroke('M37.5 24.5L44.5 31.5M44.5 24.5L37.5 31.5', 2.8),
  spiral: pair((x) => stroke(`M${x - 0.8} 28a.8 .8 0 0 1 1.6 0a1.8 1.8 0 0 1 -3.6 0a2.8 2.8 0 0 1 5.6 0a3.8 3.8 0 0 1 -7.6 0`, 1.8)),
  roll: pair((x) => `<ellipse cx="${x}" cy="28" rx="4.6" ry="5.2" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="25.1" r="2.4" fill="${INK}"/>`),
  side: pair((x) => `<ellipse cx="${x}" cy="28" rx="4.6" ry="4.9" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${x + 2}" cy="28.6" r="2.5" fill="${INK}"/>`),
  up: pair((x) => `<ellipse cx="${x}" cy="28" rx="4.4" ry="5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${x + 1.5}" cy="25.6" r="2.4" fill="${INK}"/>`),
  wide: pair((x) => `<ellipse cx="${x}" cy="27.5" rx="5" ry="5.8" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="27.8" r="1.7" fill="${INK}"/>`),
  half: pair((x) => stroke(`M${x - 5} 27H${x + 5}`, 2.6) + `<path d="M${x - 3.7} 27A3.7 3.7 0 0 0 ${x + 3.7} 27Z" fill="${INK}"/>`),
  tiny: `<circle cx="24" cy="28.5" r="2" fill="${INK}"/><circle cx="40" cy="28.5" r="2" fill="${INK}"/>`,
  glasses:
    shape('M13.5 22.5H50.5V24.5Q50.5 34.2 42.6 34.2Q35.6 34.2 34.6 26.2H29.4Q28.4 34.2 21.4 34.2Q13.5 34.2 13.5 24.5Z', '#1f1b2e', 1.8) +
    stroke('M17.5 25.6L22.5 25.6M37.5 25.6L42.5 25.6', 1.6, 'rgba(255,255,255,.75)') +
    stroke('M13.5 23.6L8.4 21.4M50.5 23.6L55.6 21.4', 2),
};

const BROWS = {
  angry: stroke('M16.5 20.5L27 24', 2.8) + stroke(`M${mx(16.5)} 20.5L${mx(27)} 24`, 2.8),
  sad: stroke('M18 22.5Q22.5 21.8 27 18.8', 2.6) + stroke(`M${mx(18)} 22.5Q${mx(22.5)} 21.8 ${mx(27)} 18.8`, 2.6),
  firm: stroke('M17 21L27.5 23.6', 2.8) + stroke(`M${mx(17)} 21L${mx(27.5)} 23.6`, 2.8),
  raised: stroke('M18 20Q22.5 16.5 27 19.5', 2.4) + stroke('M37 21.8L46 21.2', 2.4),
};

/** Open mouth: dark fill, optional tongue, outline on top. */
const openMouth = (d, tongue) =>
  `<path d="${d}" fill="${MOUTH}"/>` + (tongue ? `<path d="${tongue}" fill="${PINK}"/>` : '') + shape(d, 'none', 2.2);

const MOUTHS = {
  smile: stroke('M26 37.5Q32 43 38 37.5'),
  small: stroke('M28.5 38.5Q32 41 35.5 38.5', 2.4),
  grin: openMouth('M24.5 36Q32 38 39.5 36Q39 46.5 32 46.5Q25 46.5 24.5 36Z', 'M27.6 43.4Q32 40 36.4 43.4Q35 46.3 32 46.3Q29 46.3 27.6 43.4Z'),
  laugh: openMouth('M22.5 34.5Q32 37 41.5 34.5Q41 49 32 49Q23 49 22.5 34.5Z', 'M26.5 45Q32 40.5 37.5 45Q35.5 48.8 32 48.8Q28.5 48.8 26.5 45Z'),
  o: `<ellipse cx="32" cy="40.5" rx="2.6" ry="3.2" fill="${MOUTH}" stroke="${INK}" stroke-width="2"/>`,
  O: openMouth('M32 35C36.6 35 37.6 39 37.6 41.4C37.6 45 35.2 47.2 32 47.2C28.8 47.2 26.4 45 26.4 41.4C26.4 39 27.4 35 32 35Z', 'M28.4 45Q32 42.6 35.6 45Q34 47 32 47Q30 47 28.4 45Z'),
  frown: stroke('M26 42.5Q32 37 38 42.5'),
  flat: stroke('M27 40H37'),
  wavy: stroke('M24.5 40.5q1.9 -2.2 3.75 0t3.75 0t3.75 0t3.75 0', 2.4),
  wobble: stroke('M26.8 42q1.3 -2 2.6 0t2.6 0t2.6 0t2.6 0', 2.3),
  cat: stroke('M25.5 37.5q3.25 3.6 6.5 0q3.25 3.6 6.5 0', 2.5),
  tongue: shape('M30.2 39.4Q30 45.6 33.2 45.6Q36.4 45.6 36.2 39Z', PINK, 2) + stroke('M33.2 40.6V43.2', 1.2, '#d94a63') + stroke('M25.5 37.5Q32 42.5 38.5 37.5'),
  kiss: stroke('M30.6 35.6Q35.4 36.6 32.2 38.6Q35.8 40 31 42.4', 2.4),
  smirk: stroke('M26.5 39.8Q33 42.6 38.6 36.4'),
  sly:
    openMouth('M22.8 36Q32 40 41.2 36Q38.6 45.6 32 45.6Q25.4 45.6 22.8 36Z') +
    stroke('M25.6 38.4Q32 41.2 38.4 38.4', 2.2, '#fff'),
  teeth:
    `<rect x="23" y="36" width="18" height="9.4" rx="3.6" fill="#fff" stroke="${INK}" stroke-width="2.2"/>` +
    stroke('M23.6 40.7H40.4M29 36.6V44.8M35 36.6V44.8', 1.4),
  wail: openMouth('M24 45.2Q32 32.6 40 45.2Q32 48.2 24 45.2Z', 'M27.6 45.4Q32 42 36.4 45.4Q32 47.2 27.6 45.4Z'),
  drool: openMouth('M26 37Q32 39 38 37Q37.5 44.2 32 44.2Q26.5 44.2 26 37Z', 'M28.4 42.2Q32 39.8 35.6 42.2Q34.2 44 32 44Q29.8 44 28.4 42.2Z'),
  tiny: stroke('M30.4 40.2H33.6', 2.4),
  none: '',
};

const CHEEKS = `<ellipse cx="16.5" cy="36" rx="4.6" ry="2.9" fill="${PINK}" opacity=".5"/><ellipse cx="47.5" cy="36" rx="4.6" ry="2.9" fill="${PINK}" opacity=".5"/>`;
const CHEEKS_STRONG = `<ellipse cx="16.5" cy="36" rx="5.4" ry="3.4" fill="${PINK}" opacity=".85"/><ellipse cx="47.5" cy="36" rx="5.4" ry="3.4" fill="${PINK}" opacity=".85"/>`;

/* ---------- extras ---------- */

const X = {
  sweat: () => drop(50.5, 14, 1.05),
  anger: (x = 50, y = 10.5) =>
    haloStroke(
      `M${x - 5} ${y - 1.5}Q${x - 1.5} ${y - 1.5} ${x - 1.5} ${y - 5}M${x + 1.5} ${y - 5}Q${x + 1.5} ${y - 1.5} ${x + 5} ${y - 1.5}M${x + 5} ${y + 1.5}Q${x + 1.5} ${y + 1.5} ${x + 1.5} ${y + 5}M${x - 1.5} ${y + 5}Q${x - 1.5} ${y + 1.5} ${x - 5} ${y + 1.5}`,
      '#ff2e3e',
      2.6,
    ),
  blush: () =>
    stroke('M12.6 37.4l2.2 -3M16.1 37.9l2.2 -3M19.6 38.4l2.2 -3', 1.5, '#e04a62') +
    stroke(`M${mx(14.8)} 37.4l-2.2 -3M${mx(18.3)} 37.9l-2.2 -3M${mx(21.8)} 38.4l-2.2 -3`, 1.5, '#e04a62'),
  tearsJoy: () => drop(14.5, 31.5, 0.8) + drop(49.5, 31.5, 0.8),
  streams: () =>
    shape('M19.6 30.6Q17 40.5 18.6 52L24.2 52Q22.8 40.5 25.6 30.6Z', WATER, 1.6) +
    shape(`M${mx(19.6)} 30.6Q${mx(17)} 40.5 ${mx(18.6)} 52L${mx(24.2)} 52Q${mx(22.8)} 40.5 ${mx(25.6)} 30.6Z`, WATER, 1.6),
  tear: () => drop(19, 38.5, 0.7),
  zzz: () => haloStroke('M44.6 14h4.4l-4.4 5h4.4', '#7a6cff', 2) + haloStroke('M51.4 3.6h6.2l-6.2 7h6.2', '#7a6cff', 2.3),
  question: () => haloStroke('M46 9.6Q46 4.6 51 4.6Q56 4.6 56 9Q56 12.2 51.5 13.6V16.2', '#3d7bff', 2.6) + `<circle cx="51.5" cy="20.6" r="1.9" fill="#3d7bff" stroke="#fff" stroke-width="1.4"/>`,
  heart: (x = 52, y = 11) => heart(x, y, 0.75, 1.4),
  shade: () => `<rect x="0" y="0" width="64" height="30" fill="url(#shade)"/>`,
  lines: () => stroke('M22 6.5V15M27.4 5.5V16.5M32.8 5.5V16.5M38.2 6.5V15', 1.8, 'rgba(70,52,110,.7)'),
  steam: () =>
    shape('M4.6 15.2a3.2 3.2 0 0 1 1 -6.2a4 4 0 0 1 7.4 -1a3.2 3.2 0 0 1 3 5.6Z', '#fff', 1.6) +
    shape(`M${mx(4.6)} 15.2a3.2 3.2 0 0 0 -1 -6.2a4 4 0 0 0 -7.4 -1a3.2 3.2 0 0 0 -3 5.6Z`, '#fff', 1.6),
  mask: () =>
    stroke('M15.6 34L8.4 30.4M48.4 34L55.6 30.4', 1.8) +
    shape('M15 33Q32 29.5 49 33L47 44.6Q32 50.6 17 44.6Z', '#fff', 2) +
    stroke('M19 37Q32 34.4 45 37M19.6 41.2Q32 38.6 44.4 41.2', 1.3, '#c4c7d6'),
  headband: () =>
    shape('M4 20Q32 9 60 20L60 26.6Q32 15.6 4 26.6Z', '#ff4d4f', 2) +
    `<circle cx="32" cy="16.4" r="3" fill="#fff"/><circle cx="32" cy="16.4" r="1.5" fill="#ff4d4f"/>`,
  headbandKnot: () => shape('M55.2 20.6L62.6 15.2L61.2 22Z', '#ff4d4f', 1.8) + shape('M55.6 23.6L62.2 27.6L57.2 29.2Z', '#ff4d4f', 1.8),
  melon: () =>
    `<path d="M18.5 38A13.5 13.5 0 0 0 45.5 38Z" fill="#3fbf5f"/>` +
    `<path d="M20.6 38A11.4 11.4 0 0 0 43.4 38Z" fill="#d6f5c9"/>` +
    `<path d="M21.8 38A10.2 10.2 0 0 0 42.2 38Z" fill="#ff5a64"/>` +
    shape('M18.5 38A13.5 13.5 0 0 0 45.5 38Z', 'none', 2.2) +
    [
      [27, 41.6],
      [32, 44.4],
      [37, 41.6],
      [29.4, 46.4],
      [34.6, 46.4],
    ]
      .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx=".9" ry="1.4" fill="${INK}"/>`)
      .join(''),
  check: () =>
    `<circle cx="50.5" cy="49" r="7.6" fill="#07c160" stroke="${INK}" stroke-width="2"/>` + stroke('M46.8 49.2L49.6 52L54.4 46.4', 2.4, '#fff'),
  sparkles: () => sparkle(9, 9, 4.6) + sparkle(56, 6.5, 3.4) + sparkle(58.6, 48, 3),
  thinking: () =>
    `<circle cx="47" cy="13" r="1.7" fill="#fff" stroke="${INK}" stroke-width="1.4"/><circle cx="51.6" cy="8.6" r="2.4" fill="#fff" stroke="${INK}" stroke-width="1.4"/><circle cx="57.4" cy="4.8" r="3.1" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`,
  sprout: () =>
    stroke('M32 6.4V4.2', 2) +
    shape('M32 4.6Q27.4 1.2 25.2 5Q29 7 32 4.6Z', '#5fd068', 1.5) +
    shape('M32 4.6Q36.6 1.2 38.8 5Q35 7 32 4.6Z', '#5fd068', 1.5),
  snot: () =>
    `<circle cx="40.5" cy="40" r="5.6" fill="#c9efff" opacity=".85" stroke="${INK}" stroke-width="1.4"/><ellipse cx="38.6" cy="38" rx="1.4" ry="1" fill="#fff" transform="rotate(-30 38.6 38)"/>`,
  drool: () => drop(37, 48.6, 0.62, '#9fe0ff'),
};

/* ---------- composition ---------- */

function bodyMarkup(tone, inner = '') {
  const [top, bottom] = TONES[tone];
  return (
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>` +
    `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d7dff" stop-opacity=".75"/><stop offset="1" stop-color="#6d7dff" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="c"><path d="${BODY_PATH}"/></clipPath></defs>` +
    `<path d="${BODY_PATH}" fill="url(#g)"/>` +
    (inner ? `<g clip-path="url(#c)">${inner}</g>` : '') +
    `<path d="${BODY_PATH}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<ellipse cx="20.5" cy="14.5" rx="6.5" ry="3.2" transform="rotate(-32 20.5 14.5)" fill="#fff" opacity=".72"/>` +
    `<circle cx="13.6" cy="21.4" r="1.7" fill="#fff" opacity=".72"/>`
  );
}

/** Face markup without the outer <svg>, so stickers can embed and animate it. */
export function faceMarkup({ tone = 'sunny', eyes = 'dot', mouth = 'smile', brows, cheeks = 'soft', inner = [], over = [], under = [] }) {
  return (
    under.join('') +
    bodyMarkup(tone, inner.join('')) +
    (cheeks === 'strong' ? CHEEKS_STRONG : cheeks ? CHEEKS : '') +
    (brows ? BROWS[brows] : '') +
    EYES[eyes] +
    MOUTHS[mouth] +
    over.join('')
  );
}

export const svg = (body, size = 64) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${body}</svg>`;

/* ---------- the set ---------- */

const FACES = [
  ['微笑', {}],
  ['开心', { eyes: 'happy', mouth: 'grin' }],
  ['大笑', { eyes: 'squint', mouth: 'laugh' }],
  ['笑哭', { eyes: 'happy', mouth: 'laugh', over: [X.tearsJoy()] }],
  ['害羞', { eyes: 'closed', mouth: 'small', cheeks: 'strong', over: [X.blush()] }],
  ['喜欢', { eyes: 'heart', mouth: 'grin' }],
  ['亲亲', { eyes: 'wink', mouth: 'kiss', over: [X.heart(52.5, 33)] }],
  ['调皮', { eyes: 'wink', mouth: 'tongue' }],
  ['酷', { eyes: 'glasses', mouth: 'smirk', cheeks: false }],
  ['得意', { eyes: 'half', mouth: 'smirk' }],
  ['坏笑', { eyes: 'half', brows: 'angry', mouth: 'sly' }],
  ['星星眼', { eyes: 'star', mouth: 'grin', over: [X.sparkles()] }],
  ['惊讶', { eyes: 'big', mouth: 'O', brows: 'raised' }],
  ['疑问', { eyes: 'dot', brows: 'raised', mouth: 'flat', over: [X.question()] }],
  ['思考', { eyes: 'up', mouth: 'wobble', over: [X.thinking()] }],
  ['无语', { eyes: 'line', mouth: 'flat', cheeks: false, inner: [X.shade(), X.lines()] }],
  ['尴尬', { eyes: 'dot', mouth: 'wavy', over: [X.sweat()] }],
  ['苦笑', { eyes: 'happy', mouth: 'smile', brows: 'sad', over: [X.sweat()] }],
  ['难过', { eyes: 'dot', brows: 'sad', mouth: 'frown', cheeks: false }],
  ['委屈', { eyes: 'teary', brows: 'sad', mouth: 'wobble', over: [X.tear()] }],
  ['大哭', { eyes: 'closed', brows: 'sad', mouth: 'wail', cheeks: false, inner: [X.streams()] }],
  ['惊恐', { tone: 'pale', eyes: 'wide', mouth: 'wail', cheeks: false, inner: [X.shade()], over: [X.sweat()] }],
  ['生气', { tone: 'angry', eyes: 'dot', brows: 'angry', mouth: 'frown', cheeks: false, over: [X.anger()] }],
  ['发怒', { tone: 'rage', eyes: 'dot', brows: 'angry', mouth: 'teeth', cheeks: false, over: [X.steam()] }],
  ['晕', { eyes: 'spiral', mouth: 'wavy' }],
  ['困', { eyes: 'sleepy', mouth: 'o', over: [X.zzz()] }],
  ['睡觉', { eyes: 'closed', mouth: 'small', over: [X.snot(), X.zzz()] }],
  ['嫌弃', { tone: 'sick', eyes: 'side', mouth: 'wavy', cheeks: false }],
  ['白眼', { eyes: 'roll', mouth: 'flat', cheeks: false }],
  ['吃瓜', { eyes: 'side', mouth: 'none', over: [X.melon()] }],
  ['奋斗', { eyes: 'dot', brows: 'firm', mouth: 'grin', inner: [X.headband()], over: [X.headbandKnot()] }],
  ['好的', { eyes: 'wink', mouth: 'smile', over: [X.check()] }],
  ['口罩', { eyes: 'dot', brows: 'sad', mouth: 'none', cheeks: false, over: [X.mask()] }],
  ['馋', { eyes: 'up', mouth: 'drool', over: [X.drool()] }],
  ['呆', { eyes: 'tiny', mouth: 'o', over: [X.sprout()] }],
  ['晕倒', { eyes: 'x', mouth: 'O', cheeks: false }],
  ['喵', { eyes: 'happy', mouth: 'cat' }],
];

/* ---------- symbols ---------- */

const gloss = (cx, cy, rx = 3.4, ry = 1.8, rot = -35) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".7" transform="rotate(${rot} ${cx} ${cy})"/>`;

const SYMBOLS = [
  ['爱心', shape(heartPath(32, 33, 3.6), RED, 2.6) + gloss(21, 23, 4.4, 2.4)],
  [
    '心碎',
    `<g transform="rotate(-8 30 40) translate(-2.5 0)">${shape('M32 20.2L27.6 28.6L34 34.4L28.6 42.4L32 49.2C9.6 35 4 26 12.8 17.8C19.2 11.8 27 13.6 32 20.2Z', RED, 2.6)}</g>` +
      `<g transform="rotate(8 34 40) translate(2.5 0)">${shape('M32 20.2C37 13.6 44.8 11.8 51.2 17.8C60 26 54.4 35 32 49.2L28.6 42.4L34 34.4L27.6 28.6Z', RED, 2.6)}</g>` +
      gloss(17.5, 23.5, 3.6, 2),
  ],
  [
    '赞',
    shape('M10 28.5H21.5V57H10Z', '#5b8cff', 2.4) +
      shape('M21.5 29.5L28.6 13.6Q30.4 8.4 34.4 10Q37.8 11.6 36.4 17.6L34.6 26.4H48.4Q53.6 26.4 52.6 31.6Q52.2 33.6 50.4 34.6Q53.6 36 52.6 40Q52 42 50 42.8Q52.6 44.6 51.4 48Q50.6 50 48.6 50.6Q50 52.8 48.6 54.8Q47.4 56.8 44.2 56.8H21.5Z', '#ffd45a', 2.4) +
      stroke('M38.4 34.6H50M38.4 42.8H49.6M38.4 50.6H48.2', 1.8) +
      gloss(30.6, 18, 2.6, 1.4, -65),
  ],
  [
    '鲜花',
    stroke('M32 34V59', 3, '#2f9e4f') +
      shape('M32 50Q22 50 19.5 41.5Q29 40.5 32 50Z', '#4cc56b', 2) +
      shape('M32 54Q42 54 44.5 45.5Q35 44.5 32 54Z', '#4cc56b', 2) +
      [0, 72, 144, 216, 288]
        .map((a) => `<ellipse cx="32" cy="15.4" rx="6.4" ry="8.6" fill="#ff8fb1" stroke="${INK}" stroke-width="2" transform="rotate(${a} 32 24.6)"/>`)
        .join('') +
      `<circle cx="32" cy="24.6" r="5.8" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>`,
  ],
  [
    '礼物',
    shape('M10 26H54V35H10Z', '#ff6b6b', 2.4) +
      shape('M13 35H51V57H13Z', '#ff8787', 2.4) +
      `<path d="M28 26H36V57H28Z" fill="#ffd23f" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
      shape('M32 25.5Q22 11 15.6 17.2Q12 22 32 25.5Z', '#ffd23f', 2.2) +
      shape('M32 25.5Q42 11 48.4 17.2Q52 22 32 25.5Z', '#ffd23f', 2.2),
  ],
  [
    '红包',
    `<rect x="13" y="7" width="38" height="50" rx="5.5" fill="#f2343a" stroke="${INK}" stroke-width="2.4"/>` +
      shape('M13 21Q32 34 51 21V12.5Q51 7 45.5 7H18.5Q13 7 13 12.5Z', '#d92128', 2.4) +
      `<circle cx="32" cy="28" r="7" fill="#ffd34d" stroke="${INK}" stroke-width="2.2"/>` +
      `<rect x="29.4" y="25.4" width="5.2" height="5.2" rx="1" fill="none" stroke="#d99a00" stroke-width="1.6"/>` +
      stroke('M20 46H44M24 51H40', 1.6, 'rgba(255,215,90,.75)'),
  ],
  [
    '蛋糕',
    shape('M11 40H53V56Q53 58 51 58H13Q11 58 11 56Z', '#ffc9a8', 2.4) +
      shape('M15 27H49V40H15Z', '#fff2e6', 2.4) +
      shape('M11 40Q16 45 21.5 40Q26.75 45 32 40Q37.25 45 42.5 40Q48 45 53 40', 'none', 2.2) +
      shape('M15 27Q20 32.5 24.5 27Q28.25 32.5 32 27Q35.75 32.5 39.5 27Q44 32.5 49 27', 'none', 2) +
      `<rect x="29.6" y="14.5" width="4.8" height="12.5" rx="1.4" fill="#7ec8ff" stroke="${INK}" stroke-width="2"/>` +
      shape('M32 4.6Q36.4 9.6 32 13Q27.6 9.6 32 4.6Z', '#ffb020', 1.8) +
      `<circle cx="22" cy="49" r="2" fill="#ff6b8a"/><circle cx="32" cy="50.5" r="2" fill="#ff6b8a"/><circle cx="42" cy="49" r="2" fill="#ff6b8a"/>`,
  ],
  [
    '奶茶',
    shape('M36 3.6L40.2 4.6L35.2 25L31 24Z', '#ff86ab', 2) +
      shape('M16.5 23H47.5L43.2 57.4Q32 60.4 20.8 57.4Z', '#f2d4ae', 2.4) +
      `<path d="M18.6 36H45.4L43.2 57.4Q32 60.4 20.8 57.4Z" fill="#c99566"/>` +
      shape('M16.5 23H47.5L43.2 57.4Q32 60.4 20.8 57.4Z', 'none', 2.4) +
      [
        [25, 52],
        [31, 54],
        [37.5, 52.5],
        [28, 47],
        [34.5, 47.6],
        [40.4, 47],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#3a2418"/><circle cx="${x - 0.8}" cy="${y - 0.8}" r=".7" fill="#fff" opacity=".7"/>`)
        .join('') +
      shape('M14 23Q32 9.5 50 23Z', '#fff', 2.4) +
      `<ellipse cx="25.6" cy="40.6" rx="1.8" ry="2.4" fill="${INK}"/><ellipse cx="38.4" cy="40.6" rx="1.8" ry="2.4" fill="${INK}"/>` +
      stroke('M29.6 42.4Q32 44.4 34.4 42.4', 1.8),
  ],
  [
    '咖啡',
    stroke('M24 15Q21 11.5 24 8.2Q27 5 24 1.8M32 15Q29 11.5 32 8.2Q35 5 32 1.8M40 15Q37 11.5 40 8.2Q43 5 40 1.8', 2, '#b9a59a') +
      `<ellipse cx="32" cy="55" rx="23" ry="5" fill="#d9d9e3" stroke="${INK}" stroke-width="2.2"/>` +
      shape('M48.5 28Q57.8 28 57.4 36Q57 44 47 42.6', 'none', 3) +
      shape('M13 21H51V36Q51 53 32 53Q13 53 13 36Z', '#fff', 2.4) +
      `<ellipse cx="32" cy="21.4" rx="18.6" ry="3.2" fill="#8a5a3c" stroke="${INK}" stroke-width="2"/>` +
      shape(heartPath(32, 37.6, 0.9), RED, 1.4),
  ],
  [
    '西瓜',
    `<path d="M6 22A26 26 0 0 0 58 22Z" fill="#3fbf5f"/><path d="M9.6 22A22.4 22.4 0 0 0 54.4 22Z" fill="#d6f5c9"/><path d="M11.8 22A20.2 20.2 0 0 0 52.2 22Z" fill="#ff5a64"/>` +
      shape('M6 22A26 26 0 0 0 58 22Z', 'none', 2.6) +
      [
        [22, 28],
        [32, 31],
        [42, 28],
        [27, 37],
        [37, 37],
        [32, 43],
      ]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.3" ry="2" fill="${INK}"/>`)
        .join(''),
  ],
  [
    '太阳',
    Array.from({ length: 8 }, (_, i) => `<rect x="30" y="2.5" width="4" height="9" rx="2" fill="#ffab2e" stroke="${INK}" stroke-width="1.6" transform="rotate(${i * 45} 32 32)"/>`).join('') +
      `<circle cx="32" cy="32" r="16.5" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/>` +
      stroke('M24.4 31Q27 27.4 29.6 31M34.4 31Q37 27.4 39.6 31', 2.2) +
      stroke('M27.4 36.4Q32 40.4 36.6 36.4', 2.2) +
      `<ellipse cx="22.5" cy="36" rx="2.6" ry="1.6" fill="${PINK}" opacity=".6"/><ellipse cx="41.5" cy="36" rx="2.6" ry="1.6" fill="${PINK}" opacity=".6"/>`,
  ],
  [
    '月亮',
    shape('M41 7.5A25 25 0 1 0 56.6 46.4A20.5 20.5 0 1 1 41 7.5Z', '#ffe27a', 2.4) +
      stroke('M17.6 33.4Q20.6 36.4 23.6 33.4', 2) +
      `<ellipse cx="17.4" cy="39.2" rx="2.6" ry="1.6" fill="${PINK}" opacity=".6"/>` +
      sparkle(46, 20, 4.2, '#ffe27a') +
      sparkle(54.6, 31, 2.8, '#ffe27a'),
  ],
  ['星星', shape(starPath(32, 34, 26, 12), '#ffc83d', 2.6) + gloss(25, 26, 3.6, 2)],
  [
    '炸弹',
    stroke('M42 18Q46 9 54 10', 2.4) +
      sparkle(55.6, 9, 5.2, '#ffb020') +
      `<rect x="35" y="15" width="10" height="8" rx="2" fill="#5a5f73" stroke="${INK}" stroke-width="2" transform="rotate(40 40 19)"/>` +
      `<circle cx="29" cy="38" r="19" fill="#3a3f52" stroke="${INK}" stroke-width="2.4"/>` +
      gloss(21, 30, 4.4, 2.6),
  ],
  [
    '便便',
    shape('M10 50Q10 41 20 41H44Q54 41 54 50Q54 58 44 58H20Q10 58 10 50Z', '#a8693a', 2.4) +
      shape('M15 41Q15 32 24 32H40Q49 32 49 41Z', '#b97842', 2.4) +
      shape('M21 32Q21 23 30 22.6Q31.6 15 38 13.4Q35.6 20 40 23.6Q43 26.4 43 32Z', '#c98a4f', 2.4) +
      `<ellipse cx="25" cy="47" rx="2.4" ry="3" fill="${INK}"/><ellipse cx="39" cy="47" rx="2.4" ry="3" fill="${INK}"/>` +
      stroke('M28 52.4Q32 55.6 36 52.4', 2) +
      gloss(24, 36.5, 3, 1.5, -10),
  ],
  [
    '666',
    `<rect x="4" y="16" width="56" height="32" rx="9" fill="#ff4d4f" stroke="${INK}" stroke-width="2.4"/>` +
      `<text x="32" y="40.6" text-anchor="middle" font-family="Arial Black,Arial,Helvetica,sans-serif" font-size="21" font-weight="900" fill="#fff" stroke="${INK}" stroke-width="1.2" paint-order="stroke" letter-spacing="-.5">666</text>`,
  ],
  [
    '福',
    `<rect x="14" y="14" width="36" height="36" rx="4" fill="#f2343a" stroke="${INK}" stroke-width="2.4" transform="rotate(45 32 32)"/>` +
      `<rect x="18.6" y="18.6" width="26.8" height="26.8" rx="2" fill="none" stroke="#ffd34d" stroke-width="1.4" transform="rotate(45 32 32)"/>` +
      `<text x="32" y="40.4" text-anchor="middle" font-family="'Kaiti SC','STKaiti','KaiTi','PingFang SC','Microsoft YaHei','Noto Sans CJK SC',serif" font-size="23" font-weight="700" fill="#ffd34d">福</text>`,
  ],
];

export const EMOJI_LIST = [
  ...FACES.map(([code, parts]) => ({ code, svg: svg(faceMarkup(parts)) })),
  ...SYMBOLS.map(([code, body]) => ({ code, svg: svg(body) })),
];

export { EYES, MOUTHS, X as EXTRAS, heart, sparkle, drop, stroke, shape, haloStroke };
