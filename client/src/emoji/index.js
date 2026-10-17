import { EMOJI_LIST } from './art.js';
import { STICKER_LIST } from './stickers.js';

const toDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Small emoji, written into text as `[微笑]`. */
export const EMOJIS = EMOJI_LIST.map(({ code, svg }) => ({ code, token: `[${code}]`, src: toDataUri(svg) }));
export const EMOJI_MAP = new Map(EMOJIS.map((e) => [e.code, e]));

/** Animated stickers, sent as their own message type. */
export const STICKERS = STICKER_LIST.map(({ id, name, svg }) => ({ id, name, src: toDataUri(svg) }));
export const STICKER_MAP = new Map(STICKERS.map((s) => [s.id, s]));

const TOKEN_RE = /\[([^[\]\s]{1,4})\]/g;

/** Split text into plain strings and emoji objects. Unknown `[xx]` stays as text. */
export function splitEmoji(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const emoji = EMOJI_MAP.get(match[1]);
    if (!emoji) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(emoji);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** If the caret sits right after an emoji token, return that token's length (for whole-token backspace). */
export function tokenBefore(text, caret) {
  const match = /\[([^[\]\s]{1,4})\]$/.exec(text.slice(0, caret));
  return match && EMOJI_MAP.has(match[1]) ? match[0].length : 0;
}

/** True when the text is only 1–3 emoji (rendered larger, like a "jumbo" emoji). */
export function isEmojiOnly(text) {
  const parts = splitEmoji(text.trim());
  return parts.length > 0 && parts.length <= 3 && parts.every((p) => typeof p !== 'string');
}

const RECENT_KEY = 'weiliao.recentEmoji';

export function recentEmojis() {
  try {
    const codes = JSON.parse(localStorage.getItem(RECENT_KEY)) ?? [];
    return codes.map((c) => EMOJI_MAP.get(c)).filter(Boolean);
  } catch {
    return [];
  }
}

export function rememberEmoji(code) {
  try {
    const codes = [code, ...(JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []).filter((c) => c !== code)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(codes));
  } catch {
    // ignore
  }
}
