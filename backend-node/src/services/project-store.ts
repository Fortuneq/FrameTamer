import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import type { Project } from '../types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function projectFile(id: string): string {
  return join(config.projectsDir, id, 'project.json');
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export function saveProject(project: Project): void {
  project.updatedAt = new Date().toISOString();
  const dir = join(config.projectsDir, project.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(projectFile(project.id), JSON.stringify(project, null, 2));
}

export function loadProject(id: string): Project | null {
  const path = projectFile(id);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf-8'));

  // Migrate old Python backend format → new format
  const projDir = join(config.projectsDir, id);
  if (!raw.videoPath && raw.video_filename) {
    raw.videoPath = join(projDir, raw.video_filename);
    raw.videoFilename = raw.videoFilename ?? raw.video_filename;
  }
  if (!raw.thumbnailPath && raw.thumbnail_filename) {
    const thumbCandidate = join(projDir, 'thumbnails', raw.thumbnail_filename);
    if (existsSync(thumbCandidate)) raw.thumbnailPath = thumbCandidate;
  }
  if (!raw.duration && raw.video_info?.duration) {
    raw.duration = raw.video_info.duration;
  }
  if (!raw.width && raw.video_info?.width) {
    raw.width = raw.video_info.width;
    raw.height = raw.video_info.height;
  }
  if (!raw.createdAt && raw.created_at) {
    raw.createdAt = raw.created_at;
  }
  if (!raw.updatedAt && raw.updated_at) {
    raw.updatedAt = raw.updated_at;
  }

  return raw as Project;
}

export function listProjects(): Project[] {
  if (!existsSync(config.projectsDir)) return [];
  return readdirSync(config.projectsDir)
    .filter(d => existsSync(projectFile(d)))
    .map(d => JSON.parse(readFileSync(projectFile(d), 'utf-8')) as Project)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function deleteProject(id: string): boolean {
  const dir = join(config.projectsDir, id);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

// ---------------------------------------------------------------------------
// Project factory (probe video + thumbnail generation)
// ---------------------------------------------------------------------------

export function createProject(
  name: string,
  videoPath: string,
  originalFilename: string,
): Project {
  const id = uuid();
  const projDir = join(config.projectsDir, id);
  mkdirSync(projDir, { recursive: true });
  mkdirSync(join(projDir, 'thumbnails'), { recursive: true });

  // Probe video metadata via ffprobe
  let duration = 0;
  let width = 0;
  let height = 0;
  try {
    const probe = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
      { encoding: 'utf-8' },
    );
    const info = JSON.parse(probe) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type: string; width?: number; height?: number }>;
    };
    duration = parseFloat(info.format?.duration ?? '0');
    const videoStream = info.streams?.find(s => s.codec_type === 'video');
    if (videoStream) {
      width = videoStream.width ?? 0;
      height = videoStream.height ?? 0;
    }
  } catch {
    // ffprobe not installed or unsupported file — non-fatal
  }

  // Generate thumbnail at 1 s (or midpoint for very short clips)
  const thumbPath = join(projDir, 'thumbnails', 'thumb.jpg');
  try {
    const seekTo = Math.min(1, duration / 2);
    execSync(
      `ffmpeg -y -ss ${seekTo} -i "${videoPath}" -vframes 1 -q:v 5 "${thumbPath}" 2>/dev/null`,
    );
  } catch {
    // thumbnail generation is optional — ignore errors
  }

  const project: Project = {
    id,
    name,
    status: 'created',
    videoPath,
    videoFilename: originalFilename,
    thumbnailPath: existsSync(thumbPath) ? thumbPath : undefined,
    duration,
    width,
    height,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveProject(project);
  return project;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function getProjectDir(id: string): string {
  return join(config.projectsDir, id);
}

export function getTranscriptPath(id: string): string {
  return join(config.projectsDir, id, 'transcript.json');
}
