// G-100 release gate (R1.2.10, Q1.8.1, A6.2.2, A6.4.1, Q6.3.1).
//   npx tsx scripts/release/gate.ts [--out DIR] [--report-only] [--refresh-bible]
// Builds every release check (the R1.2.10 items, the Q1.8.1 release suites per platform, the earlier phase gates,
// every work package's acceptance in both build plans, every v1 bible leaf's acceptance criteria), runs the automated
// ones (mark, name and research-data scans of the shipped tree; the provisional fact list), reads suite results and
// recorded evidence for the rest, and writes CHECKLIST.md, BIBLE-CHECKLIST.md, PROVISIONAL.md and results.json.
// Nothing is marked PASS unless it was verified at this commit. Exit code 0 = release PASS, 1 = HOLD
// (--report-only always exits 0 after writing the report). No GitHub Actions: run it on the test machines.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { headCommit, sourceDirty, trackedFiles } from './lib/git.ts';
import { findBibleDir, readBible, readPhaseGates, type BibleLeaf, type GateItem } from './lib/bible.ts';
import { loadPlans } from './lib/plans.ts';
import { loadPolicy, permitReason } from './lib/policy.ts';
import { shippedTree, SCAN_REFERENCE_FILES, TEXT_EXT } from './lib/shipped.ts';
import { buildMatcher, scanMarks, type BlockedTerms, type MarkHit } from './lib/marks.ts';
import { loadRealNames, scanNames, researchPathHits, recordTokenHits, researchCopyHits, type NameHit, type ResearchHit } from './lib/people.ts';
import { factFiles, provisionalReport, provisionalMarkdown } from './lib/provisional.ts';
import { collectSuiteRecords } from './lib/suites.ts';
import { loadEvidence, EVIDENCE_FILE } from './lib/evidence.ts';
import { runChecks, verdict, type ScanResults } from './lib/checks.ts';
import { checklistMarkdown, bibleMarkdown, counts } from './lib/report.ts';
import type { GateContext } from './lib/types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = resolve(ROOT, opt('--out') ?? 'scripts/release/report');
const SNAPSHOT = join(ROOT, 'scripts/release/data/bible-criteria.json');
const BLOCKED = 'packages/football-content/data/world/blocked-terms.json';
const ALLOWED = join(ROOT, 'scripts/release/data/allowed.json');
const POLICY = join(ROOT, 'scripts/release/data/policy.json');
interface AllowEntry { file: string; term: string; reason: string; reviewedBy: string }
interface Allowed { marks: AllowEntry[]; names: AllowEntry[] }

interface Snapshot { contentHash: string; leafCount: number; leaves: BibleLeaf[]; gates: GateItem[] }

function bibleInputs(notes: string[]): { leaves: BibleLeaf[]; gates: GateItem[]; source: string } {
  const dir = findBibleDir();
  const snap = existsSync(SNAPSHOT) ? (JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot) : null;
  if (dir) {
    const live = readBible(dir);
    const gates = readPhaseGates(dir);
    if (args.includes('--refresh-bible') || !snap) {
      writeFileSync(SNAPSHOT, JSON.stringify({ contentHash: live.contentHash, leafCount: live.leafCount, leaves: live.leaves, gates }, null, 0) + '\n');
      notes.push(`bible snapshot written (${live.leafCount} leaves, hash ${live.contentHash})`);
    } else if (snap.contentHash !== live.contentHash) {
      notes.push(`the bible changed since the snapshot (${snap.contentHash} -> ${live.contentHash}); the live bible was used. Refresh: gate.ts --refresh-bible`);
    }
    return { leaves: live.leaves, gates, source: `live from ${dir}, hash ${live.contentHash}, ${live.leafCount} leaves` };
  }
  if (snap) { notes.push('bible folder not found on this machine (set GM_BIBLE_DIR); the committed snapshot was used'); return { leaves: snap.leaves, gates: snap.gates, source: `snapshot ${snap.contentHash}, ${snap.leafCount} leaves` }; }
  notes.push('no bible and no snapshot: bible checks are empty');
  return { leaves: [], gates: [], source: 'none' };
}

async function licenceCheck(root: string): Promise<ScanResults['licences']> {
  const f = join(root, 'scripts/assets/check-licences.mjs');
  if (!existsSync(f)) return null;
  const mod = (await import(pathToFileURL(f).href)) as { checkLicences: (root: string) => { ok: boolean; errors: string[]; rows: number; files: number } };
  return mod.checkLicences(root);
}

function scan(ctx: GateContext, notes: string[]): ScanResults {
  const tree = shippedTree(ctx.root);
  const textFiles = tree.files.filter((f) => TEXT_EXT.test(f) && !SCAN_REFERENCE_FILES.has(f));
  notes.push(`scan reference files excluded from the text scans (they hold marks or hashes on purpose, checked by G-11 and G-18 tests): ${[...SCAN_REFERENCE_FILES].join(', ')}`);
  notes.push('mark scan reading of "case-blind": all-capital abbreviations of 2 to 4 letters match case-sensitively so ordinary words (sec, acc) stay usable; everything else is case-blind, with one-edit near spellings for words of 7+ letters that keep their first letter (shorter or first-letter edits matched real towns and surnames such as Solon, Penn Hills and Weisman)');
  const blockedPath = join(ctx.root, BLOCKED);
  const blocked = existsSync(blockedPath) ? (JSON.parse(readFileSync(blockedPath, 'utf8')) as BlockedTerms) : null;
  const matcher = blocked ? buildMatcher(blocked) : null;
  const names = loadRealNames(ctx.root);
  const markHits: MarkHit[] = [], nameHits: NameHit[] = [], tokenHits: ResearchHit[] = [];
  for (const f of textFiles) {
    const text = readFileSync(join(ctx.root, f), 'utf8');
    if (matcher) markHits.push(...scanMarks(f, text, matcher));
    nameHits.push(...scanNames(f, text, names.hashes));
    tokenHits.push(...recordTokenHits(f, text));
  }
  const allowed = existsSync(ALLOWED) ? (JSON.parse(readFileSync(ALLOWED, 'utf8')) as Allowed) : { marks: [], names: [] };
  const isAllowed = (list: AllowEntry[], file: string, term: string) => list.some((a) => a.file === file && a.term.toLowerCase() === term.toLowerCase() && a.reason.trim() && a.reviewedBy.trim());
  const allowedMarks = markHits.filter((h) => isAllowed(allowed.marks, h.file, h.term));
  const allowedNames = nameHits.filter((h) => isAllowed(allowed.names, h.file, h.name));
  if (allowedMarks.length || allowedNames.length) notes.push(`reviewed and allowed (data/allowed.json): ${allowedMarks.length} mark hits, ${allowedNames.length} name hits`);
  // Scan policy (data/policy.json): hits on surfaces a player never sees are permitted and counted by reason.
  const policy = loadPolicy(POLICY);
  const lineCache = new Map<string, string[]>();
  const lineOf = (f: string, n: number) => { if (!n) return undefined; if (!lineCache.has(f)) lineCache.set(f, readFileSync(join(ctx.root, f), 'utf8').split(/\r?\n/)); return lineCache.get(f)![n - 1]; };
  const permitted = { marks: {} as Record<string, number>, names: {} as Record<string, number> };
  const failMarks = markHits.filter((h) => !allowedMarks.includes(h)).filter((h) => { const r = permitReason(policy, h.file, lineOf(h.file, h.line), h.term, 'mark'); if (r) permitted.marks[r] = (permitted.marks[r] ?? 0) + 1; return !r; });
  const failNames = nameHits.filter((h) => !allowedNames.includes(h)).filter((h) => { const r = permitReason(policy, h.file, lineOf(h.file, h.line), h.name, 'name'); if (r) permitted.names[r] = (permitted.names[r] ?? 0) + 1; return !r; });
  const fmtP = (o: Record<string, number>) => Object.entries(o).map(([k, n]) => `${n} ${k}`).join(', ') || 'none';
  notes.push(`scan policy (data/policy.json): permitted mark hits ${fmtP(permitted.marks)}; permitted name hits ${fmtP(permitted.names)}`);
  const copies = researchCopyHits(ctx.root, tree.files);
  const provisional = provisionalReport(ctx.root, factFiles(trackedFiles(ctx.root)));
  return {
    shippedFiles: tree.files.length,
    buildArtifact: tree.buildArtifact,
    marks: blocked ? { listPath: BLOCKED, listStatus: blocked.status ?? 'unknown', hits: failMarks, permitted: permitted.marks } : null,
    names: { source: names, hits: failNames, permitted: permitted.names },
    research: { pathHits: researchPathHits(tree.files), tokenHits, copyHits: copies.hits, researchFiles: copies.researchFiles, dirs: copies.dirs },
    provisional,
    licences: null,
  };
}

async function main(): Promise<number> {
  const ctx: GateContext = { root: ROOT, commit: headCommit(ROOT), dirty: sourceDirty(ROOT) };
  const notes: string[] = [];
  const bible = bibleInputs(notes);
  const scans = scan(ctx, notes);
  scans.licences = await licenceCheck(ctx.root);
  const all = runChecks({ ctx, leaves: bible.leaves, gates: bible.gates, wps: loadPlans(ROOT), evidence: loadEvidence(join(ROOT, EVIDENCE_FILE)), suites: collectSuiteRecords(ROOT), scans });
  const v = verdict(all, ctx);
  mkdirSync(OUT, { recursive: true });
  const meta = { ctx, pass: v.pass, reasons: v.reasons, bibleSource: bible.source, notes, generatedAt: new Date().toISOString() };
  writeFileSync(join(OUT, 'CHECKLIST.md'), checklistMarkdown(all, meta));
  writeFileSync(join(OUT, 'BIBLE-CHECKLIST.md'), bibleMarkdown(all, meta));
  writeFileSync(join(OUT, 'PROVISIONAL.md'), provisionalMarkdown(scans.provisional, ctx.commit));
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ commit: ctx.commit, dirty: ctx.dirty, pass: v.pass, reasons: v.reasons, generatedAt: meta.generatedAt, bible: bible.source, notes, counts: counts(all),
    scans: { shippedFiles: scans.shippedFiles, buildArtifact: scans.buildArtifact, markHits: scans.marks?.hits ?? null, nameSource: { kind: scans.names.source.kind, path: scans.names.source.path, people: scans.names.source.people }, nameHits: scans.names.hits, licences: scans.licences, research: scans.research },
    checks: all }, null, 1) + '\n');
  const c = counts(all);
  console.log(`release gate: ${v.pass ? 'PASS' : 'HOLD'} at ${ctx.commit.slice(0, 12)}${ctx.dirty ? ' (dirty)' : ''}`);
  console.log(`checks: ${all.length} (${Object.entries(c).map(([s, n]) => `${n} ${s}`).join(', ')})`);
  for (const r of all.filter((x) => x.group === 'release-gate')) console.log(`  ${r.status.padEnd(14)} ${r.title}: ${r.detail}`);
  console.log(`PROVISIONAL facts: ${scans.provisional.provisional.length} of ${scans.provisional.total} (list hash ${scans.provisional.listHash})`);
  console.log(`report: ${OUT}/CHECKLIST.md`);
  return args.includes('--report-only') ? 0 : v.pass ? 0 : 1;
}

main().then((c) => process.exit(c));
