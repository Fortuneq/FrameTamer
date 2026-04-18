import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { join } from 'path';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  mkdirSync,
} from 'fs';
import { config } from '../config.js';
import {
  createProject,
  loadProject,
  listProjects,
  deleteProject,
  saveProject,
  getProjectDir,
  getTranscriptPath,
} from '../services/project-store.js';
import type { Project, Transcript } from '../types.js';

const router = Router();

const upload = multer({
  dest: config.tempDir,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 GB
});

/** Extract a param as a plain string (Express 5 types it as string | string[]). */
function param(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : v;
}

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

// GET /api/projects — list all projects
router.get('/', (_req: Request, res: Response) => {
  res.json(listProjects());
});

// POST /api/projects — create a new project by uploading a video file
router.post('/', upload.single('file'), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const name = (req.body.name as string | undefined) || file.originalname.replace(/\.[^/.]+$/, '');

  // createProject probes the video at its current temp path
  const project = createProject(name, file.path, file.originalname);

  // Move the uploaded file into the project directory
  const finalPath = join(getProjectDir(project.id), file.originalname);
  try {
    renameSync(file.path, finalPath);
  } catch {
    // Cross-device rename (e.g. tmpfs -> home dir) — fall back to copy + unlink
    copyFileSync(file.path, finalPath);
    unlinkSync(file.path);
  }

  project.videoPath = finalPath;
  saveProject(project);

  res.status(201).json(project);
});

// GET /api/projects/:id — get single project
router.get('/:id', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

// PATCH /api/projects/:id — update name / status
router.patch('/:id', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (typeof req.body.name === 'string') project.name = req.body.name as string;
  if (typeof req.body.status === 'string') project.status = req.body.status as Project['status'];

  saveProject(project);
  res.json(project);
});

// DELETE /api/projects/:id — remove project and all its files
router.delete('/:id', (req: Request, res: Response) => {
  if (!deleteProject(param(req, 'id'))) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Media serving
// ---------------------------------------------------------------------------

// GET /api/projects/:id/video — stream video file
router.get('/:id/video', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project || !existsSync(project.videoPath)) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }
  res.sendFile(project.videoPath);
});

// GET /api/projects/:id/files/:filename — serve any output file from project dir
router.get('/:id/files/:filename', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const filename = param(req, 'filename');
  const filePath = join(getProjectDir(project.id), filename);
  if (!existsSync(filePath) || filePath.includes('..')) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.sendFile(filePath);
});

// GET /api/projects/:id/thumbnail — serve thumbnail image
router.get('/:id/thumbnail', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project?.thumbnailPath || !existsSync(project.thumbnailPath)) {
    res.status(404).json({ error: 'Thumbnail not found' });
    return;
  }
  res.sendFile(project.thumbnailPath);
});

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

// GET /api/projects/:id/transcript
router.get('/:id/transcript', (req: Request, res: Response) => {
  const transcriptPath = getTranscriptPath(param(req, 'id'));
  if (!existsSync(transcriptPath)) {
    res.status(404).json({ error: 'No transcript yet. Run transcription first.' });
    return;
  }
  const data = JSON.parse(readFileSync(transcriptPath, 'utf-8')) as Transcript;
  res.json(data);
});

// PUT /api/projects/:id/transcript — overwrite full transcript
router.put('/:id/transcript', (req: Request, res: Response) => {
  const id = param(req, 'id');
  const project = loadProject(id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const transcript = req.body as Transcript;
  const transcriptPath = getTranscriptPath(id);
  writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));

  project.transcript = transcript;
  saveProject(project);
  res.json(transcript);
});

// ---------------------------------------------------------------------------
// Word-level editor operations
// ---------------------------------------------------------------------------

// POST /api/projects/:id/editor/words/delete — mark words as deleted
router.post('/:id/editor/words/delete', (req: Request, res: Response) => {
  const transcriptPath = getTranscriptPath(param(req, 'id'));
  if (!existsSync(transcriptPath)) {
    res.status(404).json({ error: 'No transcript' });
    return;
  }

  const transcript = JSON.parse(readFileSync(transcriptPath, 'utf-8')) as Transcript;
  const indices: number[] = Array.isArray(req.body.indices) ? (req.body.indices as number[]) : [];

  let globalIdx = 0;
  for (const seg of transcript.segments) {
    for (const word of seg.words) {
      if (indices.includes(globalIdx)) word.deleted = true;
      globalIdx++;
    }
  }

  writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
  res.json({ deleted: indices, message: `${indices.length} word(s) marked as deleted` });
});

// GET /api/projects/:id/outputs — list output files in project directory
router.get('/:id/outputs', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const projDir = getProjectDir(project.id);
  const files = readdirSync(projDir)
    .filter(f => {
      // Only show media output files, skip project internals
      if (f === 'project.json' || f === 'transcript.json' || f.startsWith('.')) return false;
      if (f === project.videoFilename) return false; // skip original video
      return /\.(mp4|mov|webm|avi|mkv|png|jpg|jpeg|gif|wav|mp3)$/i.test(f);
    })
    .map(f => {
      const fullPath = join(projDir, f);
      const stat = statSync(fullPath);
      const ext = f.split('.').pop()?.toLowerCase() ?? '';
      const isVideo = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
      const isImage = ['png', 'jpg', 'jpeg', 'gif'].includes(ext);
      const isAudio = ['wav', 'mp3'].includes(ext);
      return {
        filename: f,
        size: stat.size,
        sizeHuman: stat.size > 1024 * 1024
          ? `${(stat.size / 1024 / 1024).toFixed(1)} MB`
          : `${(stat.size / 1024).toFixed(1)} KB`,
        type: isVideo ? 'video' : isImage ? 'image' : isAudio ? 'audio' : 'other',
        url: `/api/projects/${project.id}/files/${f}`,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(files);
});

// POST /api/projects/:id/editor/words/restore — restore deleted words
router.post('/:id/editor/words/restore', (req: Request, res: Response) => {
  const transcriptPath = getTranscriptPath(param(req, 'id'));
  if (!existsSync(transcriptPath)) {
    res.status(404).json({ error: 'No transcript' });
    return;
  }

  const transcript = JSON.parse(readFileSync(transcriptPath, 'utf-8')) as Transcript;
  const indices: number[] = Array.isArray(req.body.indices) ? (req.body.indices as number[]) : [];

  let globalIdx = 0;
  for (const seg of transcript.segments) {
    for (const word of seg.words) {
      if (indices.includes(globalIdx)) word.deleted = false;
      globalIdx++;
    }
  }

  writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
  res.json({ restored: indices, message: `${indices.length} word(s) restored` });
});

// ---------------------------------------------------------------------------
// Frame extraction
// ---------------------------------------------------------------------------

// POST /api/projects/:id/extract-frames — extract frames from video using ffmpeg
router.post('/:id/extract-frames', async (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const interval = (req.body?.interval as number) ?? 30; // seconds between frames
  const projDir = getProjectDir(project.id);
  const framesDir = join(projDir, 'frames');
  mkdirSync(framesDir, { recursive: true });

  const duration = project.duration ?? 0;
  if (duration === 0) { res.status(400).json({ error: 'Unknown video duration' }); return; }

  // Use ffmpeg to extract frames
  const { execSync } = await import('child_process');
  try {
    // fps = 1/interval, outputs frame_000001.jpg, frame_000002.jpg, etc.
    execSync(
      `ffmpeg -y -i "${project.videoPath}" -vf "fps=1/${interval},scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2" -q:v 8 "${join(framesDir, 'frame_%06d.jpg')}"`,
      { timeout: 120000 }
    );

    // Rename to include timestamp: frame_000001.jpg -> frame_000030.jpg (first frame = 30s)
    const rawFrames = readdirSync(framesDir).filter(f => f.startsWith('frame_')).sort();
    const frames: { filename: string; time: number; url: string }[] = [];

    rawFrames.forEach((f, idx) => {
      const timeSec = (idx + 1) * interval; // frame_000001 = first interval
      if (timeSec > duration) return; // skip frames beyond video length
      const newName = `frame_${String(timeSec).padStart(6, '0')}.jpg`;
      if (f !== newName) {
        renameSync(join(framesDir, f), join(framesDir, newName));
      }
      frames.push({
        filename: newName,
        time: timeSec,
        url: `/api/projects/${project.id}/frames/${newName}`,
      });
    });

    res.json({ frames, count: frames.length, interval });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Frame extraction failed';
    res.status(500).json({ error: message });
  }
});

// GET /api/projects/:id/frames — list extracted frames
router.get('/:id/frames', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const framesDir = join(getProjectDir(project.id), 'frames');
  if (!existsSync(framesDir)) { res.json([]); return; }

  const frames = readdirSync(framesDir)
    .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort()
    .map(f => {
      const timeSec = parseInt(f.replace('frame_', '').replace('.jpg', ''), 10);
      return {
        filename: f,
        time: timeSec,
        url: `/api/projects/${project.id}/frames/${f}`,
      };
    });

  res.json(frames);
});

// GET /api/projects/:id/frames/:filename — serve a frame image
router.get('/:id/frames/:filename', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const filename = param(req, 'filename');
  const framePath = join(getProjectDir(project.id), 'frames', filename);
  if (!existsSync(framePath) || filename.includes('..')) {
    res.status(404).json({ error: 'Frame not found' });
    return;
  }
  res.sendFile(framePath);
});

// DELETE /api/projects/:id/video — remove the original project video
router.delete('/:id/video', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  if (project.videoFilename && project.videoPath) {
    const videoPath = join(getProjectDir(project.id), project.videoFilename);
    if (existsSync(videoPath)) {
      try { unlinkSync(videoPath); } catch { /* ignore */ }
    }
  }

  project.videoFilename = undefined as unknown as string;
  project.videoPath = undefined as unknown as string;
  project.duration = 0;
  project.width = 0;
  project.height = 0;
  saveProject(project);

  res.status(204).end();
});

// POST /api/projects/:id/import — import additional media files into project
router.post('/:id/import', upload.single('file'), (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const file = req.file;
  if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const projDir = getProjectDir(project.id);
  const destPath = join(projDir, file.originalname);
  try {
    renameSync(file.path, destPath);
  } catch {
    copyFileSync(file.path, destPath);
    unlinkSync(file.path);
  }

  res.json({ filename: file.originalname, path: destPath });
});

// GET /api/projects/:id/inputs — list imported media files (excludes original project video)
router.get('/:id/inputs', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const projDir = getProjectDir(project.id);
  const files = readdirSync(projDir)
    .filter(f => {
      if (f === 'project.json' || f === 'transcript.json' || f.startsWith('.')) return false;
      if (f === project.videoFilename) return false; // skip original video (shown separately)
      return /\.(mp4|mov|webm|avi|mkv|png|jpg|jpeg|gif|wav|mp3)$/i.test(f);
    })
    .map(f => {
      const fullPath = join(projDir, f);
      const stat = statSync(fullPath);
      const ext = f.split('.').pop()?.toLowerCase() ?? '';
      const isVideo = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
      const isImage = ['png', 'jpg', 'jpeg', 'gif'].includes(ext);
      const isAudio = ['wav', 'mp3'].includes(ext);
      return {
        filename: f,
        size: stat.size,
        sizeHuman: stat.size > 1024 * 1024
          ? `${(stat.size / 1024 / 1024).toFixed(1)} MB`
          : `${(stat.size / 1024).toFixed(1)} KB`,
        type: isVideo ? 'video' : isImage ? 'image' : isAudio ? 'audio' : 'other',
        url: `/api/projects/${project.id}/files/${f}`,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(files);
});

// DELETE /api/projects/:id/files/:filename — delete an imported media file
router.delete('/:id/files/:filename', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const filename = param(req, 'filename');
  // Prevent path traversal and protect original video
  if (filename.includes('..') || filename.includes('/') || filename === project.videoFilename) {
    res.status(400).json({ error: 'Cannot delete this file' });
    return;
  }

  const filePath = join(getProjectDir(project.id), filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  unlinkSync(filePath);
  res.status(204).end();
});

export default router;
