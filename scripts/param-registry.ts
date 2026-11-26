// The project-wide parameter registry (integrator-owned, P3 PARAMS table). Every module keeps its own
// parameter file; this finds every exported ParamFile under packages/*/src, loads it, and checks that no
// parameter name is defined twice across the whole project. The engine's merged game table is
// realGame.engineParamTable / tickParamTable (headless); this covers every other system as well.
//   npx tsx scripts/param-registry.ts [--out report.md]
// Exit 0 only when no name is defined twice.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface ParamFileLike { readonly module: string; readonly version: string; readonly params: readonly { readonly name: string; readonly value: number }[] }
export interface Registry {
  readonly files: { readonly module: string; readonly version: string; readonly rows: number; readonly source: string }[];
  readonly rows: number;
  readonly duplicates: { readonly name: string; readonly modules: string[] }[];
  readonly loadErrors: { readonly source: string; readonly error: string }[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT_RE = /export const ([A-Za-z_]*PARAMS)\b/;

function walk(dir: string, out: string[]): void {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); }
    else if (/\.ts$/.test(f) && !/\.d\.ts$/.test(f) && EXPORT_RE.test(readFileSync(p, 'utf8'))) out.push(p);
  }
}

const isParamFile = (v: unknown): v is ParamFileLike =>
  !!v && typeof v === 'object' && typeof (v as ParamFileLike).module === 'string' && Array.isArray((v as ParamFileLike).params);

export async function buildRegistry(root = ROOT): Promise<Registry> {
  const sources: string[] = [];
  for (const pkg of readdirSync(join(root, 'packages'))) {
    const src = join(root, 'packages', pkg, 'src');
    try { if (statSync(src).isDirectory()) walk(src, sources); } catch { /* no src */ }
  }
  sources.sort();
  const seen = new Set<ParamFileLike>();
  const files: Registry['files'][number][] = [];
  const loadErrors: Registry['loadErrors'][number][] = [];
  const owners = new Map<string, string[]>();
  for (const s of sources) {
    let mod: Record<string, unknown>;
    try { mod = await import(pathToFileURL(s).href); } catch (e) { loadErrors.push({ source: relative(root, s), error: String(e).split('\n')[0]! }); continue; }
    for (const v of Object.values(mod)) {
      const list = Array.isArray(v) ? v : [v];
      for (const f of list) {
        if (!isParamFile(f) || seen.has(f)) continue;
        seen.add(f);
        files.push({ module: f.module, version: f.version, rows: f.params.length, source: relative(root, s) });
        for (const p of f.params) owners.set(p.name, [...(owners.get(p.name) ?? []), f.module]);
      }
    }
  }
  const duplicates = [...owners].filter(([, m]) => m.length > 1).map(([name, modules]) => ({ name, modules })).sort((a, b) => (a.name < b.name ? -1 : 1));
  return { files: files.sort((a, b) => (a.module < b.module ? -1 : 1)), rows: [...owners.values()].reduce((n, m) => n + m.length, 0), duplicates, loadErrors };
}

export function formatRegistry(r: Registry): string {
  const lines = [`# Parameter registry`, ``, `${r.files.length} parameter files, ${r.rows} rows, ${r.duplicates.length} names defined twice, ${r.loadErrors.length} files that failed to load.`, ``];
  if (r.duplicates.length) { lines.push(`## Defined twice`, ``); for (const d of r.duplicates) lines.push(`- ${d.name}: ${d.modules.join(', ')}`); lines.push(``); }
  if (r.loadErrors.length) { lines.push(`## Failed to load`, ``); for (const e of r.loadErrors) lines.push(`- ${e.source}: ${e.error}`); lines.push(``); }
  lines.push(`## Files`, ``, `module | version | rows | source`, `---|---|---|---`);
  for (const f of r.files) lines.push(`${f.module} | ${f.version} | ${f.rows} | ${f.source}`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await buildRegistry();
  const i = process.argv.indexOf('--out');
  if (i >= 0) writeFileSync(resolve(process.argv[i + 1]!), formatRegistry(r));
  console.log(`${r.files.length} parameter files, ${r.rows} rows, ${r.duplicates.length} duplicates, ${r.loadErrors.length} load errors`);
  for (const d of r.duplicates) console.log(`  twice: ${d.name} (${d.modules.join(', ')})`);
  for (const e of r.loadErrors) console.log(`  load error: ${e.source}: ${e.error}`);
  process.exit(r.duplicates.length || r.loadErrors.length ? 1 : 0);
}
