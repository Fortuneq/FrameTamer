'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const http = require('http');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PORT = 8000;
const IS_DEV = process.env.NODE_ENV === 'development';
const VITE_URL = 'http://localhost:5173';

// ─────────────────────────────────────────────────────────────────────────────
// Embedded Express server (production only)
// In dev mode the standalone backend-node process handles API calls.
// ─────────────────────────────────────────────────────────────────────────────

let embeddedServer = null;

/**
 * Boot the Express API server that is bundled next to this main.js.
 * The server source lives in ./server/ (copied from backend-node/dist at
 * build time via electron-builder extraResources) or, during local testing
 * of the electron-app itself, is shimmed from ../backend-node/src via tsx.
 */
async function startEmbeddedServer() {
  return new Promise((resolve, reject) => {
    // Resolve the path to the compiled server entry point.
    // electron-builder places extraResources under process.resourcesPath.
    const resourcesServer = path.join(process.resourcesPath ?? __dirname, 'server', 'index.js');
    // Fallback: alongside main.js when running un-packaged with NODE_ENV=production
    const localServer = path.join(__dirname, 'server', 'index.js');

    const serverEntry = require('fs').existsSync(resourcesServer)
      ? resourcesServer
      : localServer;

    if (!require('fs').existsSync(serverEntry)) {
      const msg = `Embedded server entry not found.\nChecked:\n  ${resourcesServer}\n  ${localServer}`;
      console.error(msg);
      reject(new Error(msg));
      return;
    }

    // The compiled server calls app.listen() itself, so we just require() it.
    // We wait until the port is accepting connections before resolving.
    try {
      require(serverEntry);
    } catch (err) {
      reject(err);
      return;
    }

    // Poll until the server port is open (max 10 s).
    const deadline = Date.now() + 10_000;
    const poll = setInterval(() => {
      const req = http.get(`http://localhost:${PORT}/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(poll);
          console.log(`[main] Embedded server ready on http://localhost:${PORT}`);
          resolve();
        }
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          clearInterval(poll);
          reject(new Error('Embedded server did not start within 10 s'));
        }
      });
      req.end();
    }, 300);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Window management
// ─────────────────────────────────────────────────────────────────────────────

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#f5f0ff',
    show: false,
    icon: process.platform === 'linux'
      ? path.join(__dirname, 'build', 'icon.png')
      : undefined,
  });

  // Security: restrict navigation to known origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = [
      `http://localhost:${PORT}`,
      VITE_URL,
      'file://',
    ];
    const isAllowed = allowed.some(origin => url.startsWith(origin));
    if (!isAllowed) {
      event.preventDefault();
      console.warn(`[security] Blocked navigation to: ${url}`);
    }
  });

  // Open external links in the system browser rather than inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (IS_DEV) {
    mainWindow.loadURL(VITE_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production the React build is served by the Express server on PORT.
    // Alternatively the static files could be loaded directly from disk if
    // the Express server also serves them — either approach works.
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  buildApplicationMenu();
}

// ─────────────────────────────────────────────────────────────────────────────
// Application menu
// ─────────────────────────────────────────────────────────────────────────────

function buildApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS app menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Video...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const filePath = await pickVideoFile(mainWindow);
            if (filePath) {
              mainWindow.webContents.send('menu:open-video', filePath);
            }
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ]
          : [{ role: 'close' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

/** Open a native file picker for videos and return the chosen path (or null). */
async function pickVideoFile(win) {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select a video file',
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

ipcMain.handle('select-video', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  return pickVideoFile(win);
});

ipcMain.handle('select-save-path', async (event, defaultName) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  const result = await dialog.showSaveDialog(win, {
    title: 'Save exported video',
    defaultPath: defaultName ?? 'export.mp4',
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'MOV Video', extensions: ['mov'] },
    ],
  });
  return result.canceled ? null : result.filePath ?? null;
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-platform', () => process.platform);

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Content Security Policy for all web content loaded in the app
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self' http://localhost:8000 http://localhost:5173",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob: http://localhost:8000 http://localhost:5173",
            "media-src 'self' blob: http://localhost:8000",
            "connect-src 'self' http://localhost:8000 http://localhost:5173 ws://localhost:5173",
            "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
          ].join('; '),
        ],
      },
    });
  });

  if (!IS_DEV) {
    try {
      await startEmbeddedServer();
    } catch (err) {
      dialog.showErrorBox(
        'Startup error',
        `MyDescript could not start its internal server:\n\n${err.message}`,
      );
      app.quit();
      return;
    }
  }

  createWindow();

  app.on('activate', () => {
    // macOS: re-create the window when clicking the dock icon
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS it is conventional to keep the app running until Cmd+Q
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (embeddedServer) {
    embeddedServer.close();
    embeddedServer = null;
  }
});

// Prevent privilege escalation via remote-module or renderer node access
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    // Deny all <webview> tags — not needed by this app
    event.preventDefault();
  });
});
