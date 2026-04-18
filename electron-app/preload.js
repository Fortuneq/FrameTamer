'use strict';

/**
 * Preload script — runs in a privileged context but exposes only a narrow,
 * explicitly typed API surface to the renderer via contextBridge.
 *
 * Security rules enforced here:
 *   - No raw Node.js APIs are forwarded to the renderer.
 *   - IPC channel names are hardcoded so the renderer cannot call arbitrary
 *     channels.
 *   - All arguments are forwarded as-is; validation happens in the main
 *     process IPC handlers.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── File dialogs ──────────────────────────────────────────────────────────

  /**
   * Opens a native file picker for video files.
   * @returns {Promise<string|null>} Absolute path chosen by the user, or null.
   */
  selectVideo: () => ipcRenderer.invoke('select-video'),

  /**
   * Opens a native save dialog for the exported video.
   * @param {string} [defaultName] - Suggested filename.
   * @returns {Promise<string|null>} Absolute save path, or null if cancelled.
   */
  selectSavePath: (defaultName) => ipcRenderer.invoke('select-save-path', defaultName),

  // ── App metadata ──────────────────────────────────────────────────────────

  /** Resolves to the Electron app version string (e.g. "0.1.0"). */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /** Resolves to the OS platform string: "darwin" | "win32" | "linux". */
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // ── Synchronous read-only properties ─────────────────────────────────────

  /** True when the page is loaded inside Electron (always true here). */
  isElectron: true,

  /** OS platform string — sync shortcut so components can read it without await. */
  platform: process.platform,

  // ── Event subscriptions (main → renderer) ────────────────────────────────

  /**
   * Listen for the "Open Video" menu action triggered from the application menu.
   * @param {(filePath: string) => void} callback
   * @returns {() => void} Unsubscribe function.
   */
  onMenuOpenVideo: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('menu:open-video', handler);
    // Return a cleanup function
    return () => ipcRenderer.removeListener('menu:open-video', handler);
  },
});
