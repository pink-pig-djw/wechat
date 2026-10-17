import express from 'express';
import { MAX_GROUP_MEMBERS } from '../config.js';
import {
  generateGroupNo,
  getOrCreatePrivateConversation,
  insertMessage,
  broadcastMessage,
  sendMessage,
  systemContent,
} from '../messaging.js';
import {
  MESSAGE_SELECT,
  areFriends,
  conversationDetail,
  conversationSummary,
  getMembership,
  getMessage,
  listConversations,
  memberIds,
  messageSummary,
  messageView,
} from '../views.js';
import { badRequest, forbidden, notFound, readId, readIdList, readString, readUploadUrl } from '../util.js';

/** Throws unless `userId` is a member; returns the membership row (conversation columns + member settings). */
export function requireMembership(db, conversationId, userId) {
  const membership = getMembership(db, conversationId, userId);
  if (!membership) throw notFound('会话不存在或你已不在该群聊中');
  return membership;
}

export function assertCanSend(db, membership, userId) {
  if (membership.type === 'group') {
    if (membership.dissolved) throw badRequest('该群聊已解散，无法发送消息');
    return;
  }
  const peerId = memberIds(db, membership.id).find((id) => id !== userId);
  if (!peerId || !areFriends(db, userId, peerId)) throw forbidden('你们还不是好友，请先添加对方为好友');
}

export function usersByIds(db, ids) {
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT id, nickname FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export default function conversationRoutes(ctx) {
  const { db, realtime } = ctx;
  const router = express.Router();

  function readContent(type, content, me) {
    switch (type) {
      case 'text': {
        if (typeof content !== 'string' || !content.trim()) throw badRequest('不能发送空白消息');
        if ([...content].length > 5000) throw badRequest('消息不能超过 5000 个字符');
        return content;
      }
      case 'image': {
        const dim = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(20000, Math.round(Number(v)))) : 0);
        return { url: readUploadUrl(content?.url, '图片'), width: dim(content?.width), height: dim(content?.height) };
      }
      case 'file': {
        const size = Number(content?.size);
        return {
          url: readUploadUrl(content?.url, '文件'),
          name: readString(content?.name, { field: '文件名', min: 1, max: 200 }),
          size: Number.isFinite(size) && size >= 0 ? size : 0,
        };
      }
      case 'card': {
        const userId = readId(content?.userId, '名片');
        const user = db.prepare('SELECT id, username, nickname, avatar FROM users WHERE id = ?').get(userId);
        if (!user) throw notFound('名片对应的用户不存在');
        if (user.id !== me && !areFriends(db, me, user.id)) throw forbidden('只能推荐你的好友');
        return { userId: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar };
      }
      case 'sticker': {
        // Stickers are drawn client-side; the server only checks the id looks sane.
        const stickerId = content?.id;
        if (typeof stickerId !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(stickerId)) throw badRequest('表情不存在');
        return { id: stickerId };
      }
      default:
        throw badRequest('不支持的消息类型');
    }
  }

  router.get('/', (req, res) => {
    res.json({ conversations: listConversations(db, req.user.id, realtime) });
  });

  router.post('/private', (req, res) => {
    const me = req.user.id;
    const peerId = readId(req.body?.userId, '用户');
    if (peerId === me) throw badRequest('不能和自己聊天');
    if (!areFriends(db, me, peerId)) throw forbidden('你们还不是好友，请先添加对方为好友');
    const id = getOrCreatePrivateConversation(db, me, peerId);
    db.prepare('UPDATE conversation_members SET hidden = 0 WHERE conversation_id = ? AND user_id = ?').run(id, me);
    res.json({ conversation: conversationSummary(db, id, me, realtime) });
  });

  router.post('/group', (req, res) => {
    const me = req.user.id;
    const others = readIdList(req.body?.memberIds ?? []).filter((id) => id !== me);
    if (others.length < 2) throw badRequest('至少选择两位好友才能发起群聊');
    if (others.length + 1 > MAX_GROUP_MEMBERS) throw badRequest(`群成员不能超过 ${MAX_GROUP_MEMBERS} 人`);
    for (const id of others) {
      if (!areFriends(db, me, id)) throw forbidden('只能邀请你的好友加入群聊');
    }
    const name = readString(req.body?.name, { field: '群聊名称', max: 30 });

    const message = db.transaction(() => {
      const now = Date.now();
      const conversationId = Number(
        db
          .prepare(
            `INSERT INTO conversations (type, group_no, name, owner_id, created_at, updated_at)
             VALUES ('group', ?, ?, ?, ?, ?)`,
          )
          .run(generateGroupNo(db), name, me, now, now).lastInsertRowid,
      );
      const addMember = db.prepare(
        'INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      );
      addMember.run(conversationId, me, 'owner', now);
      others.forEach((id) => addMember.run(conversationId, id, 'member', now));
      return insertMessage(db, {
        conversationId,
        type: 'system',
        content: systemContent('group_create', { actor: req.user, targets: usersByIds(db, others) }),
      });
    })();
    broadcastMessage(ctx, message);
    res.status(201).json({ conversation: conversationSummary(db, message.conversationId, me, realtime) });
  });

  router.get('/:id', (req, res) => {
    const id = readId(req.params.id, '会话');
    requireMembership(db, id, req.user.id);
    res.json({ conversation: conversationDetail(db, id, req.user.id, realtime) });
  });

  router.put('/:id/settings', (req, res) => {
    const me = req.user.id;
    const id = readId(req.params.id, '会话');
    requireMembership(db, id, me);
    const fields = { pinned: 'pinned', muted: 'muted', manualUnread: 'manual_unread' };
    for (const [key, column] of Object.entries(fields)) {
      if (req.body?.[key] !== undefined) {
        db.prepare(`UPDATE conversation_members SET ${column} = ? WHERE conversation_id = ? AND user_id = ?`).run(
          req.body[key] ? 1 : 0,
          id,
          me,
        );
      }
    }
    const conversation = conversationSummary(db, id, me, realtime);
    realtime.toUser(me, 'conversation:settings', { conversation });
    res.json({ conversation });
  });

  router.post('/:id/read', (req, res) => {
    const me = req.user.id;
    const id = readId(req.params.id, '会话');
    const membership = requireMembership(db, id, me);
    db.prepare(
      'UPDATE conversation_members SET last_read_message_id = ?, manual_unread = 0 WHERE conversation_id = ? AND user_id = ?',
    ).run(membership.last_message_id, id, me);
    realtime.toUser(me, 'conversation:read', { conversationId: id });
    res.json({ ok: true });
  });

  router.post('/:id/clear', (req, res) => {
    const me = req.user.id;
    const id = readId(req.params.id, '会话');
    const membership = requireMembership(db, id, me);
    db.prepare(
      `UPDATE conversation_members SET cleared_message_id = ?, last_read_message_id = ?, manual_unread = 0
       WHERE conversation_id = ? AND user_id = ?`,
    ).run(membership.last_message_id, membership.last_message_id, id, me);
    realtime.toUser(me, 'conversation:cleared', { conversationId: id });
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const me = req.user.id;
    const id = readId(req.params.id, '会话');
    const membership = requireMembership(db, id, me);
    db.prepare(
      `UPDATE conversation_members SET hidden = 1, pinned = 0, manual_unread = 0, cleared_message_id = ?, last_read_message_id = ?
       WHERE conversation_id = ? AND user_id = ?`,
    ).run(membership.last_message_id, membership.last_message_id, id, me);
    realtime.toUser(me, 'conversation:removed', { conversationId: id });
    res.json({ ok: true });
  });

  router.get('/:id/messages', (req, res) => {
    const id = readId(req.params.id, '会话');
    const membership = requireMembership(db, id, req.user.id);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const before = req.query.before ? readId(req.query.before, '消息') : Number.MAX_SAFE_INTEGER;
    const rows = db
      .prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id > ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
      .all(id, membership.cleared_message_id, before, limit + 1);
    const hasMore = rows.length > limit;
    res.json({ messages: rows.slice(0, limit).reverse().map(messageView), hasMore });
  });

  router.get('/:id/messages/search', (req, res) => {
    const id = readId(req.params.id, '会话');
    const membership = requireMembership(db, id, req.user.id);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : '';
    if (!q) return res.json({ messages: [] });
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = db
      .prepare(
        `${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id > ? AND m.recalled = 0
           AND ((m.type = 'text' AND m.content LIKE ? ESCAPE '\\') OR (m.type = 'file' AND json_extract(m.content, '$.name') LIKE ? ESCAPE '\\'))
         ORDER BY m.id DESC LIMIT 50`,
      )
      .all(id, membership.cleared_message_id, like, like);
    res.json({ messages: rows.map(messageView) });
  });

  router.post('/:id/messages', (req, res) => {
    const me = req.user.id;
    const id = readId(req.params.id, '会话');
    const membership = requireMembership(db, id, me);
    assertCanSend(db, membership, me);
    const body = req.body ?? {};
    const type = body.type ?? 'text';
    const content = readContent(type, body.content, me);

    let mentions = null;
    if (membership.type === 'group' && type === 'text' && Array.isArray(body.mentions)) {
      const members = new Set(memberIds(db, id));
      mentions = [
        ...new Set(
          body.mentions.filter((m) =>
            m === 'all' ? membership.role === 'owner' : members.has(Number(m)) && Number(m) !== me,
          ).map((m) => (m === 'all' ? 'all' : Number(m))),
        ),
      ];
    }

    let quote = null;
    if (body.quoteId != null) {
      const quoted = getMessage(db, readId(body.quoteId, '引用消息'));
      if (
        !quoted ||
        quoted.conversationId !== id ||
        quoted.id <= membership.cleared_message_id ||
        quoted.recalled ||
        quoted.type === 'system'
      ) {
        throw badRequest('引用的消息不存在或已撤回');
      }
      quote = {
        id: quoted.id,
        senderId: quoted.senderId,
        senderName: quoted.sender?.nickname ?? '',
        type: quoted.type,
        text: messageSummary(quoted),
        ...(quoted.type === 'image' ? { url: quoted.content.url } : {}),
      };
    }

    const clientId = typeof body.clientId === 'string' ? body.clientId.slice(0, 64) : null;
    const message = sendMessage(ctx, { conversationId: id, senderId: me, type, content, mentions, quote, clientId });
    res.status(201).json({ message });
  });

  return router;
}
