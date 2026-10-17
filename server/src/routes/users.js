import express from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../auth.js';
import { friendIds, publicUser, selfUser } from '../views.js';
import { HttpError, badRequest, notFound, parseJson, readId, readString, readUploadUrl } from '../util.js';

export default function userRoutes(ctx) {
  const { db, config, realtime } = ctx;
  const router = express.Router();

  /** Everyone who can see my name/avatar somewhere: friends, people sharing a group, and my other sessions. */
  function audienceOf(userId) {
    const groupPeers = db
      .prepare(
        `SELECT DISTINCT other.user_id FROM conversation_members mine
         JOIN conversations c ON c.id = mine.conversation_id AND c.type = 'group'
         JOIN conversation_members other ON other.conversation_id = mine.conversation_id
         WHERE mine.user_id = ?`,
      )
      .pluck()
      .all(userId);
    return [userId, ...friendIds(db, userId), ...groupPeers];
  }

  router.put('/me', (req, res) => {
    const body = req.body ?? {};
    const updates = {};
    if (body.nickname !== undefined) updates.nickname = readString(body.nickname, { field: '昵称', min: 1, max: 20 });
    if (body.signature !== undefined) updates.signature = readString(body.signature, { field: '个性签名', max: 60 });
    if (body.region !== undefined) updates.region = readString(body.region, { field: '地区', max: 30 });
    if (body.gender !== undefined) {
      if (![0, 1, 2].includes(body.gender)) throw badRequest('性别格式不正确');
      updates.gender = body.gender;
    }
    if (body.avatar !== undefined) updates.avatar = body.avatar === null ? null : readUploadUrl(body.avatar, '头像');
    if (body.momentsCover !== undefined) {
      updates.moments_cover = body.momentsCover === null ? null : readUploadUrl(body.momentsCover, '封面');
    }
    const keys = Object.keys(updates);
    if (keys.length) {
      db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({
        ...updates,
        id: req.user.id,
      });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    realtime.toUsers(audienceOf(user.id), 'user:updated', { user: publicUser(user) });
    res.json({ user: selfUser(user) });
  });

  router.put('/me/password', async (req, res) => {
    const oldPassword = readString(req.body?.oldPassword, { field: '原密码', trim: false, min: 1 });
    const newPassword = readString(req.body?.newPassword, { field: '新密码', trim: false, min: 6, max: 64 });
    if (!(await bcrypt.compare(oldPassword, req.user.password_hash))) throw new HttpError(400, '原密码不正确');
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(hash, req.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    // Old tokens are now invalid; drop sockets that authenticated with them.
    realtime.disconnectUser(user.id);
    res.json({ token: signToken(config, user), user: selfUser(user) });
  });

  router.get('/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 40) : '';
    if (!q) return res.json({ users: [], groups: [] });
    const me = req.user.id;
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = db
      .prepare(
        `SELECT u.*, f.remark FROM users u
         LEFT JOIN friendships f ON f.user_id = @me AND f.friend_id = u.id
         WHERE u.username = @q OR u.username LIKE @like ESCAPE '\\' OR u.nickname LIKE @like ESCAPE '\\'
         ORDER BY (u.username = @q COLLATE NOCASE) DESC, u.id
         LIMIT 20`,
      )
      .all({ me, q, like });
    const users = rows.map((r) => ({
      ...publicUser(r),
      relation: r.id === me ? 'self' : r.remark != null ? 'friend' : 'stranger',
      remark: r.remark ?? '',
    }));

    let groups = [];
    if (/^\d{6,12}$/.test(q)) {
      groups = db
        .prepare(
          `SELECT c.id, c.name, c.group_no, c.avatar,
                  (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) AS member_count,
                  EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?) AS joined
           FROM conversations c
           WHERE c.type = 'group' AND c.group_no = ? AND c.dissolved = 0 AND c.allow_search = 1`,
        )
        .all(me, q)
        .map((g) => {
          const preview = db
            .prepare(
              `SELECT u.id, u.nickname, u.avatar FROM conversation_members cm JOIN users u ON u.id = cm.user_id
               WHERE cm.conversation_id = ? ORDER BY CASE cm.role WHEN 'owner' THEN 0 ELSE 1 END, cm.joined_at LIMIT 9`,
            )
            .all(g.id);
          return {
            id: g.id,
            name: g.name || preview.slice(0, 4).map((m) => m.nickname).join('、'),
            groupNo: g.group_no,
            avatar: g.avatar,
            memberCount: g.member_count,
            memberPreview: preview,
            joined: !!g.joined,
          };
        });
    }
    res.json({ users, groups });
  });

  router.get('/:id', (req, res) => {
    const id = readId(req.params.id, '用户');
    const me = req.user.id;
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!row) throw notFound('用户不存在');
    const friendship = db.prepare('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?').get(me, id);
    const relation = id === me ? 'self' : friendship ? 'friend' : 'stranger';

    const profile = {
      ...publicUser(row),
      relation,
      remark: friendship?.remark ?? '',
      starred: !!friendship?.starred,
      online: relation === 'friend' ? realtime.isOnline(id) : false,
      momentsPreview: [],
      momentsCover: relation === 'stranger' ? null : row.moments_cover ?? null,
      incomingRequestId: null,
      outgoingPending: false,
    };

    if (relation !== 'stranger') {
      const recent = db
        .prepare("SELECT images FROM moments WHERE user_id = ? AND images != '[]' ORDER BY id DESC LIMIT 4")
        .pluck()
        .all(id);
      profile.momentsPreview = recent.flatMap((imgs) => parseJson(imgs, [])).slice(0, 4);
    } else {
      const incoming = db
        .prepare("SELECT id, message FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'")
        .get(id, me);
      profile.incomingRequestId = incoming?.id ?? null;
      profile.incomingMessage = incoming?.message ?? '';
      profile.outgoingPending = !!db
        .prepare("SELECT 1 FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'")
        .get(me, id);
    }
    if (relation === 'friend') {
      profile.commonGroups = db
        .prepare(
          `SELECT COUNT(*) FROM conversation_members a
           JOIN conversation_members b ON a.conversation_id = b.conversation_id AND b.user_id = ?
           JOIN conversations c ON c.id = a.conversation_id AND c.type = 'group' AND c.dissolved = 0
           WHERE a.user_id = ?`,
        )
        .pluck()
        .get(id, me);
    }
    res.json({ user: profile });
  });

  return router;
}
