// Writes THIRD_PARTY_NOTICES.md: every open-source package that ships inside the game, its licence,
// and the full licence texts the packages carry.
//
//   npx tsx scripts/legal/third-party-notices.ts            # write THIRD_PARTY_NOTICES.md
//   npx tsx scripts/legal/third-party-notices.ts --check    # exit 1 if the file is out of date
//
// Shipped = the runtime (non-dev) packages in package-lock.json, the build tool whose runtime helpers
// end up in the browser bundle (vite), and the Rust crates the desktop shell links (normal and build
// dependencies of shells/desktop/src-tauri, from `cargo metadata --locked`). Needs `npm ci` first, and
// cargo with the crates downloaded for the Rust part; without cargo the Rust section is left out and
// the run says so.
//
// Each package's licence is checked three ways (masterclaude rule 10): the licence the lockfile or
// cargo metadata records, the licence field in the package's own manifest on disk, and the licence
// file(s) the package ships. The status column is computed from those, never typed.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'THIRD_PARTY_NOTICES.md');
const TAURI = join(ROOT, 'shells/desktop/src-tauri');
/** Build tools whose small runtime helpers are injected into the shipped browser bundle. */
const BUNDLED_BUILD_TOOLS = ['vite'];
const LICENCE_FILE = /^(licen[cs]e|copying|notice|unlicense)([-._].*)?$/i;

interface Pkg {
  ecosystem: 'npm' | 'cargo';
  name: string;
  version: string;
  recorded: string; // licence as the lockfile / cargo metadata records it
  manifest: string; // licence field in the package's own manifest on disk
  files: { name: string; text: string }[];
  repository: string;
}

function licenceFiles(dir: string): { name: string; text: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => LICENCE_FILE.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim() }));
}

function npmPackages(): Pkg[] {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, { version?: string; license?: string; dev?: boolean; devOptional?: boolean; link?: boolean }>;
  };
  const out: Pkg[] = [];
  for (const [path, p] of Object.entries(lock.packages)) {
    if (!path.includes('node_modules/') || p.link) continue;
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (name.startsWith('@gm/')) continue; // our own workspaces
    const shipped = !(p.dev || p.devOptional) || (BUNDLED_BUILD_TOOLS.includes(name) && path === `node_modules/${name}`);
    if (!shipped) continue;
    const dir = join(ROOT, path);
    const pj = existsSync(join(dir, 'package.json')) ? (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>) : {};
    const repo = pj.repository;
    out.push({
      ecosystem: 'npm',
      name,
      version: p.version ?? '?',
      recorded: p.license ?? '',
      manifest: typeof pj.license === 'string' ? pj.license : '',
      files: licenceFiles(dir),
      repository: typeof repo === 'string' ? repo : typeof repo === 'object' && repo && 'url' in repo ? String((repo as { url: unknown }).url) : '',
    });
  }
  return out;
}

interface CargoMeta {
  packages: { id: string; name: string; version: string; license: string | null; license_file: string | null; manifest_path: string; source: string | null; repository: string | null }[];
  resolve: { root: string; nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[] };
}

function cargoPackages(): { pkgs: Pkg[]; note: string } {
  let meta: CargoMeta;
  try {
    meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--locked'], { cwd: TAURI, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString()) as CargoMeta;
  } catch {
    return { pkgs: [], note: 'cargo metadata could not run here, so the Rust crates of the desktop shell are not listed. Run this script where cargo is installed.' };
  }
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = [meta.resolve.root];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of nodes.get(id)?.deps ?? []) if (d.dep_kinds.some((k) => k.kind === null || k.kind === 'build')) stack.push(d.pkg);
  }
  const pkgs: Pkg[] = [];
  for (const p of meta.packages) {
    if (!seen.has(p.id) || !p.source) continue; // skip our own crate
    const dir = dirname(p.manifest_path);
    const toml = readFileSync(p.manifest_path, 'utf8');
    const m = /^license\s*=\s*"([^"]*)"/m.exec(toml);
    const files = licenceFiles(dir);
    if (p.license_file && !files.some((f) => f.name === p.license_file)) {
      const lf = join(dir, p.license_file);
      if (existsSync(lf)) files.push({ name: p.license_file, text: readFileSync(lf, 'utf8').replace(/\r\n/g, '\n').trim() });
    }
    pkgs.push({ ecosystem: 'cargo', name: p.name, version: p.version, recorded: p.license ?? (p.license_file ? `see ${p.license_file}` : ''), manifest: m?.[1] ?? '', files, repository: p.repository ?? '' });
  }
  return { pkgs, note: '' };
}

/** Normalise old-style "MIT/Apache-2.0" to SPDX "MIT OR Apache-2.0" for comparison only. */
const norm = (s: string) => s.replace(/\s*\/\s*/g, ' OR ').replace(/[()]/g, '').trim().toUpperCase();

function status(p: Pkg): string {
  const agree = p.recorded !== '' && norm(p.recorded) === norm(p.manifest || p.recorded);
  const n = (p.recorded ? 1 : 0) + (p.manifest && agree ? 1 : 0) + (p.files.length ? 1 : 0);
  if (p.recorded && p.manifest && !agree) return 'Conflict';
  return n === 3 ? 'Verified' : `${n} of 3`;
}

function main(): void {
  const npm = npmPackages().sort((a, b) => a.name.localeCompare(b.name));
  const cargo = cargoPackages();
  const all = [...npm, ...cargo.pkgs.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))];

  // Licence texts, each distinct text once, with the packages that carry it.
  const texts = new Map<string, { text: string; users: string[] }>();
  for (const p of all) {
    for (const f of p.files) {
      const h = createHash('sha256').update(f.text).digest('hex').slice(0, 12);
      const e = texts.get(h) ?? { text: f.text, users: [] };
      e.users.push(`${p.name} ${p.version} (${f.name})`);
      texts.set(h, e);
    }
  }

  const counts: Record<string, number> = {};
  for (const p of all) counts[status(p)] = (counts[status(p)] ?? 0) + 1;
  const licCount: Record<string, number> = {};
  for (const p of all) licCount[p.recorded || '(none recorded)'] = (licCount[p.recorded || '(none recorded)'] ?? 0) + 1;

  const row = (p: Pkg) => `| ${p.name} | ${p.version} | ${p.recorded || '(none)'} | ${status(p)} | ${p.repository.replace(/^git\+/, '').replace(/\|/g, '\\|')} |`;
  const lines: string[] = [
    '# Third-party notices',
    '',
    'Gridiron Manager is proprietary software (see `LICENSE`). It includes the open-source packages below, each used under its own licence. Their licence texts follow the tables, as those licences require.',
    '',
    'Generated by `npx tsx scripts/legal/third-party-notices.ts` from `package-lock.json`, `shells/desktop/src-tauri/Cargo.lock` and the packages on disk. Do not edit by hand.',
    '',
    'Status column: each licence is read three ways (the lockfile or cargo metadata, the package\'s own manifest, and the licence file the package ships). Verified = all three agree; fewer = only that many sources were found; Conflict = two sources disagree.',
    '',
    `Totals: ${all.length} packages (${npm.length} npm, ${cargo.pkgs.length} Rust). Status: ${Object.entries(counts).sort().map(([k, n]) => `${k} ${n}`).join(', ')}.`,
    '',
    'Licences: ' + Object.entries(licCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join('; ') + '.',
    '',
    'Also shipped, with notices kept beside the files: the MuseScore General soundfont acknowledgements for the menu music (`assets/music/NOTICE.md`, MIT). SQLite, compiled into sql.js and into the desktop shell through rusqlite, is in the public domain.',
    '',
  ];
  if (cargo.note) lines.push(`> ${cargo.note}`, '');
  lines.push('## JavaScript packages (browser and desktop web view)', '', '| Package | Version | Licence | Status | Source |', '| --- | --- | --- | --- | --- |', ...npm.map(row), '');
  if (cargo.pkgs.length) lines.push('## Rust crates (desktop shell)', '', '| Crate | Version | Licence | Status | Source |', '| --- | --- | --- | --- | --- |', ...cargo.pkgs.map(row), '');
  lines.push('## Licence texts', '', 'Each distinct licence text appears once, followed by the packages that ship it.', '');
  for (const [h, e] of [...texts.entries()].sort((a, b) => b[1].users.length - a[1].users.length || a[0].localeCompare(b[0]))) {
    lines.push(`### Text ${h}`, '', `Used by: ${e.users.join(', ')}.`, '', '```text', e.text.replace(/```/g, "'''"), '```', '');
  }
  const body = lines.join('\n');

  if (process.argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== body) {
      console.error('THIRD_PARTY_NOTICES.md is out of date: run npx tsx scripts/legal/third-party-notices.ts');
      process.exit(1);
    }
    console.log('THIRD_PARTY_NOTICES.md is up to date');
    return;
  }
  writeFileSync(OUT, body);
  console.log(`wrote ${OUT}: ${all.length} packages, ${texts.size} distinct licence texts; status ${JSON.stringify(counts)}`);
  const missing = all.filter((p) => !p.files.length).map((p) => `${p.name} ${p.version}`);
  if (missing.length) console.log(`no licence file shipped by: ${missing.join(', ')}`);
}

main();
