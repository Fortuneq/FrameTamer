'use strict';

/**
 * Development launcher — starts all three processes in the correct order:
 *
 *   1. backend-node (Express API on :8000) via `tsx watch`
 *   2. Vite dev server (React frontend on :5173)
 *   3. Electron main process (loads http://localhost:5173)
 *
 * Electron is launched only after both HTTP servers are reachable.
 * Killing this process (Ctrl-C) tears down all children.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend-node');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const ELECTRON_DIR = __dirname;

const BACKEND_PORT = 8000;
const VITE_PORT = 5173;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60_000; // 1 minute — Vite can be slow on first run

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Spawn a child process with inherited stdio and return it. */
function spawnInherited(cmd, args, cwd, extraEnv = {}) {
  console.log(`[dev] Starting: ${cmd} ${args.join(' ')}  (cwd: ${cwd})`);
  return spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32', // needed on Windows for npx
    env: { ...process.env, ...extraEnv },
  });
}

/** Poll a URL until it responds with an HTTP 200 (or any 2xx). */
function waitForHttp(url, timeoutMs = POLL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      const req = http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          clearInterval(timer);
          resolve();
        }
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for ${url}`));
        }
      });
      req.end();
    }, POLL_INTERVAL_MS);
  });
}

/** Kill a child process gracefully, then forcefully if needed. */
function killChild(child, label) {
  if (!child || child.exitCode !== null) return;
  console.log(`[dev] Stopping ${label}...`);
  child.kill('SIGTERM');
  setTimeout(() => {
    try { child.kill('SIGKILL'); } catch (_) {}
  }, 3000);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Start the backend
  const backend = spawnInherited(
    'npx',
    ['tsx', 'watch', 'src/index.ts'],
    BACKEND_DIR,
  );

  backend.on('error', (err) => {
    console.error(`[dev] backend error: ${err.message}`);
  });

  // 2. Start Vite
  const vite = spawnInherited(
    'npx',
    ['vite', '--port', String(VITE_PORT)],
    FRONTEND_DIR,
  );

  vite.on('error', (err) => {
    console.error(`[dev] vite error: ${err.message}`);
  });

  // 3. Wait for both servers to be ready
  console.log('[dev] Waiting for backend and Vite to be ready...');
  try {
    await Promise.all([
      waitForHttp(`http://localhost:${BACKEND_PORT}/health`),
      waitForHttp(`http://localhost:${VITE_PORT}`),
    ]);
  } catch (err) {
    console.error(`[dev] ${err.message}`);
    killChild(backend, 'backend');
    killChild(vite, 'vite');
    process.exit(1);
  }

  console.log('[dev] Both servers ready. Launching Electron...');

  // 4. Launch Electron
  const electron = spawnInherited(
    'npx',
    ['electron', '.'],
    ELECTRON_DIR,
    { NODE_ENV: 'development' },
  );

  electron.on('error', (err) => {
    console.error(`[dev] electron error: ${err.message}`);
  });

  // When Electron exits, tear down everything else
  electron.on('close', (code) => {
    console.log(`[dev] Electron exited (code ${code}). Shutting down...`);
    killChild(backend, 'backend');
    killChild(vite, 'vite');
    process.exit(code ?? 0);
  });
}

// ─── Cleanup on Ctrl-C / SIGTERM ────────────────────────────────────────────

let _backend, _vite;

process.on('SIGINT', () => {
  console.log('\n[dev] Received SIGINT. Cleaning up...');
  killChild(_backend, 'backend');
  killChild(_vite, 'vite');
  process.exit(0);
});

process.on('SIGTERM', () => {
  killChild(_backend, 'backend');
  killChild(_vite, 'vite');
  process.exit(0);
});

main().catch((err) => {
  console.error('[dev] Fatal:', err);
  process.exit(1);
});
