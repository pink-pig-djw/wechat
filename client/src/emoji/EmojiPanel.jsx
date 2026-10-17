import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { EMOJIS, EMOJI_MAP, STICKERS, recentEmojis, rememberEmoji } from './index.js';

/**
 * 「泡泡」表情面板: small emoji (inserted as `[代码]` text) and, when `onSticker` is given,
 * a tab of animated stickers that send immediately.
 */
export function EmojiPanel({ onPick, onSticker, className = '' }) {
  const [tab, setTab] = useState('emoji');
  const [recent, setRecent] = useState(recentEmojis);

  const pick = (emoji) => {
    rememberEmoji(emoji.code);
    setRecent(recentEmojis());
    onPick(emoji.token);
  };

  const grid = (list) => (
    <div className="emoji-grid">
      {list.map((e) => (
        <button key={e.code} type="button" className="emoji-cell" title={e.code} aria-label={e.code} onClick={() => pick(e)}>
          <img src={e.src} alt="" draggable="false" />
        </button>
      ))}
    </div>
  );

  return (
    // Keep focus in the text box while clicking emoji.
    <div className={`emoji-panel ${className}`} onMouseDown={(e) => e.preventDefault()}>
      <div className="emoji-scroll">
        {tab === 'emoji' ? (
          <>
            {recent.length > 0 && (
              <>
                <div className="emoji-section">最近使用</div>
                {grid(recent)}
              </>
            )}
            <div className="emoji-section">泡泡表情</div>
            {grid(EMOJIS)}
          </>
        ) : (
          <>
            <div className="emoji-section">泡泡动态表情 · 点击直接发送</div>
            <div className="sticker-grid">
              {STICKERS.map((s) => (
                <button key={s.id} type="button" className="sticker-cell" title={s.name} onClick={() => onSticker(s)}>
                  <img src={s.src} alt={s.name} draggable="false" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="emoji-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'emoji'} aria-label="泡泡表情" className={tab === 'emoji' ? 'active' : ''} onClick={() => setTab('emoji')}>
          <img src={EMOJI_MAP.get('微笑').src} alt="" />
        </button>
        {onSticker && (
          <button type="button" role="tab" aria-selected={tab === 'sticker'} aria-label="动态表情" className={tab === 'sticker' ? 'active' : ''} onClick={() => setTab('sticker')}>
            <img src={STICKERS[0].src} alt="" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Emoji toggle + popover panel, for small inputs (moment posts and comments). */
export function EmojiButton({ onPick, size = 20 }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <span className="emoji-button-wrap" ref={wrap}>
      <button
        type="button"
        className={`icon-btn ${open ? 'active' : ''}`}
        aria-label="表情"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <Smile size={size} strokeWidth={1.7} />
      </button>
      {open && <EmojiPanel className="emoji-popover" onPick={onPick} />}
    </span>
  );
}
