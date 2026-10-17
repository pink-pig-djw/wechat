const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const pad = (n) => String(n).padStart(2, '0');

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayDiff(ts, now = new Date()) {
  return Math.round((startOfDay(now) - startOfDay(new Date(ts))) / 86_400_000);
}

const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Chat list timestamp: 14:05 / 昨天 / 星期三 / 24/3/8 */
export function formatListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = dayDiff(ts);
  if (diff <= 0) return hm(d);
  if (diff === 1) return '昨天';
  if (diff < 7) return WEEKDAYS[d.getDay()];
  return `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** Separator inside a conversation: 14:05 / 昨天 14:05 / 星期三 14:05 / 3月8日 14:05 / 2023年3月8日 14:05 */
export function formatMessageTime(ts) {
  const d = new Date(ts);
  const diff = dayDiff(ts);
  if (diff <= 0) return hm(d);
  if (diff === 1) return `昨天 ${hm(d)}`;
  if (diff < 7) return `${WEEKDAYS[d.getDay()]} ${hm(d)}`;
  if (d.getFullYear() === new Date().getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${hm(d)}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm(d)}`;
}

/** Moments: 刚刚 / 5分钟前 / 3小时前 / 昨天 / 3天前 / 3月8日 */
export function formatRelative(ts) {
  const delta = Date.now() - ts;
  if (delta < 60_000) return '刚刚';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}分钟前`;
  const diff = dayDiff(ts);
  if (diff === 0) return `${Math.floor(delta / 3_600_000)}小时前`;
  if (diff === 1) return '昨天';
  if (diff < 30) return `${diff}天前`;
  const d = new Date(ts);
  if (d.getFullYear() === new Date().getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/**
 * Render a structured system notice from one viewer's perspective.
 * `nameOf(id, fallback)` lets the caller apply remarks/aliases.
 */
export function systemText(content, meId, nameOf = (_id, fallback) => fallback) {
  if (!content) return '';
  const who = (p) => (p.id === meId ? '你' : `"${nameOf(p.id, p.name)}"`);
  const actor = content.actor ? who(content.actor) : '';
  const targets = (content.targets ?? []).map(who).join('、');
  switch (content.event) {
    case 'friend_added':
      return '你们已经成为好友，现在可以开始聊天了';
    case 'group_create':
    case 'group_invite':
      return `${actor}邀请${targets}加入了群聊`;
    case 'group_join':
      return `${actor}通过群号加入了群聊`;
    case 'group_kick':
      return `${actor}将${targets}移出了群聊`;
    case 'group_leave':
      return `${actor}退出了群聊`;
    case 'group_rename':
      return content.name ? `${actor}修改群名为“${content.name}”` : `${actor}移除了群名称`;
    case 'group_owner':
      return `${actor}已将群主转让给${targets}`;
    case 'group_dissolve':
      return '该群聊已被群主解散';
    default:
      return content.text ?? '';
  }
}

export function messagePreview(message) {
  if (!message) return '';
  switch (message.type) {
    case 'text':
      return message.content;
    case 'image':
      return '[图片]';
    case 'file':
      return `[文件] ${message.content?.name ?? ''}`;
    case 'card':
      return `[个人名片] ${message.content?.nickname ?? ''}`;
    case 'sticker':
      return '[动画表情]';
    default:
      return '';
  }
}

export function mentionsUser(message, userId) {
  return Array.isArray(message.mentions) && message.mentions.some((m) => m === 'all' || m === userId);
}

export function genderLabel(g) {
  return g === 1 ? '男' : g === 2 ? '女' : '';
}

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
