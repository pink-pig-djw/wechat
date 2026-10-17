import { pinyin } from 'pinyin-pro';
import { parseJson } from './util.js';

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatar: row.avatar ?? null,
    signature: row.signature ?? '',
    gender: row.gender ?? 0,
    region: row.region ?? '',
  };
}

export function selfUser(row) {
  return {
    ...publicUser(row),
    momentsCover: row.moments_cover ?? null,
    createdAt: row.created_at,
  };
}

/** Pinyin key + index letter used for the A-Z contact list. */
export function nameIndex(name) {
  const syllables = pinyin(name || '', { toneType: 'none', type: 'array' });
  const key = syllables.join('').toLowerCase();
  const first = key.charAt(0).toUpperCase();
  return { pinyin: key, initial: /^[A-Z]$/.test(first) ? first : '#' };
}

export function areFriends(db, a, b) {
  return !!db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(a, b);
}

export function friendIds(db, userId) {
  return db.prepare('SELECT friend_id FROM friendships WHERE user_id = ?').pluck().all(userId);
}

export function friendView(db, userId, friendId, realtime) {
  const row = db
    .prepare(
      `SELECT u.*, f.remark, f.starred, f.created_at AS friend_since
       FROM friendships f JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ? AND f.friend_id = ?`,
    )
    .get(userId, friendId);
  return row ? toFriend(row, realtime) : null;
}

export function toFriend(row, realtime) {
  const displayName = row.remark || row.nickname;
  return {
    ...publicUser(row),
    remark: row.remark,
    starred: !!row.starred,
    friendSince: row.friend_since,
    online: realtime ? realtime.isOnline(row.id) : false,
    ...nameIndex(displayName),
  };
}

export const MESSAGE_SELECT = `
  SELECT m.*, u.nickname AS sender_nickname, u.avatar AS sender_avatar
  FROM messages m LEFT JOIN users u ON u.id = m.sender_id`;

export function messageView(row) {
  if (!row) return null;
  let content = null;
  if (!row.recalled) content = row.type === 'text' ? row.content : parseJson(row.content, {});
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    sender: row.sender_id ? { id: row.sender_id, nickname: row.sender_nickname, avatar: row.sender_avatar } : null,
    type: row.type,
    content,
    mentions: parseJson(row.mentions, []),
    quote: row.recalled ? null : parseJson(row.quote, null),
    recalled: !!row.recalled,
    clientId: row.client_id,
    createdAt: row.created_at,
  };
}

export function getMessage(db, id) {
  return messageView(db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id));
}

/** One-line plain text description of a message, used for quotes and previews. */
export function messageSummary(message) {
  if (!message) return '';
  if (message.recalled) return '[消息已撤回]';
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
      return message.content?.text ?? '';
  }
}

export function memberIds(db, conversationId) {
  return db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').pluck().all(conversationId);
}

export function groupMembers(db, conversationId) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.nickname, u.avatar, u.gender, u.region, u.signature,
              cm.alias, cm.role, cm.joined_at
       FROM conversation_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ?
       ORDER BY CASE cm.role WHEN 'owner' THEN 0 ELSE 1 END, cm.joined_at, u.id`,
    )
    .all(conversationId)
    .map((r) => ({ ...publicUser(r), alias: r.alias, role: r.role, joinedAt: r.joined_at }));
}

function memberPreview(db, conversationId) {
  return db
    .prepare(
      `SELECT u.id, u.nickname, u.avatar FROM conversation_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ? ORDER BY CASE cm.role WHEN 'owner' THEN 0 ELSE 1 END, cm.joined_at, u.id LIMIT 9`,
    )
    .all(conversationId);
}

const UNREAD_SQL = `
  SELECT COUNT(*) AS unread,
         MAX(CASE WHEN mentions IS NOT NULL AND (
               EXISTS (SELECT 1 FROM json_each(messages.mentions) WHERE value = 'all' OR value = @userId)
             ) THEN 1 ELSE 0 END) AS mentioned
  FROM messages
  WHERE conversation_id = @conversationId AND id > @after AND recalled = 0 AND type != 'system'
    AND (sender_id IS NULL OR sender_id != @userId)`;

/**
 * Everything the chat list needs for one conversation, from the point of view of `userId`.
 * `membership` is the conversation_members row joined with conversations.
 */
function buildSummary(db, row, userId, realtime) {
  const after = Math.max(row.last_read_message_id, row.cleared_message_id);
  const counts = db.prepare(UNREAD_SQL).get({ conversationId: row.id, after, userId });
  const lastMessage =
    row.last_message_id > row.cleared_message_id ? getMessage(db, row.last_message_id) : null;

  const summary = {
    id: row.id,
    type: row.type,
    lastMessage,
    unread: counts.unread,
    mentioned: !!counts.mentioned,
    pinned: !!row.pinned,
    muted: !!row.muted,
    manualUnread: !!row.manual_unread,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };

  if (row.type === 'private') {
    const peer = db
      .prepare(
        `SELECT u.*, f.remark FROM conversation_members cm JOIN users u ON u.id = cm.user_id
         LEFT JOIN friendships f ON f.user_id = @userId AND f.friend_id = u.id
         WHERE cm.conversation_id = @conversationId AND cm.user_id != @userId`,
      )
      .get({ conversationId: row.id, userId });
    summary.peerId = peer?.id ?? null;
    summary.name = peer ? peer.remark || peer.nickname : '未知用户';
    summary.avatar = peer?.avatar ?? null;
    summary.isFriend = peer ? peer.remark != null : false;
    summary.online = peer && realtime ? realtime.isOnline(peer.id) : false;
  } else {
    const preview = memberPreview(db, row.id);
    const count = db.prepare('SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?').pluck().get(row.id);
    summary.name = row.name || preview.slice(0, 4).map((m) => m.nickname).join('、') || '群聊';
    summary.customName = !!row.name;
    summary.avatar = row.avatar ?? null;
    summary.memberPreview = preview;
    summary.memberCount = count;
    summary.groupNo = row.group_no;
    summary.ownerId = row.owner_id;
    summary.dissolved = !!row.dissolved;
    summary.myRole = row.role;
    summary.myAlias = row.alias;
  }
  return summary;
}

const MEMBERSHIP_SELECT = `
  SELECT c.*, cm.role, cm.alias, cm.last_read_message_id, cm.cleared_message_id, cm.pinned, cm.muted,
         cm.hidden, cm.manual_unread
  FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id`;

export function getMembership(db, conversationId, userId) {
  return db.prepare(`${MEMBERSHIP_SELECT} WHERE cm.conversation_id = ? AND cm.user_id = ?`).get(conversationId, userId);
}

export function conversationSummary(db, conversationId, userId, realtime) {
  const row = getMembership(db, conversationId, userId);
  return row ? buildSummary(db, row, userId, realtime) : null;
}

export function listConversations(db, userId, realtime) {
  return db
    .prepare(`${MEMBERSHIP_SELECT} WHERE cm.user_id = ? AND cm.hidden = 0 ORDER BY cm.pinned DESC, c.updated_at DESC`)
    .all(userId)
    .map((row) => buildSummary(db, row, userId, realtime));
}

export function conversationDetail(db, conversationId, userId, realtime) {
  const row = getMembership(db, conversationId, userId);
  if (!row) return null;
  const summary = buildSummary(db, row, userId, realtime);
  if (row.type === 'group') {
    summary.members = groupMembers(db, conversationId);
    summary.announcement = row.announcement;
    summary.announcementAt = row.announcement_at;
    summary.allowSearch = !!row.allow_search;
  }
  return summary;
}
