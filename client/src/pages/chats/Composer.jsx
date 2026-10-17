import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Contact, FolderOpen, Image as ImageIcon, Paperclip, PlusCircle, Smile, X } from 'lucide-react';
import { getState, setDraft, useStore } from '../../lib/store.js';
import { sendCard, sendFile, sendImage, sendSticker, sendText } from '../../lib/actions.js';
import { emitTyping, resetTyping } from '../../lib/socket.js';
import { usePrefs } from '../../lib/prefs.js';
import { useIsMobile } from '../../lib/hooks.js';
import { toast, toastError } from '../../lib/ui.js';
import { Avatar } from '../../components/Avatar.jsx';
import { UserPicker } from '../../components/Pickers.jsx';
import { EmojiPanel } from '../../emoji/EmojiPanel.jsx';
import { EmojiText } from '../../emoji/EmojiText.jsx';
import { tokenBefore } from '../../emoji/index.js';

const MAX_LENGTH = 5000;

export function sendFiles(conversationId, files) {
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) {
      toast(`“${file.name}”超过 20MB，无法发送`, { type: 'error' });
      continue;
    }
    const isImage = /^image\/(jpeg|png|gif|webp)$/.test(file.type);
    (isImage ? sendImage(conversationId, file) : sendFile(conversationId, file)).catch(() => {});
  }
}

function MentionList({ candidates, index, onPick }) {
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  return (
    <div className="mention-list" ref={listRef} role="listbox" onMouseDown={(e) => e.preventDefault()}>
      {candidates.map((c, i) => (
        <button key={c.id} type="button" role="option" aria-selected={i === index} className={i === index ? 'active' : ''} onClick={() => onPick(c)}>
          {c.id === 'all' ? <span className="mention-all">@</span> : <Avatar src={c.avatar} name={c.nickname} seed={c.id} size={26} />}
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  );
}

export const Composer = forwardRef(function Composer({ conversation, detail, quote, onClearQuote, onSent }, ref) {
  const id = conversation.id;
  const isMobile = useIsMobile();
  const enterToSend = usePrefs((s) => s.enterToSend);
  const friends = useStore((s) => s.friends);
  const meId = useStore((s) => s.me.id);
  const [text, setText] = useState(() => getState().drafts[id] ?? '');
  const [panel, setPanel] = useState(null); // 'emoji' | 'more' | null
  const [mention, setMention] = useState(null); // { query, start }
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cardPicker, setCardPicker] = useState(false);
  const textareaRef = useRef(null);
  const imageInput = useRef(null);
  const fileInput = useRef(null);
  const mentionsRef = useRef(new Map());
  const textRef = useRef(text);
  textRef.current = text;

  useImperativeHandle(ref, () => ({
    setText(value) {
      setText(value);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        el?.focus();
        el?.setSelectionRange(value.length, value.length);
      });
    },
    focus: () => textareaRef.current?.focus(),
  }));

  // Keep the draft when leaving the chat.
  useEffect(() => () => setDraft(id, textRef.current.trim() ? textRef.current : ''), [id]);

  useEffect(() => {
    if (!isMobile) textareaRef.current?.focus();
  }, [isMobile, quote]);

  // Mobile input grows with its content.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el || !isMobile) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text, isMobile]);

  // Close the desktop emoji popover on outside click.
  useEffect(() => {
    if (panel !== 'emoji' || isMobile) return undefined;
    const close = (e) => {
      if (!e.target.closest('.emoji-panel, .emoji-toggle')) setPanel(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [panel, isMobile]);

  const isGroup = conversation.type === 'group';
  const candidates = useMemo(() => {
    if (!mention || !isGroup) return [];
    const q = mention.query.toLowerCase();
    const members = (detail?.members ?? [])
      .filter((m) => m.id !== meId)
      .map((m) => ({ id: m.id, nickname: m.nickname, avatar: m.avatar, name: friends[m.id]?.remark || m.alias || m.nickname }))
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.nickname.toLowerCase().includes(q));
    const all = conversation.myRole === 'owner' && (!q || '所有人'.includes(q)) ? [{ id: 'all', name: '所有人' }] : [];
    return [...all, ...members];
  }, [mention, isGroup, detail, meId, friends, conversation.myRole]);

  function detectMention(value, caret) {
    if (!isGroup) return;
    const match = /@([^\s@]{0,20})$/.exec(value.slice(0, caret));
    if (match) {
      setMention({ query: match[1], start: caret - match[0].length });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  }

  function insertAtCaret(insert, replaceFrom) {
    const el = textareaRef.current;
    const start = replaceFrom ?? el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + insert + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + insert.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function pickMention(c) {
    mentionsRef.current.set(c.name, c.id);
    insertAtCaret(`@${c.name} `, mention.start);
    setMention(null);
  }

  function pickSticker(sticker) {
    sendSticker(id, sticker).catch(() => {});
    if (!isMobile) setPanel(null);
    onSent?.();
  }

  function send() {
    if (!text.trim()) return;
    if ([...text].length > MAX_LENGTH) {
      toast(`消息不能超过 ${MAX_LENGTH} 个字符`, { type: 'error' });
      return;
    }
    const mentions = [...mentionsRef.current.entries()]
      .filter(([name]) => text.includes(`@${name}`))
      .map(([, mid]) => mid);
    sendText(id, text, { mentions, quote }).catch(() => {});
    resetTyping();
    setText('');
    mentionsRef.current.clear();
    onClearQuote();
    setMention(null);
    if (panel === 'emoji' && !isMobile) setPanel(null);
    onSent?.();
  }

  function onKeyDown(e) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (mention && candidates.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setMentionIndex((i) => (i + delta + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(candidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Backspace') {
      const el = e.currentTarget;
      const caret = el.selectionStart;
      const length = el.selectionEnd === caret ? tokenBefore(text, caret) : 0;
      if (length) {
        // Delete a whole [表情] token at once.
        e.preventDefault();
        setText(text.slice(0, caret - length) + text.slice(caret));
        requestAnimationFrame(() => el.setSelectionRange(caret - length, caret - length));
        return;
      }
    }
    if (e.key === 'Enter') {
      const modifier = e.ctrlKey || e.metaKey;
      if ((enterToSend && !e.shiftKey && !modifier) || (!enterToSend && modifier)) {
        e.preventDefault();
        send();
      }
    }
  }

  function onChange(e) {
    const value = e.target.value;
    setText(value);
    detectMention(value, e.target.selectionStart);
    if (!isGroup && value) emitTyping(id);
  }

  function onPaste(e) {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) {
      e.preventDefault();
      sendFiles(id, files);
    }
  }

  const onFilesChosen = (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) sendFiles(id, files);
    setPanel(null);
  };

  const togglePanel = (name) => {
    setPanel((p) => (p === name ? null : name));
    if (isMobile && panel !== name) textareaRef.current?.blur();
  };

  const tools = (
    <>
      <button type="button" className={`icon-btn emoji-toggle ${panel === 'emoji' ? 'active' : ''}`} aria-label="表情" title="表情" onClick={() => togglePanel('emoji')}>
        <Smile size={isMobile ? 26 : 21} strokeWidth={1.6} />
      </button>
      {!isMobile && (
        <>
          <button type="button" className="icon-btn" aria-label="发送图片" title="发送图片" onClick={() => imageInput.current.click()}>
            <ImageIcon size={21} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-btn" aria-label="发送文件" title="发送文件" onClick={() => fileInput.current.click()}>
            <Paperclip size={20} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-btn" aria-label="发送名片" title="发送名片" onClick={() => setCardPicker(true)}>
            <Contact size={21} strokeWidth={1.6} />
          </button>
        </>
      )}
    </>
  );

  return (
    <div className={`composer ${isMobile ? 'composer-mobile' : 'composer-desktop'}`}>
      {mention && candidates.length > 0 && <MentionList candidates={candidates} index={mentionIndex} onPick={pickMention} />}
      {!isMobile && (
        <div className="composer-toolbar">
          {tools}
          {panel === 'emoji' && <EmojiPanel className="emoji-popover" onPick={(token) => insertAtCaret(token)} onSticker={pickSticker} />}
        </div>
      )}
      {quote && (
        <div className="composer-quote">
          <span className="composer-quote-text">
            {quote.senderName}：<EmojiText text={quote.text} />
          </span>
          <button type="button" className="icon-btn" aria-label="取消引用" onClick={onClearQuote}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="composer-input-row">
        <textarea
          ref={textareaRef}
          className="composer-input"
          value={text}
          rows={1}
          placeholder={isMobile ? '' : enterToSend ? '输入消息，Enter 发送，Shift + Enter 换行' : '输入消息，Ctrl + Enter 发送'}
          enterKeyHint="send"
          aria-label="输入消息"
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => isMobile && setPanel(null)}
          onClick={(e) => detectMention(text, e.target.selectionStart)}
        />
        {isMobile && (
          <>
            {tools}
            {text.trim() ? (
              <button type="button" className="btn btn-primary btn-send" onMouseDown={(e) => e.preventDefault()} onClick={send}>
                发送
              </button>
            ) : (
              <button type="button" className={`icon-btn ${panel === 'more' ? 'active' : ''}`} aria-label="更多功能" onClick={() => togglePanel('more')}>
                <PlusCircle size={26} strokeWidth={1.6} />
              </button>
            )}
          </>
        )}
      </div>
      {!isMobile && (
        <div className="composer-footer">
          <button type="button" className="btn btn-send" disabled={!text.trim()} onClick={send}>
            发送
          </button>
        </div>
      )}
      {isMobile && panel === 'emoji' && <EmojiPanel onPick={(token) => insertAtCaret(token)} onSticker={pickSticker} />}
      {isMobile && panel === 'more' && (
        <div className="more-panel">
          <button type="button" onClick={() => imageInput.current.click()}>
            <span className="more-icon"><ImageIcon size={26} strokeWidth={1.5} /></span>
            相册
          </button>
          <button type="button" onClick={() => fileInput.current.click()}>
            <span className="more-icon"><FolderOpen size={26} strokeWidth={1.5} /></span>
            文件
          </button>
          <button type="button" onClick={() => setCardPicker(true)}>
            <span className="more-icon"><Contact size={26} strokeWidth={1.5} /></span>
            名片
          </button>
        </div>
      )}
      <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden onChange={onFilesChosen} />
      <input ref={fileInput} type="file" multiple hidden onChange={onFilesChosen} />
      {cardPicker && (
        <UserPicker
          title="选择要推荐的朋友"
          single
          onClose={() => setCardPicker(false)}
          onConfirm={async ([userId]) => {
            const user = friends[userId];
            setCardPicker(false);
            setPanel(null);
            await sendCard(id, user).catch(toastError);
          }}
        />
      )}
    </div>
  );
});
