import { Router, type Request, type Response } from 'express';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  runClaude,
  continueTask,
  getTask,
  getAllTasks,
  getTasksByProject,
  getTaskEmitter,
  killTask,
} from '../services/claude-runner.js';
import {
  loadProject,
  saveProject,
  getProjectDir,
  getTranscriptPath,
} from '../services/project-store.js';
import {
  buildTranscribePrompt,
  buildFillerWordsPrompt,
  buildSmartEditPrompt,
  buildExportPrompt,
  buildChaptersPrompt,
  buildCustomPrompt,
} from '../services/agent-tasks.js';

const router = Router();

/** Extract a route param as a plain string (Express 5 types it as string | string[]). */
function param(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : v;
}

// ---------------------------------------------------------------------------
// Task inspection
// ---------------------------------------------------------------------------

// GET /api/agents/tasks — list all tasks (across all projects)
router.get('/tasks', (_req: Request, res: Response) => {
  res.json(getAllTasks());
});

// GET /api/agents/projects/:id/tasks — tasks for one project
router.get('/projects/:id/tasks', (req: Request, res: Response) => {
  res.json(getTasksByProject(param(req, 'id')));
});

// GET /api/agents/tasks/:taskId — single task details
router.get('/tasks/:taskId', (req: Request, res: Response) => {
  const task = getTask(param(req, 'taskId'));
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

// GET /api/agents/tasks/:taskId/stream — Server-Sent Events output stream
router.get('/tasks/:taskId/stream', (req: Request, res: Response) => {
  const task = getTask(param(req, 'taskId'));
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Replay buffered output for late-joining clients
  for (const line of task.output) {
    res.write(`data: ${JSON.stringify({ type: 'output', text: line })}\n\n`);
  }

  // If the task has already finished, send a terminal event and close
  if (task.status !== 'running') {
    res.write(
      `data: ${JSON.stringify({ type: 'done', status: task.status, error: task.errorMessage })}\n\n`,
    );
    res.end();
    return;
  }

  const emitter = getTaskEmitter(task.id);
  if (!emitter) {
    res.write(`data: ${JSON.stringify({ type: 'done', status: task.status })}\n\n`);
    res.end();
    return;
  }

  const onData = (line: string) => {
    res.write(`data: ${JSON.stringify({ type: 'output', text: line })}\n\n`);
  };

  const onDone = () => {
    res.write(
      `data: ${JSON.stringify({ type: 'done', status: task.status, error: task.errorMessage })}\n\n`,
    );
    res.end();
  };

  emitter.on('data', onData);
  emitter.on('done', onDone);

  // Clean up listeners when the client disconnects
  req.on('close', () => {
    emitter.off('data', onData);
    emitter.off('done', onDone);
  });
});

// ---------------------------------------------------------------------------
// Task control
// ---------------------------------------------------------------------------

// POST /api/agents/tasks/:taskId/kill
router.post('/tasks/:taskId/kill', (req: Request, res: Response) => {
  const killed = killTask(param(req, 'taskId'));
  if (!killed) {
    res.status(400).json({ error: 'Task not running or not found' });
    return;
  }
  res.json({ message: 'Task cancelled' });
});

// ---------------------------------------------------------------------------
// Agent task spawning
// ---------------------------------------------------------------------------

// POST /api/agents/projects/:id/transcribe
router.post('/projects/:id/transcribe', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const language = (req.body?.language as string | undefined) ?? 'auto';
  const outputPath = getTranscriptPath(project.id);
  const projDir = getProjectDir(project.id);

  project.status = 'transcribing';
  saveProject(project);

  const task = runClaude({
    projectId: project.id,
    type: 'transcribe',
    prompt: buildTranscribePrompt(project.videoPath, outputPath, language),
    cwd: projDir,
    maxTurns: 30,
    onComplete: (t) => {
      const p = loadProject(project.id);
      if (p) {
        p.status = t.status === 'completed' ? 'ready' : 'error';
        if (t.status === 'error') p.errorMessage = t.errorMessage;
        saveProject(p);
      }
    },
  });

  res.json({ taskId: task.id, message: 'Transcription agent started' });
});

// POST /api/agents/projects/:id/ai/filler-words
router.post('/projects/:id/ai/filler-words', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const transcriptPath = getTranscriptPath(project.id);
  if (!existsSync(transcriptPath)) {
    res.status(400).json({ error: 'No transcript. Run transcription first.' });
    return;
  }

  const task = runClaude({
    projectId: project.id,
    type: 'filler_words',
    prompt: buildFillerWordsPrompt(transcriptPath),
    cwd: getProjectDir(project.id),
    maxTurns: 15,
  });

  res.json({ taskId: task.id, message: 'Filler word detection agent started' });
});

// POST /api/agents/projects/:id/ai/smart-edit
router.post('/projects/:id/ai/smart-edit', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const instruction = req.body?.instruction as string | undefined;
  if (!instruction) {
    res.status(400).json({ error: 'instruction field required' });
    return;
  }

  const transcriptPath = getTranscriptPath(project.id);
  if (!existsSync(transcriptPath)) {
    res.status(400).json({ error: 'No transcript. Run transcription first.' });
    return;
  }

  const task = runClaude({
    projectId: project.id,
    type: 'smart_edit',
    prompt: buildSmartEditPrompt(transcriptPath, instruction),
    cwd: getProjectDir(project.id),
    maxTurns: 15,
  });

  res.json({ taskId: task.id, message: 'Smart edit agent started' });
});

// POST /api/agents/projects/:id/ai/chapters
router.post('/projects/:id/ai/chapters', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const transcriptPath = getTranscriptPath(project.id);
  if (!existsSync(transcriptPath)) {
    res.status(400).json({ error: 'No transcript. Run transcription first.' });
    return;
  }

  const task = runClaude({
    projectId: project.id,
    type: 'chapters',
    prompt: buildChaptersPrompt(transcriptPath),
    cwd: getProjectDir(project.id),
    maxTurns: 10,
  });

  res.json({ taskId: task.id, message: 'Chapter generation agent started' });
});

// POST /api/agents/projects/:id/export
router.post('/projects/:id/export', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const transcriptPath = getTranscriptPath(project.id);
  if (!existsSync(transcriptPath)) {
    res.status(400).json({ error: 'No transcript. Run transcription first.' });
    return;
  }

  const format = (req.body?.format as string | undefined) ?? 'mp4';
  const outputPath = join(getProjectDir(project.id), `export.${format}`);

  project.status = 'exporting';
  saveProject(project);

  const task = runClaude({
    projectId: project.id,
    type: 'export',
    prompt: buildExportPrompt(project.videoPath, transcriptPath, outputPath, format),
    cwd: getProjectDir(project.id),
    maxTurns: 20,
    onComplete: (t) => {
      const p = loadProject(project.id);
      if (p) {
        p.status = t.status === 'completed' ? 'exported' : 'error';
        if (t.status === 'error') p.errorMessage = t.errorMessage;
        saveProject(p);
      }
    },
  });

  res.json({ taskId: task.id, message: 'Export agent started' });
});

// POST /api/agents/projects/:id/ai/custom
router.post('/projects/:id/ai/custom', (req: Request, res: Response) => {
  const project = loadProject(param(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const instruction = req.body?.instruction as string | undefined;
  if (!instruction) {
    res.status(400).json({ error: 'instruction field required' });
    return;
  }

  const projDir = getProjectDir(project.id);
  const transcriptPath = getTranscriptPath(project.id);
  const hasTranscript = existsSync(transcriptPath);

  // Build transcript preview for context
  let transcriptPreview = '';
  if (hasTranscript) {
    try {
      const raw = JSON.parse(readFileSync(transcriptPath, 'utf-8'));
      const words: string[] = [];
      for (const seg of raw.segments ?? []) {
        for (const w of seg.words ?? []) {
          if (!w.deleted) words.push(w.word);
        }
      }
      transcriptPreview = words.join(' ').slice(0, 2000);
    } catch { /* ignore */ }
  }

  const framesDir = join(projDir, 'frames');
  const hasFrames = existsSync(framesDir) &&
    readdirSync(framesDir).some((f: string) => f.startsWith('frame_') && f.endsWith('.jpg'));

  // Collect imported media files (excluding original video and internal files)
  const importedFiles = readdirSync(projDir).filter(f => {
    if (f === 'project.json' || f === 'transcript.json' || f.startsWith('.')) return false;
    if (f === project.videoFilename) return false;
    if (f === 'frames') return false;
    if (f === 'thumbnails') return false;
    return /\.(mp4|mov|webm|avi|mkv|png|jpg|jpeg|gif|wav|mp3)$/i.test(f);
  });

  const ctx = {
    projectDir: projDir,
    videoPath: project.videoPath ?? '',
    videoFilename: project.videoFilename ?? '',
    duration: project.duration ?? 0,
    width: project.width ?? 0,
    height: project.height ?? 0,
    transcriptPath,
    hasTranscript,
    transcriptPreview: transcriptPreview || undefined,
    framesDir,
    hasFrames,
    importedFiles,
  };

  const task = runClaude({
    projectId: project.id,
    type: 'custom',
    prompt: buildCustomPrompt(ctx, instruction),
    cwd: projDir,
    maxTurns: 50,
  });

  res.json({ taskId: task.id, message: 'Custom agent started' });
});

// POST /api/agents/tasks/:taskId/continue — continue an existing Claude session
router.post('/tasks/:taskId/continue', (req: Request, res: Response) => {
  const taskId = param(req, 'taskId');
  const prevTask = getTask(taskId);

  if (!prevTask) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (!prevTask.claudeSessionId) {
    res.status(400).json({ error: 'Task has no Claude session ID — cannot continue' });
    return;
  }

  const instruction = req.body?.instruction as string | undefined;
  if (!instruction) {
    res.status(400).json({ error: 'instruction field required' });
    return;
  }

  const newTask = continueTask(taskId, instruction);
  if (!newTask) {
    res.status(500).json({ error: 'Failed to continue task' });
    return;
  }

  res.json({ taskId: newTask.id, message: 'Continued Claude session' });
});

export default router;
