/**
 * Render the 「泡泡」 icon artwork (icon-art.mjs) to every PNG the Android app and the web app need.
 *   PLAYWRIGHT_MODULE=/path/to/playwright-core CHROMIUM=/path/to/chrome node resources/make-icons.mjs
 * The generated files are committed, so this only needs re-running after changing the artwork.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { background, fullIcon, mascot, monochrome, svg } from './icon-art.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(CLIENT, 'android/app/src/main/res');
const PUBLIC = path.join(CLIENT, 'public');

// Adaptive icons: 108dp canvas, of which only the central 72dp is visible.
const VISIBLE = 72 / 108;
const inset = (body) => `<g transform="translate(${(1024 * (1 - VISIBLE)) / 2} ${(1024 * (1 - VISIBLE)) / 2}) scale(${VISIBLE})">${body}</g>`;
const adaptiveBackground = svg(
  `<rect width="1024" height="1024" fill="#2fd88e"/>` +
    `<g transform="translate(-60 -60) scale(1.117)">${background({ bubbles: false })}</g>` +
    inset(background().replace(/<rect[^>]*url\(#bg\)[^>]*\/>/, '').replace(/<rect[^>]*url\(#glow\)[^>]*\/>/, '')),
);
const adaptiveForeground = svg(inset(mascot()));
const adaptiveMonochrome = svg(inset(monochrome()));

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

function splash(width, height) {
  const m = Math.min(width, height);
  const size = m * 0.3;
  const scale = size / 64;
  const x = (width - size) / 2 + size * 0.04;
  const y = height / 2 - size * 0.62;
  const face = mascot({ scale }).replace(/translate\(([\d.]+) ([\d.]+)\)/g, (_, a, b) => `translate(${Number(a) - (1024 - size) / 2 - size * 0.04 + x} ${Number(b) - (1024 - size) / 2 + y})`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2fdf7"/><stop offset="1" stop-color="#dff7eb"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#sp)"/>${face}
    <text x="${width / 2}" y="${y + size * 1.28}" text-anchor="middle" font-family="'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif" font-weight="700" font-size="${m * 0.075}" fill="#0f8a57" letter-spacing="${m * 0.01}">泡泡</text>
    <text x="${width / 2}" y="${y + size * 1.28 + m * 0.06}" text-anchor="middle" font-family="'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif" font-size="${m * 0.03}" fill="#5aa886">连接你在乎的每一个人</text>
  </svg>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
async function render(svgText, width, height, file, transparent = false) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img style="display:block;width:${width}px;height:${height}px" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}"></body></html>`,
  );
  await page.waitForFunction(() => document.images[0].complete);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: transparent });
}

for (const [density, k] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${density}`);
  await render(fullIcon('squircle'), 48 * k, 48 * k, path.join(dir, 'ic_launcher.png'), true);
  await render(fullIcon('round'), 48 * k, 48 * k, path.join(dir, 'ic_launcher_round.png'), true);
  await render(adaptiveForeground, 108 * k, 108 * k, path.join(dir, 'ic_launcher_foreground.png'), true);
  await render(adaptiveBackground, 108 * k, 108 * k, path.join(dir, 'ic_launcher_background.png'));
  await render(adaptiveMonochrome, 108 * k, 108 * k, path.join(dir, 'ic_launcher_monochrome.png'), true);
}

for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
  const file = path.join(RES, dir, 'splash.png');
  if (!fs.existsSync(file)) continue;
  const buf = fs.readFileSync(file);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  await render(splash(width, height), width, height, file);
}

// Web / PWA
fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), fullIcon('squircle'));
await render(fullIcon('squircle'), 192, 192, path.join(PUBLIC, 'icons/icon-192.png'), true);
await render(fullIcon('squircle'), 512, 512, path.join(PUBLIC, 'icons/icon-512.png'), true);
await render(svg(background() + mascot({ scale: 8 })), 512, 512, path.join(PUBLIC, 'icons/icon-maskable-512.png'));
await render(fullIcon('square'), 180, 180, path.join(PUBLIC, 'icons/apple-touch-icon.png'));
await render(fullIcon('squircle'), 1024, 1024, path.join(CLIENT, 'resources/icon-1024.png'), true);

await browser.close();
console.log('icons written');
