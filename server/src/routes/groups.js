import express from 'express';
import { MAX_GROUP_MEMBERS } from '../config.js';
import { broadcastMessage, insertMessage, systemContent } from '../messaging.js';
import { areFriends, conversationDetail, conversationSummary, memberIds } from '../views.js';
import { badRequest, forbidden, notFound, readId, readIdList, readString } from '../util.js';
import { requireMembership, usersByIds } from './conversations.js';

export default function groupRoutes(ctx) {
  const { db, realtime } = ctx;
  const router = express.Router();

  function requireGroup(req, { active = true } = {}) {
    const membership = requireMembership(db, readId(req.params.id, '群聊'), req.user.id);
    if (membership.type !== 'group') throw badRequest('该会话不是群聊');
    if (active && membership.dissolved) throw badRequest('该群聊已解散');
    return membership;
  }

  function requireOwner(membership) {
    if (membership.role !== 'owner') throw forbidden('只有群主可以执行该操作');
  }

  function memberCount(conversationId) {
    return db.prepare('SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?').pluck().get(conversationId);
  }

  /** Commit a change, then push resulting messages and an "updated" hint to everyone still in the group. */
  function finish(conversationId, messages, req, res, status = 200) {
    messages.filter(Boolean).forEach((m) => broadcastMessage(ctx, m));
    realtime.toUsers(memberIds(db, conversationId), 'conversation:updated', { conversationId });
    const conversation = conversationDetail(db, conversationId, req.user.id, realtime);
    res.status(status).json({ conversation });
  }

  const system = (conversationId, event, details) =>
    insertMessage(db, { conversationId, type: 'system', content: systemContent(event, details) });

  router.get('/', (req, res) => {
    const ids = db
      .prepare(
        `SELECT c.id FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
         WHERE cm.user_id = ? AND c.type = 'group' AND c.dissolved = 0 ORDER BY c.updated_at DESC`,
      )
      .pluck()
      .all(req.user.id);
    res.json({ groups: ids.map((id) => conversationSummary(db, id, req.user.id, realtime)) });
  });

  router.put('/:id', (req, res) => {
    const membership = requireGroup(req);
    const id = membership.id;
    const body = req.body ?? {};
    const actor = { ...req.user, alias: membership.alias };
    if (body.announcement !== undefined || body.allowSearch !== undefined) requireOwner(membership);

    const messages = db.transaction(() => {
      const out = [];
      if (body.name !== undefined) {
        const name = readString(body.name, { field: '群聊名称', max: 30 });
        if (name !== membership.name) {
          db.prepare('UPDATE conversations SET name = ? WHERE id = ?').run(name, id);
          out.push(system(id, 'group_rename', { actor, name }));
        }
      }
      if (body.announcement !== undefined) {
        const announcement = readString(body.announcement, { field: '群公告', max: 1000 });
        db.prepare('UPDATE conversations SET announcement = ?, announcement_at = ? WHERE id = ?').run(
          announcement,
          announcement ? Date.now() : null,
          id,
        );
        if (announcement) {
          out.push(
            insertMessage(db, {
              conversationId: id,
              senderId: req.user.id,
              type: 'text',
              content: `@所有人\n${announcement}`,
              mentions: ['all'],
            }),
          );
        }
      }
      if (body.allowSearch !== undefined) {
        db.prepare('UPDATE conversations SET allow_search = ? WHERE id = ?').run(body.allowSearch ? 1 : 0, id);
      }
      return out;
    })();
    finish(id, messages, req, res);
  });

  router.put('/:id/alias', (req, res) => {
    const membership = requireGroup(req);
    const alias = readString(req.body?.alias, { field: '群昵称', max: 20 });
    db.prepare('UPDATE conversation_members SET alias = ? WHERE conversation_id = ? AND user_id = ?').run(
      alias,
      membership.id,
      req.user.id,
    );
    finish(membership.id, [], req, res);
  });

  router.post('/:id/members', (req, res) => {
    const membership = requireGroup(req);
    const id = membership.id;
    const existing = new Set(memberIds(db, id));
    const ids = readIdList(req.body?.userIds ?? []).filter((uid) => !existing.has(uid));
    if (!ids.length) throw badRequest('所选好友已在群聊中');
    for (const uid of ids) {
      if (!areFriends(db, req.user.id, uid)) throw forbidden('只能邀请你的好友加入群聊');
    }
    if (existing.size + ids.length > MAX_GROUP_MEMBERS) throw badRequest(`群成员不能超过 ${MAX_GROUP_MEMBERS} 人`);

    const message = db.transaction(() => {
      const now = Date.now();
      // New members start reading from "now": earlier history stays private, like WeChat.
      const add = db.prepare(
        `INSERT INTO conversation_members (conversation_id, user_id, joined_at, last_read_message_id, cleared_message_id)
         VALUES (?, ?, ?, ?, ?)`,
      );
      ids.forEach((uid) => add.run(id, uid, now, membership.last_message_id, membership.last_message_id));
      return system(id, 'group_invite', {
        actor: { ...req.user, alias: membership.alias },
        targets: usersByIds(db, ids),
      });
    })();
    finish(id, [message], req, res);
  });

  router.delete('/:id/members/:userId', (req, res) => {
    const membership = requireGroup(req);
    requireOwner(membership);
    const id = membership.id;
    const targetId = readId(req.params.userId, '成员');
    if (targetId === req.user.id) throw badRequest('不能移除自己，请使用“退出群聊”');
    if (!memberIds(db, id).includes(targetId)) throw notFound('该用户不在群聊中');

    const message = db.transaction(() => {
      db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(id, targetId);
      return system(id, 'group_kick', {
        actor: { ...req.user, alias: membership.alias },
        targets: usersByIds(db, [targetId]),
      });
    })();
    realtime.toUser(targetId, 'conversation:removed', { conversationId: id, reason: 'kicked' });
    finish(id, [message], req, res);
  });

  router.post('/:id/leave', (req, res) => {
    const membership = requireGroup(req, { active: false });
    const id = membership.id;
    const me = req.user.id;

    const message = db.transaction(() => {
      db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(id, me);
      const successor = db
        .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? ORDER BY joined_at, user_id LIMIT 1')
        .pluck()
        .get(id);
      if (!successor) {
        db.prepare('UPDATE conversations SET dissolved = 1 WHERE id = ?').run(id);
        return null;
      }
      if (membership.role === 'owner') {
        db.prepare("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?").run(
          id,
          successor,
        );
        db.prepare('UPDATE conversations SET owner_id = ? WHERE id = ?').run(successor, id);
      }
      if (membership.dissolved) return null;
      return system(id, 'group_leave', { actor: { ...req.user, alias: membership.alias } });
    })();
    if (message) broadcastMessage(ctx, message);
    realtime.toUsers(memberIds(db, id), 'conversation:updated', { conversationId: id });
    realtime.toUser(me, 'conversation:removed', { conversationId: id, reason: 'left' });
    res.json({ ok: true });
  });

  router.post('/:id/transfer', (req, res) => {
    const membership = requireGroup(req);
    requireOwner(membership);
    const id = membership.id;
    const targetId = readId(req.body?.userId, '成员');
    if (targetId === req.user.id) throw badRequest('你已经是群主了');
    if (!memberIds(db, id).includes(targetId)) throw notFound('该用户不在群聊中');

    const message = db.transaction(() => {
      db.prepare("UPDATE conversation_members SET role = 'member' WHERE conversation_id = ? AND user_id = ?").run(
        id,
        req.user.id,
      );
      db.prepare("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?").run(
        id,
        targetId,
      );
      db.prepare('UPDATE conversations SET owner_id = ? WHERE id = ?').run(targetId, id);
      return system(id, 'group_owner', {
        actor: { ...req.user, alias: membership.alias },
        targets: usersByIds(db, [targetId]),
      });
    })();
    finish(id, [message], req, res);
  });

  router.post('/:id/dissolve', (req, res) => {
    const membership = requireGroup(req);
    requireOwner(membership);
    const message = db.transaction(() => {
      db.prepare('UPDATE conversations SET dissolved = 1 WHERE id = ?').run(membership.id);
      return system(membership.id, 'group_dissolve', { actor: { ...req.user, alias: membership.alias } });
    })();
    finish(membership.id, [message], req, res);
  });

  router.post('/:id/join', (req, res) => {
    const id = readId(req.params.id, '群聊');
    const me = req.user.id;
    const group = db.prepare("SELECT * FROM conversations WHERE id = ? AND type = 'group'").get(id);
    if (!group || group.dissolved) throw notFound('群聊不存在或已解散');
    if (memberIds(db, id).includes(me)) {
      db.prepare('UPDATE conversation_members SET hidden = 0 WHERE conversation_id = ? AND user_id = ?').run(id, me);
      return res.json({ conversation: conversationDetail(db, id, me, realtime) });
    }
    if (!group.allow_search) throw forbidden('该群聊已关闭通过群号加入');
    if (memberCount(id) >= MAX_GROUP_MEMBERS) throw badRequest('该群聊人数已满');

    const message = db.transaction(() => {
      db.prepare(
        `INSERT INTO conversation_members (conversation_id, user_id, joined_at, last_read_message_id, cleared_message_id)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, me, Date.now(), group.last_message_id, group.last_message_id);
      return system(id, 'group_join', { actor: req.user });
    })();
    finish(id, [message], req, res, 201);
  });

  return router;
}
