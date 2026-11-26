// Q1.8.1 "Before a release": every suite, both rule sets, on every platform of P2.3 (Windows, Linux, browser; macOS
// is recorded as not tested, R1.2.1). Evidence comes from result files written by runs on the test machines:
//   test-results/summary.json            `npm run check` (commit, machine, steps named with their suite ids)
//   test-results/release/*.json          the release contract below, for suites `npm run check` does not run yet
//   test-results/windows-*.md            a transcribed Windows run (commit and step table)
// A record counts only at the commit under test, not skipped, and (for level-tagged suites) with both rule sets.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sameCommit } from './git.ts';

export type Platform = 'windows' | 'linux' | 'browser';
export const PLATFORMS: Platform[] = ['windows', 'linux', 'browser'];

export interface SuiteDef { id: string; title: string; needsBothRuleSets: boolean; owner?: string }

/** Every suite of Q1 plus the Q3 battery, the Q4 full search and the P6.5.1 benchmarks (Q1.8.1 "Everything"). Q1.6.3 is
 *  retired (2026-11-25) and Q1.8.1 is the schedule itself. */
export const RELEASE_SUITES: SuiteDef[] = [
  { id: 'Q1.1.1', title: 'Rule-case suite', needsBothRuleSets: true, owner: 'WP-02..WP-05' },
  { id: 'Q1.1.2', title: 'Enforcement property tests (full)', needsBothRuleSets: true, owner: 'WP-04' },
  { id: 'Q1.1.3', title: 'Legality generators', needsBothRuleSets: true, owner: 'WP-10' },
  { id: 'Q1.2.1', title: 'Schema and content tests', needsBothRuleSets: false },
  { id: 'Q1.2.2', title: 'State invariant checks', needsBothRuleSets: true },
  { id: 'Q1.2.3', title: 'Migration fixtures', needsBothRuleSets: false, owner: 'G-01' },
  { id: 'Q1.3.1', title: 'Golden-seed determinism (plays, games, season)', needsBothRuleSets: true },
  { id: 'Q1.3.2', title: 'Diff runner, reference against tick resolver', needsBothRuleSets: true, owner: 'WP-24' },
  { id: 'Q1.4.1', title: 'AI no-hidden-information test', needsBothRuleSets: true, owner: 'G-27' },
  { id: 'Q1.4.2', title: 'No truth field in read models', needsBothRuleSets: false, owner: 'G-27' },
  { id: 'Q1.5.1', title: 'Contrast and greyscale checks', needsBothRuleSets: false },
  { id: 'Q1.5.2', title: 'Keyboard-only full game', needsBothRuleSets: true },
  { id: 'Q1.5.3', title: 'Route crawl', needsBothRuleSets: false },
  { id: 'Q1.6.1', title: '30-season career run', needsBothRuleSets: true },
  { id: 'Q1.6.2', title: 'Imported-people protection run', needsBothRuleSets: true, owner: 'G-42' },
  { id: 'Q1.6.4', title: 'Long-run stability of the world', needsBothRuleSets: true },
  { id: 'Q1.7.1', title: 'Contest tests', needsBothRuleSets: true },
  { id: 'Q1.7.2', title: 'Play, game and season runs against J15', needsBothRuleSets: true },
  { id: 'Q1.7.3', title: 'Rating-response sweeps', needsBothRuleSets: true },
  { id: 'Q3.3.1', title: 'Decision-response battery report', needsBothRuleSets: true, owner: 'G-87' },
  { id: 'Q4.1.1', title: 'Exploit search, full (Q4.1 to Q4.4)', needsBothRuleSets: true, owner: 'G-86' },
  { id: 'P6.5.1', title: 'Benchmark suite', needsBothRuleSets: false },
];

export interface SuiteRecord { suite: string; platform: Platform | 'other'; commit: string; ok: boolean; skipped: boolean; ruleSets: string[]; source: string }

export function platformOf(s: string): Platform | 'other' {
  const t = s.toLowerCase();
  if (/browser|chromium|webkit|firefox/.test(t)) return 'browser';
  if (/win32|windows/.test(t)) return 'windows';
  if (/linux/.test(t)) return 'linux';
  return 'other';
}

const IDS = /\b([PQ]\d+\.\d+\.\d+)\b/g;
/** Suite ids named in a step. A golden-gate step that names only R1.2.1 items runs Q1.3.1 (its gate file says so). */
export function suiteIdsIn(name: string): string[] {
  const ids = [...name.matchAll(IDS)].map((m) => m[1]!);
  if (/golden gate/i.test(name) && !ids.includes('Q1.3.1')) ids.push('Q1.3.1');
  return ids;
}

function ruleSetsIn(text: string): string[] {
  const out: string[] = [];
  if (/\bpro(_2026)?\b|pro_\d{4}/.test(text)) out.push('pro');
  if (/\bcollege(_2026)?\b|college_\d{4}/.test(text)) out.push('college');
  return out;
}

/** Reads `npm run check` summaries: the machine field names the platform, step names carry the suite ids. A browser
 *  step reports for the browser platform. Rule sets are known only for the golden gate, from its gate file. */
export function readSummary(path: string, gateFiles: Record<string, string> = {}): SuiteRecord[] {
  const d = JSON.parse(readFileSync(path, 'utf8')) as { commit?: string; machine?: string; steps?: { name: string; ok: boolean; skipped?: string }[]; results?: { name: string; ok: boolean; skipped?: string }[] };
  const steps = d.steps ?? d.results ?? [];
  const machine = platformOf(d.machine ?? '');
  const out: SuiteRecord[] = [];
  for (const s of steps) {
    const p = /browser/i.test(s.name) ? 'browser' : machine;
    for (const id of suiteIdsIn(s.name)) {
      const gate = id === 'Q1.3.1' ? gateFiles[p] : undefined;
      out.push({ suite: id, platform: p, commit: d.commit ?? '', ok: s.ok, skipped: !!s.skipped, ruleSets: gate ? ruleSetsIn(gate) : [], source: path });
    }
  }
  return out;
}

/** The release contract for runners: { commit, platform, suites: [{ id, ok, skipped?, ruleSets? }] }. */
export function readReleaseFile(path: string): SuiteRecord[] {
  const d = JSON.parse(readFileSync(path, 'utf8')) as { commit?: string; platform?: string; suites?: { id: string; ok: boolean; skipped?: boolean | string; ruleSets?: string[] }[] };
  const p = platformOf(d.platform ?? '');
  return (d.suites ?? []).map((s) => ({ suite: s.id, platform: p, commit: d.commit ?? '', ok: s.ok === true, skipped: !!s.skipped, ruleSets: s.ruleSets ?? [], source: path }));
}

/** A transcribed Windows run: "commit abc1234" in the text and a "| step | pass |" table. */
export function readTranscribed(path: string): SuiteRecord[] {
  const t = readFileSync(path, 'utf8');
  const commit = /commit\s+([0-9a-f]{7,40})/i.exec(t)?.[1] ?? '';
  const out: SuiteRecord[] = [];
  for (const line of t.split(/\r?\n/)) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(pass|fail|skip\w*|not run)\s*\|/i.exec(line);
    if (!m) continue;
    const p = /browser/i.test(m[1]!) ? 'browser' : 'windows';
    for (const id of suiteIdsIn(m[1]!)) out.push({ suite: id, platform: p, commit, ok: /pass/i.test(m[2]!), skipped: /skip|not run/i.test(m[2]!), ruleSets: [], source: path });
  }
  return out;
}

export function collectSuiteRecords(root: string): SuiteRecord[] {
  const dir = join(root, 'test-results');
  if (!existsSync(dir)) return [];
  const gateFiles: Record<string, string> = {};
  for (const f of readdirSync(dir).filter((x) => /^gate-.*\.json$/.test(x))) {
    const text = readFileSync(join(dir, f), 'utf8');
    const p = platformOf(f);
    if (p !== 'other') gateFiles[p] = (gateFiles[p] ?? '') + text;
  }
  const out: SuiteRecord[] = [];
  if (existsSync(join(dir, 'summary.json'))) out.push(...readSummary(join(dir, 'summary.json'), gateFiles));
  for (const f of readdirSync(dir).filter((x) => /^windows-.*\.md$/.test(x))) out.push(...readTranscribed(join(dir, f)));
  const rel = join(dir, 'release');
  if (existsSync(rel)) for (const f of readdirSync(rel).filter((x) => x.endsWith('.json'))) out.push(...readReleaseFile(join(rel, f)));
  return out;
}

export interface SuiteVerdict { status: 'PASS' | 'FAIL' | 'MISSING' | 'PENDING' | 'STALE'; detail: string }

export function judgeSuite(def: SuiteDef, platform: Platform, records: readonly SuiteRecord[], commit: string): SuiteVerdict {
  const mine = records.filter((r) => r.suite === def.id && r.platform === platform);
  if (!mine.length) return { status: 'MISSING', detail: 'no run has reported this suite on this platform' };
  const here = mine.filter((r) => sameCommit(r.commit, commit));
  if (!here.length) {
    const last = mine.map((r) => `${r.commit || 'no commit'} (${r.skipped ? 'skipped' : r.ok ? 'pass' : 'fail'})`).join(', ');
    return { status: 'STALE', detail: `results only from other commits: ${last}` };
  }
  if (here.some((r) => !r.skipped && !r.ok)) return { status: 'FAIL', detail: `failed at this commit (${here.filter((r) => !r.ok).map((r) => r.source).join(', ')})` };
  const ran = here.filter((r) => !r.skipped && r.ok);
  if (!ran.length) return { status: 'PENDING', detail: 'skipped at this commit' };
  if (def.needsBothRuleSets) {
    const sets = new Set(ran.flatMap((r) => r.ruleSets));
    if (!sets.has('pro') || !sets.has('college')) return { status: 'PENDING', detail: `passed, but the result does not record both rule sets (has: ${[...sets].join(', ') || 'none recorded'})` };
  }
  return { status: 'PASS', detail: `passed at this commit (${ran.map((r) => r.source.replace(/^.*test-results\//, 'test-results/')).join(', ')})` };
}
