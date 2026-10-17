/**
 * App icon artwork for 「泡泡」, built from the same parts as the emoji set (src/emoji/art.js).
 * Every layer is a 1024×1024 SVG string; scripts/make-icons.mjs renders them to PNG.
 */
import { BODY_PATH, faceMarkup } from '../src/emoji/art.js';

const S = 1024;

/** Mint→green backdrop with soft light and a few floating bubbles. */
export function background({ bubbles = true } = {}) {
  const bubble = (cx, cy, r, o = 0.34) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" fill-opacity="${o * 0.35}" stroke="#fff" stroke-opacity="${o}" stroke-width="${r * 0.08}"/>` +
    `<path d="M${cx - r * 0.55} ${cy - r * 0.15}A${r * 0.6} ${r * 0.6} 0 0 1 ${cx - r * 0.1} ${cy - r * 0.6}" fill="none" stroke="#fff" stroke-opacity="${o * 2.2}" stroke-width="${r * 0.12}" stroke-linecap="round"/>`;
  return (
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ff5c6"/><stop offset=".55" stop-color="#2fd88e"/><stop offset="1" stop-color="#0fb975"/></linearGradient>` +
    `<radialGradient id="glow" cx=".28" cy=".2" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect width="${S}" height="${S}" fill="url(#bg)"/>` +
    `<rect width="${S}" height="${S}" fill="url(#glow)"/>` +
    (bubbles ? bubble(800, 205, 70) + bubble(905, 360, 34, 0.24) + bubble(170, 820, 54, 0.22) + bubble(255, 930, 24, 0.2) : '')
  );
}

/**
 * The mascot, centred. `scale` is the size of the 64-unit emoji grid in px.
 * A soft shadow sits under it so it lifts off the background.
 */
export function mascot({ scale = 9.8, dy = 0 } = {}) {
  const size = 64 * scale;
  const x = (S - size) / 2 + 0.04 * size; // the tail sticks out left, so nudge right to look centred
  const y = (S - size) / 2 + dy;
  const face = faceMarkup({ eyes: 'dot', mouth: 'grin', cheeks: 'strong' })
    // ids inside the face must not clash with the background's
    .replaceAll('id="g"', 'id="mg"').replaceAll('url(#g)', 'url(#mg)')
    .replaceAll('id="c"', 'id="mc"').replaceAll('url(#c)', 'url(#mc)')
    .replaceAll('id="shade"', 'id="mshade"').replaceAll('url(#shade)', 'url(#mshade)');
  return (
    `<defs><filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.8"/></filter></defs>` +
    // Blur is in emoji units (inside the scaled group), so keep it small.
    `<g transform="translate(${x} ${y + scale * 3.2}) scale(${scale})" opacity=".3" filter="url(#soft)"><path d="${BODY_PATH}" fill="#0a5c3a"/></g>` +
    `<g transform="translate(${x} ${y}) scale(${scale})">${face}</g>`
  );
}

/** Single-colour silhouette for Android 13+ themed icons (only alpha matters). */
export function monochrome({ scale = 9.8 } = {}) {
  const size = 64 * scale;
  const x = (S - size) / 2 + 0.04 * size;
  const y = (S - size) / 2;
  const cut = '#000';
  return (
    `<defs><mask id="m"><rect width="${S}" height="${S}" fill="#fff"/>` +
    `<g transform="translate(${x} ${y}) scale(${scale})" fill="${cut}">` +
    `<ellipse cx="23" cy="28" rx="3.3" ry="4.3"/><ellipse cx="41" cy="28" rx="3.3" ry="4.3"/>` +
    `<path d="M24.5 36Q32 38 39.5 36Q39 46.5 32 46.5Q25 46.5 24.5 36Z"/></g></mask></defs>` +
    `<g mask="url(#m)"><g transform="translate(${x} ${y}) scale(${scale})"><path d="${BODY_PATH}" fill="#fff"/></g></g>`
  );
}

export const svg = (body, shape = 'square') => {
  const clip =
    shape === 'round'
      ? `<clipPath id="shape"><circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}"/></clipPath>`
      : shape === 'squircle'
        ? `<clipPath id="shape"><rect width="${S}" height="${S}" rx="${S * 0.225}"/></clipPath>`
        : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${clip ? `<defs>${clip}</defs><g clip-path="url(#shape)">${body}</g>` : body}</svg>`;
};

export const fullIcon = (shape) => svg(background() + mascot(), shape);
