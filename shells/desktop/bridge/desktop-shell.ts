// Typed client for the desktop shell's own commands (G-05, P2.3.1). The web view imports this only
// when running inside the desktop shell (isDesktop() in shells/browser/src/platform-desktop.ts).
// The save database commands (db_*) are wrapped by that file's NativeDriver; this file wraps the rest.
import { invoke } from '@tauri-apps/api/core';

/** P2.3.1 game folder, P2.1.3 pool size and versions, as the shell reports them. */
export interface DesktopPlatformInfo {
  appVersion: string;
  os: string;
  arch: string;
  webviewVersion: string;
  logicalProcessors: number;
  /** Simulation pool size for this machine: logical processors minus 2, from 1 to 8 (P2.1.3). */
  poolSize: number;
  gameFolder: string;
  savesFolder: string;
  userContentFolder: string;
  logsFolder: string;
  exportsFolder: string;
  /** Always false in v1 (O5.6.1). */
  networkRequests: false;
}

export interface UserContentEntry { name: string; kind: 'folder' | 'zip'; sizeBytes: number }
export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';
export type GameSubfolder = 'saves' | 'user-content' | 'logs' | 'exports';
export type SecondWindowView = 'film' | 'callSheet' | 'booth' | 'reference';

/** Which window this client is (P2.3.3). Set by the shell before the bundle loads; absent means main. */
export interface WindowRole { role: 'main' | 'second'; view?: SecondWindowView }
declare global { interface Window { __GM_WINDOW__?: WindowRole } }
export const windowRole = (): WindowRole => (typeof window !== 'undefined' && window.__GM_WINDOW__) || { role: 'main' };

export const desktopShell = {
  info: () => invoke<DesktopPlatformInfo>('platform_info'),
  /** "Save a copy" (P5.8.1): a file copy under a new, free name. */
  copySave: (from: string, to: string) => invoke<void>('saves_copy', { from, to }),
  /** Native save dialog; resolves to the written path, or null when the user cancels (O5.6.1). */
  exportSaveWithDialog: (name: string) => invoke<string | null>('saves_export_dialog', { name }),
  /** Native open dialog; resolves to the new save's name, or null when the user cancels (O5.6.1). */
  importSaveWithDialog: () => invoke<string | null>('saves_import_dialog'),
  /** Packs found in the user content folder (P7.1.1). Validation (P4.2) is the client's job. */
  listUserContent: () => invoke<UserContentEntry[]>('content_list'),
  /** One file of a folder pack (path with '/' separators), or a whole zip pack when path is omitted. */
  readUserContent: async (pack: string, path?: string) => new Uint8Array(await invoke<number[]>('content_read', { pack, path: path ?? null })),
  openGameFolder: (sub?: GameSubfolder) => invoke<void>('open_game_folder', { sub: sub ?? null }),
  /** P2.2.1 `diagnostic` to the local log (O5.6). */
  log: (level: DiagnosticLevel, code: string, text: string) => invoke<void>('log_diagnostic', { level, code, text }),
  /** The last session's crash report, offered once on the next launch (O5.6.2). */
  takeCrashReport: () => invoke<string | null>('crash_report_take'),
  openSecondWindow: (view: SecondWindowView) => invoke<void>('window_open_second', { view }),
  closeSecondWindow: () => invoke<void>('window_close_second'),
};

/** Sends uncaught errors and rejections in the web view to the local log (P2.3.1 crash capture). */
export function captureWebViewErrors(target: Window = window): void {
  target.addEventListener('error', (e) => { void desktopShell.log('error', 'webview.error', `${e.message} at ${e.filename}:${e.lineno}:${e.colno}`).catch(() => undefined); });
  target.addEventListener('unhandledrejection', (e) => { void desktopShell.log('error', 'webview.rejection', String(e.reason?.stack ?? e.reason)).catch(() => undefined); });
}
