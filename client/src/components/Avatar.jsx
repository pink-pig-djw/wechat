const PALETTE = ['#5b8ff9', '#5ad8a6', '#f6bd16', '#e8684a', '#6dc8ec', '#9270ca', '#ff9d4d', '#269a99', '#ff99c3', '#7f8c9a'];

function colorFor(seed) {
  const n = typeof seed === 'number' ? seed : [...String(seed ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTE[Math.abs(n) % PALETTE.length];
}

function initial(name) {
  const first = [...(name ?? '').trim()][0] ?? '?';
  return first.toUpperCase();
}

/** Rounded-square avatar: the uploaded image, or a coloured tile with the first character of the name. */
export function Avatar({ src, name, seed, size = 40, radius, className = '', online, onClick, title }) {
  const style = { width: size, height: size, borderRadius: radius ?? Math.max(4, Math.round(size * 0.12)) };
  const content = src ? (
    <img src={src} alt="" loading="lazy" draggable="false" />
  ) : (
    <span style={{ background: colorFor(seed ?? name), fontSize: Math.round(size * 0.42) }}>{initial(name)}</span>
  );
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`avatar ${className}`}
      style={style}
      onClick={onClick}
      title={title}
      aria-label={onClick ? `${name ?? ''}的头像` : undefined}
    >
      {content}
      {online && <i className="avatar-online" aria-label="在线" />}
    </Tag>
  );
}

/** WeChat-style group avatar: up to nine member tiles; the incomplete row sits on top, centred. */
export function GroupAvatar({ members = [], src, size = 40, className = '' }) {
  if (src) return <Avatar src={src} size={size} className={className} />;
  const list = members.slice(0, 9);
  const cols = list.length <= 1 ? 1 : list.length <= 4 ? 2 : 3;
  const gap = Math.max(1, Math.round(size / 30));
  const tile = (size - gap * (cols + 1)) / cols;
  return (
    <span
      className={`avatar group-avatar ${className}`}
      style={{ width: size, height: size, padding: gap, gap, borderRadius: Math.max(4, Math.round(size * 0.12)) }}
    >
      {list.map((m) => (
        <Avatar
          key={m.id}
          src={m.avatar}
          name={m.nickname}
          seed={m.id}
          size={list.length === 1 ? tile * 0.7 : tile}
          radius={Math.max(1, Math.round(tile * 0.08))}
        />
      ))}
    </span>
  );
}

export function ConversationAvatar({ conversation, size = 40 }) {
  if (!conversation) return <Avatar size={size} />;
  if (conversation.type === 'group') {
    return <GroupAvatar members={conversation.memberPreview} src={conversation.avatar} size={size} />;
  }
  return <Avatar src={conversation.avatar} name={conversation.name} seed={conversation.peerId} size={size} />;
}
