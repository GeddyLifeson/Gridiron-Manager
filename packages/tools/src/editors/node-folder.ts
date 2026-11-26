// Desktop and headless side of the user content folder (P7.1.1): find packs (subfolders and .zip
// files) under the folder, and write an editor's pack into it. The browser build uses the import
// button instead (importPackZip).
import { existsSync, mkdirSync, readdirSync, lstatSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, sep, dirname } from 'node:path';
import { readPackFolder, readPackZip, DEFAULT_LIMITS, type Limits, type PackSource } from '../content/index.ts';

/** The folder name inside the game folder (P7.1.1 "user content"). */
export const USER_CONTENT_FOLDER = 'user content';

/** Every pack found, in name order. Symbolic links at the top level are skipped like inside packs. */
export function scanUserContentFolder(root: string, limits: Limits = DEFAULT_LIMITS): PackSource[] {
  if (!existsSync(root)) return [];
  const out: PackSource[] = [];
  for (const name of readdirSync(root).sort()) {
    if (name.startsWith('.')) continue;
    const full = join(root, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push(readPackFolder(full, limits));
    else if (st.isFile() && name.toLowerCase().endsWith('.zip')) out.push(readPackZip(full, limits));
  }
  return out;
}

/** Writes a built pack as `<root>/<packId>/...`, replacing an earlier save of the same pack. */
export function writePackToFolder(root: string, packId: string, files: Readonly<Record<string, string>>): string {
  const base = resolve(root, packId);
  if (!base.startsWith(resolve(root) + sep)) throw new Error('pack folder leaves the user content folder');
  if (existsSync(base)) rmSync(base, { recursive: true, force: true });
  for (const [path, text] of Object.entries(files)) {
    const full = resolve(base, path);
    if (!full.startsWith(base + sep)) throw new Error(`path ${path} leaves the pack folder`);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return base;
}
