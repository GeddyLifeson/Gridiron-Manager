// PV-15: asset licence register checker. Bible: O6.8 (asset sources), A6.2.2 (marks); plan section 5 of
// plans/presentation-build-plan.md. The release gate (G-100) imports `checkLicences(root)`, or runs
// `node scripts/assets/check-licences.mjs [--json]` (exit 0 = clean, 1 = findings, 2 = register unreadable).
//
// Register: assets/LICENSES.json = { "version": 1, "assets": [ row, ... ] }, one row per non-code asset file.
// Row fields: path, sha256, source, licence, licenceId, author, dateRetrieved, licenceSources[] (all required);
//   tool (optional); licenceStatus (optional, but if present it must equal the computed status);
//   AI assets add aiGenerated:true, model, termsUrl, prompt.
// Checks: every file under an asset folder has a row; every row's file exists and its sha256 matches; no duplicate
// rows; licence id on the allowed list; fields filled; licence text does not claim a banned term; AI rows complete;
// non-original rows cite 3 independent licence sources (masterclaude triple-verify rule).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTER = 'assets/LICENSES.json';
/** Folders whose files must all be registered (relative to the repo root). */
export const ASSET_DIRS = ['assets', 'shells/browser/public'];
/** Allowed licence ids (plan section 5 item 3): CC0 and public domain, SIL OFL fonts, MIT/BSD/Apache, and the project's own work. */
export const ALLOWED_LICENCES = ['CC0-1.0', 'Public-Domain', 'OFL-1.1', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'Original'];
/** Inside `assets/`, these are not shipped assets: the register, notices and readmes, and source scores. */
const SKIP_NAME = /(^|\/)(LICENSES\.json|NOTICE\.md|README\.md)$/i;
const SKIP_DIR = /(^|\/)scores(\/|$)/;
/** Text that a licence field must never carry (plan section 5 item 3). */
const BANNED_TEXT = /non-?commercial|\bCC[- ]BY-NC|no-?derivatives?|\bCC[- ]BY-ND|royalty[- ]free|unknown|unlicensed|all rights reserved|personal use only/i;
const SHA = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https:\/\/\S+$/;

export function computedStatus(row) {
  if (row.licenceId === 'Original') return 'Original';
  const n = new Set((row.licenceSources ?? []).filter((s) => typeof s === 'string' && s.trim())).size;
  return n >= 3 ? 'Verified' : n === 2 ? '2 of 3' : n === 1 ? '1 of 3' : 'Unsourced';
}

function walk(root, dir, out) {
  if (!existsSync(join(root, dir))) return;
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(root, rel, out); }
    else out.push(rel);
  }
}

/** Files that must be registered. Under assets/ everything but the skip list; elsewhere only media, font and image files. */
export function assetFiles(root) {
  const all = [];
  for (const d of ASSET_DIRS) walk(root, d, all);
  return all.filter((f) => {
    if (SKIP_NAME.test(f) || SKIP_DIR.test(f)) return false;
    if (f.startsWith('assets/')) return true;
    return /\.(png|jpe?g|gif|webp|avif|svg|ico|ogg|oga|mp3|wav|flac|m4a|mp4|webm|woff2?|ttf|otf)$/i.test(f);
  }).sort();
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const filled = (v) => typeof v === 'string' && v.trim().length > 0;

/** @returns {{ok:boolean, errors:string[], rows:number, files:number, register:string}} */
export function checkLicences(root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')) {
  const errors = [];
  const regPath = join(root, REGISTER);
  if (!existsSync(regPath)) return { ok: false, errors: [`${REGISTER} is missing`], rows: 0, files: 0, register: REGISTER };
  let reg;
  try { reg = JSON.parse(readFileSync(regPath, 'utf8')); } catch (e) { return { ok: false, errors: [`${REGISTER} is not valid JSON: ${e.message}`], rows: 0, files: 0, register: REGISTER }; }
  if (reg?.version !== 1 || !Array.isArray(reg.assets)) return { ok: false, errors: [`${REGISTER} must be { "version": 1, "assets": [...] }`], rows: 0, files: 0, register: REGISTER };

  const files = assetFiles(root);
  const seen = new Map();
  reg.assets.forEach((row, i) => {
    const at = `row ${i + 1}${row && typeof row.path === 'string' ? ` (${row.path})` : ''}`;
    const bad = (m) => errors.push(`${at}: ${m}`);
    if (!row || typeof row !== 'object') return bad('not an object');
    if (!filled(row.path)) return bad('path missing');
    if (row.path.includes('\\') || row.path.startsWith('/') || row.path.split('/').includes('..')) bad('path must be repo-relative with forward slashes');
    if (seen.has(row.path)) bad(`duplicate of row ${seen.get(row.path)}`); else seen.set(row.path, i + 1);
    const abs = resolve(root, row.path);
    if (relative(root, abs).startsWith('..')) return bad('path leaves the repo');
    if (!existsSync(abs) || !statSync(abs).isFile()) bad('file does not exist');
    else if (!SHA.test(row.sha256 ?? '')) bad('sha256 must be 64 lowercase hex characters');
    else if (sha256(abs) !== row.sha256) bad('sha256 does not match the file (file changed since it was registered)');
    for (const f of ['source', 'licence', 'licenceId', 'author']) if (!filled(row[f])) bad(`${f} missing`);
    if (!DATE.test(row.dateRetrieved ?? '')) bad('dateRetrieved must be YYYY-MM-DD');
    if (!Array.isArray(row.licenceSources)) bad('licenceSources must be an array');
    if (filled(row.licenceId) && !ALLOWED_LICENCES.includes(row.licenceId)) bad(`licence id "${row.licenceId}" is not allowed (allowed: ${ALLOWED_LICENCES.join(', ')})`);
    for (const f of ['licence', 'source', 'licenceId']) if (typeof row[f] === 'string' && BANNED_TEXT.test(row[f])) bad(`${f} contains a banned licence term`);
    const status = computedStatus(row);
    if (row.licenceId !== 'Original' && Array.isArray(row.licenceSources) && status !== 'Verified') bad(`licence is ${status}: cite 3 independent licence sources (triple verify)`);
    if (row.licenceStatus !== undefined && row.licenceStatus !== status) bad(`licenceStatus "${row.licenceStatus}" does not match the computed status "${status}" (status is computed, never typed)`);
    if (row.aiGenerated === true) {
      if (!filled(row.model)) bad('AI asset: model missing');
      if (!URL_RE.test(row.termsUrl ?? '')) bad('AI asset: termsUrl must be an https link to the service terms');
      if (!filled(row.prompt)) bad('AI asset: prompt missing');
    } else if (row.aiGenerated !== undefined && row.aiGenerated !== false) bad('aiGenerated must be true or false');
  });
  for (const f of files) if (!seen.has(f)) errors.push(`${f}: file has no row in ${REGISTER}`);
  return { ok: errors.length === 0, errors, rows: reg.assets.length, files: files.length, register: REGISTER };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.GM_ASSET_ROOT ? resolve(process.env.GM_ASSET_ROOT) : undefined;
  const r = checkLicences(root);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`asset licence register: ${r.ok ? 'PASS' : 'FAIL'} (${r.rows} rows, ${r.files} asset files)`);
    for (const e of r.errors) console.log(`  ${e}`);
  }
  process.exit(r.ok ? 0 : r.errors.some((e) => /missing$|not valid JSON|must be \{/.test(e) && r.rows === 0 && r.files === 0) ? 2 : 1);
}
