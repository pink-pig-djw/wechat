import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { resolveConfig } from './config.js';
import { openDatabase } from './db.js';
import { requireAuth } from './auth.js';
import { createRealtime } from './realtime.js';
import { HttpError } from './util.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import friendRoutes from './routes/friends.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import groupRoutes from './routes/groups.js';
import momentRoutes from './routes/moments.js';
import uploadRoutes, { serveUploads } from './routes/upload.js';
import { seed } from './seed.js';

export function createServer(options = {}) {
  const config = resolveConfig(options);
  const db = openDatabase(config.dbFile);
  const app = express();
  const httpServer = http.createServer(app);
  const realtime = createRealtime(httpServer, { db, config });
  const ctx = { db, config, realtime };

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', serveUploads(config.uploadDir));

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes(ctx));
  api.use(requireAuth(ctx));
  api.use('/users', userRoutes(ctx));
  api.use('/friends', friendRoutes(ctx));
  api.use('/conversations', conversationRoutes(ctx));
  api.use('/messages', messageRoutes(ctx));
  api.use('/groups', groupRoutes(ctx));
  api.use('/moments', momentRoutes(ctx));
  api.use('/upload', uploadRoutes(ctx));
  api.use((_req, _res, next) => next(new HttpError(404, '接口不存在')));
  app.use('/api', api);

  // Serve the built web client (npm run build) with SPA fallback.
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/uploads/')) return next();
      res.sendFile(indexHtml);
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: '请求格式不正确' });
    console.error(err);
    res.status(500).json({ error: '服务器开小差了，请稍后再试' });
  });

  return {
    app,
    db,
    config,
    httpServer,
    io: realtime.io,
    listen(port = config.port) {
      return new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port)));
    },
    async close() {
      realtime.io.close();
      await new Promise((resolve) => httpServer.close(() => resolve()));
      db.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  // On a fresh deployment, SEED_DEMO=1 creates the demo accounts so there is something to try.
  if (process.env.SEED_DEMO === '1' && seed(server.db)) console.log('✅ 已创建演示数据（密码均为 123456）');
  const port = await server.listen();
  console.log(`🚀 微聊已启动: http://localhost:${port}`);
  if (!fs.existsSync(path.join(server.config.clientDist, 'index.html'))) {
    console.log('ℹ️  前端尚未构建：开发时请运行 `npm run dev`，或先执行 `npm run build`。');
  }
  const shutdown = () => server.close().finally(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
