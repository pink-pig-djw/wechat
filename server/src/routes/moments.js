import express from 'express';
import { areFriends, friendIds } from '../views.js';
import { badRequest, forbidden, notFound, parseJson, readId, readString, readUploadUrl } from '../util.js';

export default function momentRoutes(ctx) {
  const { db, realtime } = ctx;
  const router = express.Router();

  const canSee = (authorId, viewerId) => authorId === viewerId || areFriends(db, viewerId, authorId);

  function loadMoment(id, viewerId) {
    const moment = db.prepare('SELECT * FROM moments WHERE id = ?').get(id);
    if (!moment || !canSee(moment.user_id, viewerId)) throw notFound('该动态不存在或已被删除');
    return moment;
  }

  /** Likes and comments are only shown when they come from the viewer's own friends (WeChat's privacy rule). */
  function momentView(row, viewerId, circle = new Set([viewerId, ...friendIds(db, viewerId)])) {
    const likes = db
      .prepare(
        `SELECT l.user_id, u.nickname FROM moment_likes l JOIN users u ON u.id = l.user_id
         WHERE l.moment_id = ? ORDER BY l.created_at`,
      )
      .all(row.id);
    const comments = db
      .prepare(
        `SELECT c.*, u.nickname, ru.nickname AS reply_nickname FROM moment_comments c
         JOIN users u ON u.id = c.user_id LEFT JOIN users ru ON ru.id = c.reply_to_user_id
         WHERE c.moment_id = ? ORDER BY c.id`,
      )
      .all(row.id);
    const author = row.nickname
      ? row
      : db.prepare('SELECT id, nickname, avatar FROM users WHERE id = ?').get(row.user_id);
    return {
      id: row.id,
      user: { id: row.user_id, nickname: author.nickname, avatar: author.avatar ?? null },
      content: row.content,
      images: parseJson(row.images, []),
      createdAt: row.created_at,
      liked: likes.some((l) => l.user_id === viewerId),
      likes: likes.filter((l) => circle.has(l.user_id)).map((l) => ({ userId: l.user_id, nickname: l.nickname })),
      comments: comments
        .filter((c) => circle.has(c.user_id))
        .map((c) => ({
          id: c.id,
          userId: c.user_id,
          nickname: c.nickname,
          replyToUserId: c.reply_to_user_id,
          replyToNickname: c.reply_nickname,
          content: c.content,
          createdAt: c.created_at,
        })),
    };
  }

  const unreadCount = (userId) =>
    db.prepare('SELECT COUNT(*) FROM moment_notifications WHERE user_id = ? AND read = 0').pluck().get(userId);

  function notify(userId, actorId, momentId, type, content = '') {
    if (userId === actorId) return;
    db.prepare(
      'INSERT INTO moment_notifications (user_id, actor_id, moment_id, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(userId, actorId, momentId, type, content, Date.now());
    realtime.toUser(userId, 'moment:notify', { unread: unreadCount(userId) });
  }

  router.get('/', (req, res) => {
    const me = req.user.id;
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 10));
    const before = req.query.before ? readId(req.query.before, '动态') : Number.MAX_SAFE_INTEGER;
    const circle = new Set([me, ...friendIds(db, me)]);
    let authors;
    if (req.query.userId) {
      const userId = readId(req.query.userId, '用户');
      if (!circle.has(userId)) throw forbidden('添加对方为好友后才能查看朋友圈');
      authors = [userId];
    } else {
      authors = [...circle];
    }
    const rows = db
      .prepare(
        `SELECT m.*, u.nickname, u.avatar FROM moments m JOIN users u ON u.id = m.user_id
         WHERE m.user_id IN (${authors.map(() => '?').join(',')}) AND m.id < ?
         ORDER BY m.id DESC LIMIT ?`,
      )
      .all(...authors, before, limit + 1);
    res.json({
      moments: rows.slice(0, limit).map((row) => momentView(row, me, circle)),
      hasMore: rows.length > limit,
    });
  });

  router.post('/', (req, res) => {
    const me = req.user.id;
    const content = readString(req.body?.content, { field: '内容', max: 2000 });
    const rawImages = req.body?.images ?? [];
    if (!Array.isArray(rawImages) || rawImages.length > 9) throw badRequest('最多只能发布 9 张图片');
    const images = rawImages.map((url) => readUploadUrl(url, '图片'));
    if (!content && !images.length) throw badRequest('说点什么或者选几张图片吧');
    const now = Date.now();
    const id = Number(
      db
        .prepare('INSERT INTO moments (user_id, content, images, created_at) VALUES (?, ?, ?, ?)')
        .run(me, content, JSON.stringify(images), now).lastInsertRowid,
    );
    realtime.toUsers(friendIds(db, me), 'moment:new', {
      momentId: id,
      user: { id: me, nickname: req.user.nickname, avatar: req.user.avatar },
      createdAt: now,
    });
    res.status(201).json({ moment: momentView(db.prepare('SELECT * FROM moments WHERE id = ?').get(id), me) });
  });

  router.get('/status', (req, res) => {
    const me = req.user.id;
    const friends = friendIds(db, me);
    let latest = null;
    if (friends.length) {
      latest =
        db
          .prepare(
            `SELECT m.user_id, m.created_at, u.nickname, u.avatar FROM moments m JOIN users u ON u.id = m.user_id
             WHERE m.user_id IN (${friends.map(() => '?').join(',')}) AND m.created_at > ?
             ORDER BY m.id DESC LIMIT 1`,
          )
          .get(...friends, req.user.moments_seen_at) ?? null;
    }
    res.json({
      unread: unreadCount(me),
      latest: latest && { user: { id: latest.user_id, nickname: latest.nickname, avatar: latest.avatar }, createdAt: latest.created_at },
    });
  });

  router.post('/seen', (req, res) => {
    db.prepare('UPDATE users SET moments_seen_at = ? WHERE id = ?').run(Date.now(), req.user.id);
    res.json({ ok: true });
  });

  router.get('/notifications', (req, res) => {
    const rows = db
      .prepare(
        `SELECT n.*, u.nickname, u.avatar, m.content AS moment_content, m.images AS moment_images
         FROM moment_notifications n JOIN users u ON u.id = n.actor_id JOIN moments m ON m.id = n.moment_id
         WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50`,
      )
      .all(req.user.id);
    res.json({
      unread: unreadCount(req.user.id),
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        content: n.content,
        read: !!n.read,
        createdAt: n.created_at,
        actor: { id: n.actor_id, nickname: n.nickname, avatar: n.avatar },
        moment: { id: n.moment_id, content: n.moment_content, image: parseJson(n.moment_images, [])[0] ?? null },
      })),
    });
  });

  router.post('/notifications/read', (req, res) => {
    db.prepare('UPDATE moment_notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ ok: true });
  });

  router.delete('/comments/:id', (req, res) => {
    const me = req.user.id;
    const comment = db.prepare('SELECT * FROM moment_comments WHERE id = ?').get(readId(req.params.id, '评论'));
    if (!comment) throw notFound('评论不存在');
    const moment = loadMoment(comment.moment_id, me);
    if (comment.user_id !== me && moment.user_id !== me) throw forbidden('只能删除自己的评论');
    db.prepare('DELETE FROM moment_comments WHERE id = ?').run(comment.id);
    res.json({ moment: momentView(moment, me) });
  });

  router.delete('/:id', (req, res) => {
    const moment = loadMoment(readId(req.params.id, '动态'), req.user.id);
    if (moment.user_id !== req.user.id) throw forbidden('只能删除自己的动态');
    db.prepare('DELETE FROM moments WHERE id = ?').run(moment.id);
    res.json({ ok: true });
  });

  router.post('/:id/like', (req, res) => {
    const me = req.user.id;
    const moment = loadMoment(readId(req.params.id, '动态'), me);
    const liked = db.prepare('SELECT 1 FROM moment_likes WHERE moment_id = ? AND user_id = ?').get(moment.id, me);
    if (liked) {
      db.prepare('DELETE FROM moment_likes WHERE moment_id = ? AND user_id = ?').run(moment.id, me);
      db.prepare("DELETE FROM moment_notifications WHERE moment_id = ? AND actor_id = ? AND type = 'like'").run(moment.id, me);
    } else {
      db.prepare('INSERT INTO moment_likes (moment_id, user_id, created_at) VALUES (?, ?, ?)').run(moment.id, me, Date.now());
      notify(moment.user_id, me, moment.id, 'like');
    }
    res.json({ moment: momentView(moment, me) });
  });

  router.post('/:id/comments', (req, res) => {
    const me = req.user.id;
    const moment = loadMoment(readId(req.params.id, '动态'), me);
    const content = readString(req.body?.content, { field: '评论', min: 1, max: 500 });
    let replyTo = null;
    if (req.body?.replyToUserId != null) {
      replyTo = readId(req.body.replyToUserId, '回复对象');
      if (replyTo === me) replyTo = null;
    }
    db.prepare(
      'INSERT INTO moment_comments (moment_id, user_id, reply_to_user_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(moment.id, me, replyTo, content, Date.now());
    notify(moment.user_id, me, moment.id, 'comment', content);
    if (replyTo && replyTo !== moment.user_id) notify(replyTo, me, moment.id, 'reply', content);
    res.status(201).json({ moment: momentView(moment, me) });
  });

  return router;
}
