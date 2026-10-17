import express from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, signToken } from '../auth.js';
import { selfUser } from '../views.js';
import { HttpError, badRequest, readString } from '../util.js';

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{3,19}$/;

export default function authRoutes(ctx) {
  const { db, config } = ctx;
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const username = readString(req.body?.username, { field: '泡泡号', min: 1 });
    if (!USERNAME_RE.test(username)) throw badRequest('泡泡号需以字母开头，4-20 位字母、数字、下划线或减号');
    const password = readString(req.body?.password, { field: '密码', trim: false, min: 6, max: 64 });
    const nickname = readString(req.body?.nickname, { field: '昵称', min: 1, max: 20 });

    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      throw new HttpError(409, '该泡泡号已被注册');
    }
    const hash = await bcrypt.hash(password, 10);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, password_hash, nickname, created_at) VALUES (?, ?, ?, ?)')
      .run(username, hash, nickname, Date.now());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
    res.status(201).json({ token: signToken(config, user), user: selfUser(user) });
  });

  router.post('/login', async (req, res) => {
    const username = readString(req.body?.username, { field: '泡泡号', min: 1 });
    const password = readString(req.body?.password, { field: '密码', trim: false, min: 1 });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, '泡泡号或密码错误');
    }
    res.json({ token: signToken(config, user), user: selfUser(user) });
  });

  router.get('/me', requireAuth(ctx), (req, res) => {
    res.json({ user: selfUser(req.user) });
  });

  return router;
}
