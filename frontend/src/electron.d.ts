/**
 * Type declarations for the Electron preload API exposed via contextBridge.
 *
 * When the React app is running inside Electron, `window.electronAPI` is
 * injected by preload.js.  In a plain browser environment the property is
 * absent, so every usage site should guard with `window.electronAPI?.`.
 */

interface ElectronAPI {
  // ── File dialogs ────────────────────────────────────────────────────────

  /** Open a native file picker for video files. Returns the chosen absolute
   *  path, or null if the user cancelled. */
  selectVideo: () => Promise<string | null>;

  /** Open a native save dialog.  Returns the chosen absolute save path, or
   *  null if the user cancelled. */
  selectSavePath: (defaultName?: string) => Promise<string | null>;

  // ── App metadata ────────────────────────────────────────────────────────

  /** Resolves to the Electron app version string (e.g. "0.1.0"). */
  getAppVersion: () => Promise<string>;

  /** Resolves to the OS platform: "darwin" | "win32" | "linux". */
  getPlatform: () => Promise<string>;

  // ── Synchronous read-only properties ───────────────────────────────────

  /** Always true when running inside Electron. */
  isElectron: true;

  /** OS platform string — synchronous shortcut. */
  platform: 'darwin' | 'win32' | 'linux' | string;

  // ── Event subscriptions (main → renderer) ──────────────────────────────

  /**
   * Subscribe to the "Open Video" application menu action.
   * The callback receives the file path selected by the user.
   * Returns a cleanup / unsubscribe function.
   */
  onMenuOpenVideo: (callback: (filePath: string) => void) => () => void;
}

declare global {
  interface Window {
    /**
     * Present only when the app is running inside Electron.
     * Always guard access with optional chaining: `window.electronAPI?.selectVideo()`.
     */
    electronAPI?: ElectronAPI;
  }
}

export {};
