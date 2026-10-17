import express from 'express';
import { broadcastMessage, getOrCreatePrivateConversation, insertMessage, systemContent } from '../messaging.js';
import { areFriends, friendView, publicUser, toFriend } from '../views.js';
import { badRequest, forbidden, notFound, readId, readString } from '../util.js';

export default function friendRoutes(ctx) {
  const { db, realtime } = ctx;
  const router = express.Router();

  function requestView(row, viewerId) {
    const direction = row.from_user_id === viewerId ? 'out' : 'in';
    const otherId = direction === 'out' ? row.to_user_id : row.from_user_id;
    return {
      id: row.id,
      direction,
      user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(otherId)),
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Create the friendship both ways, open the private chat and drop the greeting + a notice into it. */
  const befriend = db.transaction(({ requesterId, accepterId, requesterRemark, accepterRemark, greeting }) => {
    const now = Date.now();
    db.prepare(
      `UPDATE friend_requests SET status = 'accepted', updated_at = ?
       WHERE status = 'pending' AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`,
    ).run(now, requesterId, accepterId, accepterId, requesterId);
    const addFriend = db.prepare(
      'INSERT OR IGNORE INTO friendships (user_id, friend_id, remark, created_at) VALUES (?, ?, ?, ?)',
    );
    addFriend.run(requesterId, accepterId, requesterRemark ?? '', now);
    addFriend.run(accepterId, requesterId, accepterRemark ?? '', now);

    const conversationId = getOrCreatePrivateConversation(db, requesterId, accepterId);
    const messages = [];
    if (greeting) {
      messages.push(insertMessage(db, { conversationId, senderId: requesterId, type: 'text', content: greeting }));
    }
    messages.push(insertMessage(db, { conversationId, type: 'system', content: systemContent('friend_added') }));
    return messages;
  });

  function completeFriendship(params) {
    const messages = befriend(params);
    const { requesterId, accepterId } = params;
    realtime.toUser(requesterId, 'friend:added', { friend: friendView(db, requesterId, accepterId, realtime) });
    realtime.toUser(accepterId, 'friend:added', { friend: friendView(db, accepterId, requesterId, realtime) });
    realtime.toUsers([requesterId, accepterId], 'friend:requests:changed', {});
    messages.forEach((m) => broadcastMessage(ctx, m));
    return friendView(db, accepterId, requesterId, realtime);
  }

  router.get('/', (req, res) => {
    const friends = db
      .prepare(
        `SELECT u.*, f.remark, f.starred, f.created_at AS friend_since
         FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?`,
      )
      .all(req.user.id)
      .map((row) => toFriend(row, realtime))
      .sort((a, b) => a.pinyin.localeCompare(b.pinyin));
    res.json({ friends });
  });

  router.get('/requests', (req, res) => {
    const me = req.user.id;
    const requests = db
      .prepare(
        `SELECT * FROM friend_requests WHERE to_user_id = ? OR from_user_id = ?
         ORDER BY updated_at DESC LIMIT 100`,
      )
      .all(me, me)
      .map((row) => requestView(row, me));
    res.json({ requests });
  });

  router.post('/requests', (req, res) => {
    const me = req.user.id;
    const targetId = readId(req.body?.userId, '用户');
    if (targetId === me) throw badRequest('不能添加自己为好友');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId)) throw notFound('用户不存在');
    if (areFriends(db, me, targetId)) throw badRequest('对方已经是你的好友');
    const message = readString(req.body?.message, { field: '验证消息', max: 50 });
    const remark = readString(req.body?.remark, { field: '备注', max: 20 });

    // They already asked me: adding them back simply accepts.
    const reverse = db
      .prepare("SELECT * FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'")
      .get(targetId, me);
    if (reverse) {
      const friend = completeFriendship({
        requesterId: targetId,
        accepterId: me,
        requesterRemark: reverse.remark,
        accepterRemark: remark,
        greeting: reverse.message,
      });
      return res.json({ status: 'accepted', friend });
    }

    const now = Date.now();
    const existing = db
      .prepare("SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'")
      .get(me, targetId);
    let id;
    if (existing) {
      db.prepare('UPDATE friend_requests SET message = ?, remark = ?, updated_at = ? WHERE id = ?').run(
        message,
        remark,
        now,
        existing.id,
      );
      id = existing.id;
    } else {
      id = Number(
        db
          .prepare(
            `INSERT INTO friend_requests (from_user_id, to_user_id, message, remark, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(me, targetId, message, remark, now, now).lastInsertRowid,
      );
    }
    const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
    realtime.toUser(targetId, 'friend:request', { request: requestView(row, targetId) });
    realtime.toUser(me, 'friend:requests:changed', {});
    res.status(201).json({ status: 'pending', request: requestView(row, me) });
  });

  function loadIncomingRequest(req) {
    const id = readId(req.params.id, '好友申请');
    const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
    if (!row || row.to_user_id !== req.user.id) throw notFound('好友申请不存在');
    if (row.status !== 'pending') throw badRequest('该申请已处理');
    return row;
  }

  router.post('/requests/:id/accept', (req, res) => {
    const row = loadIncomingRequest(req);
    const friend = completeFriendship({
      requesterId: row.from_user_id,
      accepterId: req.user.id,
      requesterRemark: row.remark,
      accepterRemark: readString(req.body?.remark, { field: '备注', max: 20 }),
      greeting: row.message,
    });
    res.json({ friend });
  });

  router.post('/requests/:id/reject', (req, res) => {
    const row = loadIncomingRequest(req);
    db.prepare("UPDATE friend_requests SET status = 'rejected', updated_at = ? WHERE id = ?").run(Date.now(), row.id);
    realtime.toUser(req.user.id, 'friend:requests:changed', {});
    res.json({ ok: true });
  });

  router.put('/:id', (req, res) => {
    const me = req.user.id;
    const friendId = readId(req.params.id, '好友');
    if (!areFriends(db, me, friendId)) throw forbidden('对方不是你的好友');
    if (req.body?.remark !== undefined) {
      const remark = readString(req.body.remark, { field: '备注', max: 20 });
      db.prepare('UPDATE friendships SET remark = ? WHERE user_id = ? AND friend_id = ?').run(remark, me, friendId);
    }
    if (req.body?.starred !== undefined) {
      db.prepare('UPDATE friendships SET starred = ? WHERE user_id = ? AND friend_id = ?').run(
        req.body.starred ? 1 : 0,
        me,
        friendId,
      );
    }
    const friend = friendView(db, me, friendId, realtime);
    realtime.toUser(me, 'friend:updated', { friend });
    res.json({ friend });
  });

  router.delete('/:id', (req, res) => {
    const me = req.user.id;
    const friendId = readId(req.params.id, '好友');
    if (!areFriends(db, me, friendId)) throw notFound('对方不是你的好友');
    const key = me < friendId ? `${me}:${friendId}` : `${friendId}:${me}`;
    const conversation = db.prepare('SELECT id, last_message_id FROM conversations WHERE private_key = ?').get(key);
    db.transaction(() => {
      db.prepare('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').run(
        me,
        friendId,
        friendId,
        me,
      );
      if (conversation) {
        // Deleting a contact also removes the chat (and its history) from my side.
        db.prepare(
          `UPDATE conversation_members SET hidden = 1, pinned = 0, cleared_message_id = ?, last_read_message_id = ?
           WHERE conversation_id = ? AND user_id = ?`,
        ).run(conversation.last_message_id, conversation.last_message_id, conversation.id, me);
      }
    })();
    realtime.toUser(me, 'friend:removed', { userId: friendId });
    realtime.toUser(friendId, 'friend:removed', { userId: me });
    if (conversation) realtime.toUser(me, 'conversation:removed', { conversationId: conversation.id });
    res.json({ ok: true });
  });

  return router;
}
