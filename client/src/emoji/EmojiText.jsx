import { Fragment } from 'react';
import { splitEmoji } from './index.js';

const URL_RE = /(https?:\/\/[^\s<>"'，。！？、）)[\]]+)/g;

function linkify(text, keyPrefix) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={`${keyPrefix}-${i}`} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
    ),
  );
}

/** Text with `[微笑]`-style tokens shown as 泡泡 emoji; optionally turns URLs into links. */
export function EmojiText({ text, links = false, className }) {
  if (!text) return null;
  const parts = splitEmoji(text);
  const content = parts.map((part, i) =>
    typeof part === 'string' ? (
      links ? linkify(part, i) : <Fragment key={i}>{part}</Fragment>
    ) : (
      <img key={i} className="emoji-inline" src={part.src} alt={part.token} title={part.code} draggable="false" />
    ),
  );
  return className ? <span className={className}>{content}</span> : content;
}
