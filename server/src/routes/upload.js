import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { MAX_UPLOAD_BYTES } from '../config.js';
import { badRequest } from '../util.js';

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
/** Extensions the browser may render inline from /uploads; everything else is served as a download. */
export const INLINE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mp3', 'ogg', 'wav', 'm4a']);

export function serveUploads(uploadDir) {
  return express.static(uploadDir, {
    index: false,
    maxAge: '30d',
    immutable: true,
    setHeaders(res, filePath) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // User content must never run script in our origin.
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      const ext = path.extname(filePath).slice(1).toLowerCase();
      if (!INLINE_EXTENSIONS.has(ext)) res.setHeader('Content-Disposition', 'attachment');
    },
  });
}

export default function uploadRoutes({ config }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: config.uploadDir,
      filename(req, file, cb) {
        let ext = IMAGE_TYPES[file.mimetype];
        if (req.query.kind === 'file' || !ext) {
          const fromName = path.extname(file.originalname).slice(1).toLowerCase();
          ext = /^[a-z0-9]{1,10}$/.test(fromName) ? fromName : 'bin';
        }
        cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${ext}`);
      },
    }),
    // Browsers send raw UTF-8 filenames; without this, Chinese names arrive as mojibake.
    defParamCharset: 'utf8',
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter(req, file, cb) {
      if (req.query.kind !== 'file' && !IMAGE_TYPES[file.mimetype]) {
        return cb(badRequest('只支持 JPG、PNG、GIF、WebP 格式的图片'));
      }
      cb(null, true);
    },
  });

  router.post('/', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return next(badRequest('文件不能超过 20MB'));
      if (err) return next(err.status ? err : badRequest('上传失败'));
      if (!req.file) return next(badRequest('请选择要上传的文件'));
      res.status(201).json({
        url: `/uploads/${req.file.filename}`,
        name: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype,
      });
    });
  });

  return router;
}
