import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

export const config = {
  port: 8000,
  dataDir: join(homedir(), 'ClipForge'),
  get projectsDir() { return join(this.dataDir, 'projects'); },
  get mediaDir() { return join(this.dataDir, 'media'); },
  get tempDir() { return join(this.dataDir, 'temp'); },
};

// Ensure dirs exist on startup
[config.dataDir, config.projectsDir, config.mediaDir, config.tempDir].forEach(d =>
  mkdirSync(d, { recursive: true })
);
