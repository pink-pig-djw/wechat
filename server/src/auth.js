import jwt from 'jsonwebtoken';
import { HttpError } from './util.js';

export function signToken(config, user) {
  return jwt.sign({ sub: user.id, tv: user.token_version }, config.jwtSecret, { expiresIn: config.tokenTtl });
}

/** Returns the user row for a valid token, or null. */
export function verifyToken(db, config, token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || user.token_version !== payload.tv) return null;
    return user;
  } catch {
    return null;
  }
}

export function requireAuth({ db, config }) {
  return (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, '请先登录'));
    const user = verifyToken(db, config, token);
    if (!user) return next(new HttpError(401, '登录已过期，请重新登录'));
    req.user = user;
    next();
  };
}
