// The one platform interface (P2.3.1). Two implementations: desktop (native SQLite through the
// shell) and browser (SQLite WebAssembly on private browser storage). The game logic never knows
// which one it runs on.
import type { SqlDriver } from '@gm/store';

export interface SaveListing { readonly name: string; readonly sizeBytes: number }

/** Which window a client is (P2.3.3). The second window shows one view beside the main one. */
export type SecondWindowView = 'film' | 'callSheet' | 'booth' | 'reference';
export interface WindowRole { readonly role: 'main' | 'second'; readonly view?: SecondWindowView }

/**
 * Extras only the desktop shell has (G-05, P2.3.1). Screens read them from `Platform.desktop` and
 * must work when it is absent (browser, headless). Dialog calls resolve to null when the user cancels.
 */
export interface DesktopExtras {
  /** "Save a copy" (P5.8.1): a file copy under a new, free name. */
  copySave(from: string, to: string): Promise<void>;
  /** Native save dialog; resolves to the written path. */
  exportSaveWithDialog(name: string): Promise<string | null>;
  /** Native open dialog; resolves to the new save's name. */
  importSaveWithDialog(): Promise<string | null>;
  /** Simulation pool size for this machine (P2.1.3). */
  poolSize(): Promise<number>;
  openSecondWindow(view: SecondWindowView): Promise<void>;
  windowRole(): WindowRole;
}

export interface Platform {
  readonly kind: 'desktop' | 'browser' | 'headless';
  /** Opens (or creates when absent) the named save database. */
  openSave(name: string, create: boolean): Promise<SqlDriver>;
  /** Persists the database after a committed transaction where the driver keeps it in memory. */
  flushSave(name: string, driver: SqlDriver): Promise<void>;
  listSaves(): Promise<SaveListing[]>;
  deleteSave(name: string): Promise<void>;
  /** Bytes of a save for export (O5, P5.7) and bytes to import. */
  exportSave(name: string): Promise<Uint8Array>;
  importSave(name: string, bytes: Uint8Array): Promise<void>;
  /** Version string of the application build. */
  appVersion(): string;
  /** Present on the desktop shell only. */
  readonly desktop?: DesktopExtras;
}
