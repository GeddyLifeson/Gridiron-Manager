// The shipped tree: files that go into a release build. Core and app packages (P1.2.1 kinds; tool packages such as
// headless and tools do not ship), content/, and the two shells. Tests, build scripts, authoring scripts and docs do
// not ship. When a browser build exists (shells/browser/dist) it is scanned as well, since it is the real artifact.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { trackedFiles } from './git.ts';

export const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|html|css|txt|svg|toml|rs|csv|tsv|yaml|yml)$/i;
const NEVER_SHIPS = [/(^|\/)test\//, /(^|\/)build\//, /(^|\/)authoring\//, /(^|\/)__pycache__\//, /\.py$/, /\.md$/i, /(^|\/)node_modules\//, /\.test\.tsx?$/];

/** Reference files the scans themselves read. They hold real marks or hashes on purpose and are checked by their own
 *  packages' tests (G-11, G-18); they are excluded from the text scans and listed in the report. */
export const SCAN_REFERENCE_FILES = new Set([
  'packages/football-content/data/world/blocked-terms.json',
  'packages/football-content/data/names/real-name-guard.json',
]);

export function packageKinds(root: string): Record<string, string> {
  const p = join(root, 'packages/tools/package-map.json');
  if (!existsSync(p)) return {};
  const m = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  const pk = (m['packages'] ?? m) as Record<string, { kind?: string }>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(pk)) if (v && typeof v === 'object' && v.kind) out[k] = v.kind;
  return out;
}

export function isShipped(rel: string, kinds: Record<string, string>): boolean {
  const f = rel.replace(/\\/g, '/');
  if (NEVER_SHIPS.some((r) => r.test(f))) return false;
  const pm = /^packages\/([^/]+)\/(src|data)\//.exec(f);
  if (pm) return kinds[pm[1]!] === 'core' || kinds[pm[1]!] === 'app';
  if (f.startsWith('content/')) return true;
  if (/^shells\/browser\/(src|public)\//.test(f) || f === 'shells/browser/index.html') return true;
  if (/^shells\/desktop\/(bridge|src-tauri\/src)\//.test(f)) return true;
  return false;
}

function walk(dir: string, base: string, out: string[]): void {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'));
  }
}

export interface ShippedTree { files: string[]; buildArtifact: string | null }

export function shippedTree(root: string): ShippedTree {
  const kinds = packageKinds(root);
  const files = trackedFiles(root).filter((f) => isShipped(f, kinds));
  const dist = join(root, 'shells/browser/dist');
  let buildArtifact: string | null = null;
  if (existsSync(dist)) { buildArtifact = 'shells/browser/dist'; walk(dist, root, files); }
  return { files: [...new Set(files)].sort(), buildArtifact };
}
