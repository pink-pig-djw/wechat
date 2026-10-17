import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RECALL_WINDOW_MS = 2 * 60 * 1000;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_GROUP_MEMBERS = 500;

function loadSecret(dataDir) {
  const file = path.join(dataDir, '.jwt-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // first run: fall through and generate one
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

/** Resolve runtime settings from explicit options first, then environment variables. */
export function resolveConfig(options = {}) {
  const dataDir = path.resolve(options.dataDir ?? process.env.DATA_DIR ?? path.join(SERVER_ROOT, 'data'));
  const uploadDir = path.resolve(options.uploadDir ?? process.env.UPLOAD_DIR ?? path.join(SERVER_ROOT, 'uploads'));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  return {
    port: Number(options.port ?? process.env.PORT ?? 3000),
    dataDir,
    uploadDir,
    dbFile: options.dbFile ?? path.join(dataDir, 'wechat.db'),
    clientDist: path.resolve(options.clientDist ?? path.join(SERVER_ROOT, '..', 'client', 'dist')),
    jwtSecret: options.jwtSecret ?? process.env.JWT_SECRET ?? loadSecret(dataDir),
    tokenTtl: options.tokenTtl ?? '30d',
  };
}
