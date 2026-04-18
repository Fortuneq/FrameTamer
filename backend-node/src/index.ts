import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import projectsRouter from './routes/projects.js';
import agentsRouter from './routes/agents.js';
import mediaRouter from './routes/media.js';

const app = express();

// Allow requests from Vite dev server and Tauri dev server
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:1420',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:1420',
    ],
  }),
);

app.use(express.json({ limit: '50mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/projects', projectsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/media', mediaRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.2.0',
    engine: 'claude-cli',
    dataDir: config.dataDir,
  });
});

// Open folder in Finder/Explorer
app.post('/api/open-folder', async (req, res) => {
  const folderPath = req.body?.path as string;
  if (!folderPath) { res.status(400).json({ error: 'path required' }); return; }
  const { exec } = await import('child_process');
  const cmd = process.platform === 'darwin' ? `open "${folderPath}"`
    : process.platform === 'win32' ? `explorer "${folderPath}"`
    : `xdg-open "${folderPath}"`;
  exec(cmd, (err) => {
    if (err) { res.status(500).json({ error: err.message }); return; }
    res.json({ ok: true });
  });
});

// Claude CLI status check (accessible via /api/status through Vite proxy)
app.get('/api/status', async (_req, res) => {
  const { execSync } = await import('child_process');
  let claudeVersion = '';
  let claudeAvailable = false;
  try {
    claudeVersion = execSync('claude --version 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
    claudeAvailable = true;
  } catch {
    claudeAvailable = false;
  }

  let ffmpegAvailable = false;
  try {
    execSync('ffmpeg -version 2>/dev/null', { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }

  let whisperAvailable = false;
  try {
    execSync('python3 -c "import faster_whisper" 2>/dev/null', { timeout: 5000 });
    whisperAvailable = true;
  } catch {
    whisperAvailable = false;
  }

  res.json({
    claude: { available: claudeAvailable, version: claudeVersion },
    ffmpeg: { available: ffmpegAvailable },
    whisper: { available: whisperAvailable },
    dataDir: config.dataDir,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  console.log(`\nMyDescript backend (Claude-powered) running on http://localhost:${config.port}`);
  console.log(`   Projects : ${config.projectsDir}`);
  console.log(`   Media    : ${config.mediaDir}`);
  console.log(`   Temp     : ${config.tempDir}\n`);
});
