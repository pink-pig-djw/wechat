import { memo } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import { Avatar } from '../../components/Avatar.jsx';
import { Spinner } from '../../components/ui.jsx';
import { formatFileSize, systemText } from '../../lib/format.js';
import { useContextAction } from '../../lib/hooks.js';
import { openViewer } from '../../lib/ui.js';
import { isNative, openExternal } from '../../lib/native.js';
import { EmojiText } from '../../emoji/EmojiText.jsx';
import { STICKER_MAP, isEmojiOnly } from '../../emoji/index.js';

export function imageBox(width, height, max = 220) {
  if (!width || !height) return { width: 160, height: 160 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(60, Math.round(width * scale)),
    height: Math.max(60, Math.round(height * scale)),
  };
}

const FILE_COLORS = {
  pdf: '#e5534b',
  doc: '#3a7bd5',
  docx: '#3a7bd5',
  xls: '#21a366',
  xlsx: '#21a366',
  csv: '#21a366',
  ppt: '#e8742d',
  pptx: '#e8742d',
  zip: '#8e6cd8',
  rar: '#8e6cd8',
  '7z': '#8e6cd8',
  mp3: '#e0a01b',
  mp4: '#d6417d',
  txt: '#7f8c9a',
};

export function FileIcon({ name }) {
  const ext = (name?.split('.').pop() ?? '').toLowerCase();
  const known = name?.includes('.') && ext.length <= 4;
  return (
    <span className="file-icon" style={{ background: FILE_COLORS[ext] ?? '#8a96a3' }}>
      {known ? ext.toUpperCase() : <FileText size={20} />}
    </span>
  );
}

function Bubble({ message, contextProps, onOpenCard }) {
  const { type, content } = message;
  if (type === 'image') {
    const box = imageBox(content.width, content.height);
    return (
      <button
        type="button"
        className="bubble bubble-image"
        style={box}
        onClick={() => content.url && !message.status && openViewer([content.url])}
        aria-label="查看图片"
        {...contextProps}
      >
        <img src={content.url} alt="图片" draggable="false" />
        {message.status === 'sending' && message.progress != null && (
          <span className="upload-mask">{Math.round(message.progress * 100)}%</span>
        )}
      </button>
    );
  }
  if (type === 'file') {
    const inner = (
      <>
        <span className="file-info">
          <span className="file-name">{content.name}</span>
          <span className="file-size">{formatFileSize(content.size)}</span>
        </span>
        <FileIcon name={content.name} />
        {message.status === 'sending' && message.progress != null && (
          <span className="file-progress" style={{ '--progress': `${Math.round(message.progress * 100)}%` }} />
        )}
      </>
    );
    return content.url && !message.status ? (
      <a
        className="bubble bubble-file"
        href={content.url}
        download={content.name}
        onClick={(e) => {
          if (!isNative) return;
          e.preventDefault();
          openExternal(content.url);
        }}
        {...contextProps}
      >
        {inner}
      </a>
    ) : (
      <div className="bubble bubble-file" {...contextProps}>
        {inner}
      </div>
    );
  }
  if (type === 'card') {
    return (
      <button type="button" className="bubble bubble-card" onClick={() => onOpenCard(content.userId)} {...contextProps}>
        <span className="card-main">
          <Avatar src={content.avatar} name={content.nickname} seed={content.userId} size={42} />
          <span className="card-name">{content.nickname}</span>
        </span>
        <span className="card-foot">个人名片</span>
      </button>
    );
  }
  if (type === 'sticker') {
    const sticker = STICKER_MAP.get(content?.id);
    return (
      <div className="bubble bubble-sticker" {...contextProps}>
        {sticker ? <img src={sticker.src} alt={`[${sticker.name}]`} draggable="false" /> : <span className="sticker-missing">[动画表情]</span>}
      </div>
    );
  }
  const text = content ?? '';
  return (
    <div className={`bubble bubble-text ${isEmojiOnly(text) ? 'jumbo' : ''}`} {...contextProps}>
      <EmojiText text={text} links />
    </div>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  mine,
  showName,
  senderName,
  meId,
  nameOf,
  onContext,
  onAvatar,
  onRetry,
  onReEdit,
  onOpenCard,
}) {
  const contextProps = useContextAction((pos) => onContext(message, pos));

  if (message.type === 'system') {
    return <div className="msg-notice">{systemText(message.content, meId, nameOf)}</div>;
  }
  if (message.recalled) {
    return (
      <div className="msg-notice">
        {mine ? '你' : `"${senderName}"`}撤回了一条消息
        {mine && message.recalledText && (
          <button type="button" className="link-btn" onClick={() => onReEdit(message.recalledText)}>
            重新编辑
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`msg ${mine ? 'msg-mine' : ''}`} data-id={message.id}>
      <Avatar
        src={message.sender?.avatar}
        name={message.sender?.nickname}
        seed={message.senderId}
        size={38}
        className="msg-avatar"
        onClick={() => onAvatar(message.senderId)}
      />
      <div className="msg-body">
        {showName && <div className="msg-name">{senderName}</div>}
        <div className="msg-row">
          <Bubble message={message} contextProps={contextProps} onOpenCard={onOpenCard} />
          {message.status === 'sending' && message.type === 'text' && (
            <span className="msg-status">
              <Spinner size={14} />
            </span>
          )}
          {message.status === 'failed' && (
            <button
              type="button"
              className="msg-status msg-failed"
              aria-label="发送失败，点击重发"
              title={message.error ?? '发送失败'}
              onClick={() => onRetry(message)}
            >
              <AlertCircle size={20} />
            </button>
          )}
        </div>
        {message.quote && (
          <div className="msg-quote">
            <span className="msg-quote-text">
              {message.quote.senderName}：<EmojiText text={message.quote.text} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
