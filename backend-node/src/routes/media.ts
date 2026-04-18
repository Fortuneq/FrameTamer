import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  renameSync,
  copyFileSync,
} from 'fs';
import { join, extname } from 'path';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';

const router = Router();

const upload = multer({
  dest: config.tempDir,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 GB
});

/** Extract a route param as a plain string (Express 5 types it as string | string[]). */
function param(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : v;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getMediaType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.aac', '.flac', '.ogg'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
  return 'other';
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/media — list all media files
router.get('/', (_req: Request, res: Response) => {
  if (!existsSync(config.mediaDir)) {
    res.json([]);
    return;
  }

  const files = readdirSync(config.mediaDir).map(f => {
    const fullPath = join(config.mediaDir, f);
    const stat = statSync(fullPath);
    return {
      filename: f,
      original_name: f,
      size: stat.size,
      size_human: humanSize(stat.size),
      media_type: getMediaType(f),
    };
  });

  res.json(files);
});

// POST /api/media/upload — upload a media file
router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const ext = extname(file.originalname);
  const dest = join(config.mediaDir, `${uuid()}${ext}`);

  try {
    renameSync(file.path, dest);
  } catch {
    // Cross-device move fallback
    copyFileSync(file.path, dest);
    unlinkSync(file.path);
  }

  const stat = statSync(dest);
  res.json({
    filename: dest.split('/').pop()!,
    original_name: file.originalname,
    size: stat.size,
    size_human: humanSize(stat.size),
    media_type: getMediaType(file.originalname),
  });
});

// GET /api/media/:filename — serve a media file
router.get('/:filename', (req: Request, res: Response) => {
  const filePath = join(config.mediaDir, param(req, 'filename'));
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.sendFile(filePath);
});

// DELETE /api/media/:filename — delete a media file
router.delete('/:filename', (req: Request, res: Response) => {
  const filePath = join(config.mediaDir, param(req, 'filename'));
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  unlinkSync(filePath);
  res.status(204).send();
});

export default router;
