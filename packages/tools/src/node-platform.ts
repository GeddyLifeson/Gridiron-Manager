// Headless platform: saves are .gmsave files in a folder; SQLite runs as WebAssembly (sql.js) and the
// file is written after each committed transaction. Same file format as the desktop and browser.
import { readFile, writeFile, readdir, stat, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { SqlJsDriver, SAVE_FILE_EXTENSION, type SqlDriver } from '@gm/store';
import type { Platform, SaveListing } from '@gm/app-services';

let sqlPromise: Promise<SqlJsStatic> | undefined;
export function sqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs();
  return sqlPromise;
}

export class NodePlatform implements Platform {
  readonly kind = 'headless' as const;
  constructor(private readonly dir: string) {}

  private file(name: string): string { return join(this.dir, name.endsWith(SAVE_FILE_EXTENSION) ? name : name + SAVE_FILE_EXTENSION); }

  async openSave(name: string, create: boolean): Promise<SqlDriver> {
    await mkdir(this.dir, { recursive: true });
    const f = this.file(name);
    const SQL = await sqlJs();
    if (existsSync(f)) {
      if (create) throw new Error(`save ${name} already exists`);
      return SqlJsDriver.open(SQL, new Uint8Array(await readFile(f)));
    }
    if (!create) throw new Error(`no save named ${name}`);
    return SqlJsDriver.open(SQL);
  }

  async flushSave(name: string, driver: SqlDriver): Promise<void> {
    if (!driver.exportBytes) return;
    await writeFile(this.file(name), await driver.exportBytes());
  }

  async listSaves(): Promise<SaveListing[]> {
    if (!existsSync(this.dir)) return [];
    const out: SaveListing[] = [];
    for (const f of (await readdir(this.dir)).sort()) {
      if (f.endsWith(SAVE_FILE_EXTENSION)) out.push({ name: f.slice(0, -SAVE_FILE_EXTENSION.length), sizeBytes: (await stat(join(this.dir, f))).size });
    }
    return out;
  }

  async deleteSave(name: string): Promise<void> { await rm(this.file(name), { force: true }); }
  async exportSave(name: string): Promise<Uint8Array> { return new Uint8Array(await readFile(this.file(name))); }
  async importSave(name: string, bytes: Uint8Array): Promise<void> { await mkdir(this.dir, { recursive: true }); await writeFile(this.file(name), bytes); }
  appVersion(): string { return `headless (node ${process.versions.node})`; }
}
