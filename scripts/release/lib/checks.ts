// Builds every release check and judges it. Nothing is PASS unless verified at the commit under test.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check, CheckResult, CheckStatus, EvidenceRecord, GateContext } from './types.ts';
import type { BibleLeaf, GateItem } from './bible.ts';
import { ownerOf, ownedPathsPresent, type WorkPackage } from './plans.ts';
import { judgeEvidence } from './evidence.ts';
import { RELEASE_SUITES, PLATFORMS, judgeSuite, type SuiteRecord } from './suites.ts';
import type { ProvisionalReport } from './provisional.ts';
import type { MarkHit } from './marks.ts';
import type { NameHit, NameSource, ResearchHit } from './people.ts';

export interface ScanResults {
  shippedFiles: number;
  buildArtifact: string | null;
  marks: { listPath: string; listStatus: string; hits: MarkHit[] } | null;
  names: { source: NameSource; hits: NameHit[] };
  research: { pathHits: ResearchHit[]; tokenHits: ResearchHit[]; copyHits: ResearchHit[]; researchFiles: number; dirs: string[] };
  provisional: ProvisionalReport;
}

export interface Inputs {
  ctx: GateContext;
  leaves: BibleLeaf[];
  gates: GateItem[];
  wps: WorkPackage[];
  evidence: EvidenceRecord[];
  suites: SuiteRecord[];
  scans: ScanResults;
}

const res = (c: Check, status: CheckStatus, detail: string): CheckResult => ({ ...c, status, detail, blocking: status === 'NOT_APPLICABLE' ? false : c.blocking });

function aggregate(list: readonly CheckResult[]): { status: CheckStatus; detail: string } {
  const order: CheckStatus[] = ['FAIL', 'MISSING', 'STALE', 'PENDING'];
  const counts = new Map<CheckStatus, number>();
  for (const r of list) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const worst = order.find((s) => counts.has(s));
  const summary = [...counts.entries()].map(([s, n]) => `${n} ${s}`).join(', ');
  return worst ? { status: worst, detail: summary } : list.length ? { status: 'PASS', detail: summary } : { status: 'MISSING', detail: 'no checks' };
}

function tracked(c: Check, inp: Inputs, fallback: () => { status: CheckStatus; detail: string }): CheckResult {
  const e = judgeEvidence(c.id, inp.evidence, inp.ctx.commit, inp.ctx.dirty);
  if (e) return res(c, e.status, e.detail);
  const f = fallback();
  return res(c, f.status, f.detail);
}

/** Source metadata (fact rows, calibration targets, citation lists) versus game content, so the report shows where a hit lives. */
export const SOURCE_METADATA = /(facts[^/]*\.json|fact-rows\.json|fact-ids\.json|\/sources\.ts|content\/calibration\/)/;
const byKind = (hits: { file: string }[]) => {
  const meta = hits.filter((h) => SOURCE_METADATA.test(h.file)).length;
  return `${hits.length - meta} in game content, ${meta} in source metadata (fact rows, calibration targets, citations)`;
};

const fmtHits = (hits: { file: string; line?: number; reason?: string; term?: string; name?: string }[], n = 5) =>
  hits.slice(0, n).map((h) => `${h.file}${h.line ? `:${h.line}` : ''} ${h.term ?? h.name ?? h.reason ?? ''}`.trim()).join('; ') + (hits.length > n ? `; and ${hits.length - n} more` : '');

export function suiteChecks(inp: Inputs): CheckResult[] {
  const out: CheckResult[] = [];
  for (const s of RELEASE_SUITES) for (const p of PLATFORMS) {
    const c: Check = { id: `suite:${s.id}:${p}`, group: 'release-suites', kind: 'automated', title: `${s.id} ${s.title} on ${p}`, source: 'Q1.8.1', criterion: `${s.id} passes on ${p}${s.needsBothRuleSets ? ', both rule sets' : ''}, at the release commit.`, blocking: true, ...(s.owner ? { owner: s.owner } : {}) };
    const v = judgeSuite(s, p, inp.suites, inp.ctx.commit);
    out.push(res(c, v.status, v.detail));
  }
  return out;
}

export function releaseGateChecks(inp: Inputs, suites: readonly CheckResult[]): CheckResult[] {
  const { scans, ctx } = inp;
  const out: CheckResult[] = [];
  const mk = (id: string, kind: Check['kind'], title: string, source: string, criterion: string, owner?: string): Check => ({ id, group: 'release-gate', kind, title, source, criterion, blocking: true, ...(owner ? { owner } : {}) });

  const a1 = aggregate(suites);
  out.push(res(mk('release:1-q1.8.1-row', 'automated', 'Everything in the Q1.8.1 "Before a release" row passes, both rule sets', 'R1.2.10 item 1', 'Every suite of Q1.8.1, both rule sets, every platform of P2.3, same commit.'), a1.status, `suites by platform: ${a1.detail}`));

  const q4 = aggregate(suites.filter((s) => s.id.startsWith('suite:Q4.1.1:')));
  const hasExploit = existsSync(join(ctx.root, 'packages/headless/src/exploit'));
  out.push(res(mk('release:2-q4-full-search', 'automated', 'Q4 full exploit search is clean on the release commit', 'R1.2.10 item 2', 'Q4 full search is clean on the release commit.', 'G-86'),
    hasExploit ? q4.status : 'MISSING', hasExploit ? q4.detail : 'exploit search module (packages/headless/src/exploit, G-86) does not exist yet'));

  const p = scans.provisional;
  const block = p.blockingRule.length + p.blockingConflict.length;
  out.push(res(mk('release:3a-provisional-blockers', 'automated', 'No rule value below "Rulebook only"; no Conflict row in use', 'R1.2.10 item 3, Q6.3.1', 'No rule value is below "Rulebook only". No Conflict row is read by config.'),
    block ? 'FAIL' : 'PASS', block ? `${p.blockingRule.length} rule rows below Rulebook only, ${p.blockingConflict.length} Conflict rows: ${[...p.blockingRule, ...p.blockingConflict].slice(0, 8).map((e) => `${e.row.id} (${e.computed})`).join(', ')}` : `0 blockers among ${p.total} rows from ${p.files.length} files`));
  out.push(res(mk('release:3b-provisional-list-printed', 'automated', 'Provisional fact list printed', 'R1.2.10 item 3, Q6.3.1', 'The list of provisional facts is printed.'),
    'PASS', `${p.provisional.length} of ${p.total} rows are PROVISIONAL; list in PROVISIONAL.md, hash ${p.listHash}`));
  const accept = mk('release:3c-marlon-accepts-provisional', 'tracked', 'Marlon accepts the provisional list or holds the release', 'R1.2.10 item 3', `Marlon accepts the printed list (hash ${p.listHash}) or holds the release.`);
  out.push(tracked(accept, inp, () => ({ status: 'PENDING', detail: `waiting for Marlon's decision on list ${p.listHash}` })));
  const lastAccept = out[out.length - 1]!;
  if (lastAccept.status === 'PASS') {
    const rec = inp.evidence.filter((e) => e.check === accept.id).pop();
    if (!rec?.notes?.includes(p.listHash)) out[out.length - 1] = res(accept, 'STALE', `acceptance does not name the current list hash ${p.listHash}`);
  }

  const hasValidation = existsSync(join(ctx.root, 'packages/headless/src/validation'));
  out.push(tracked(mk('release:4-q5-status', 'tracked', 'Q5 status stated; public wording matches the evidence level (Q5.5.1)', 'R1.2.10 item 4', 'Q5 status is stated, and the public wording matches the evidence level reached (Q5.5.1).', 'G-99'), inp,
    () => (hasValidation ? { status: 'PENDING', detail: 'validation tooling exists; no Q5 status recorded at this commit' } : { status: 'MISSING', detail: 'coach validation tooling (packages/headless/src/validation, G-99) does not exist yet' })));
  out.push(tracked(mk('release:5-legal-review', 'tracked', 'Legal review done if the release is public (A6.5.1)', 'R1.2.10 item 5', 'A6.5.1 legal review is done if the release is public; a personal, undistributed build skips this line (A3.3.1).'), inp,
    () => ({ status: 'PENDING', detail: 'commercial or personal release is an open decision (A3.3.1, Marlon); record either the review or the personal-build ruling' })));

  // Item 6: scans of the shipped tree.
  const where = `${scans.shippedFiles} shipped files${scans.buildArtifact ? ` incl. ${scans.buildArtifact}` : ' (no browser build present; source tree only)'}`;
  const m = scans.marks;
  out.push(res(mk('release:6a-mark-scan', 'automated', 'No team, school, league or event mark in the release (A6.2.2 scan)', 'R1.2.10 item 6, A6.2.2', 'The release build contains no team or league mark (A6.2.2 scan, zero hits).', 'G-11'),
    !m ? 'MISSING' : m.hits.length ? 'FAIL' : m.listStatus.toUpperCase() === 'PROVISIONAL' ? 'PENDING' : 'PASS',
    !m ? 'blocked-terms list not found (packages/football-content/data/world/blocked-terms.json)'
      : m.hits.length ? `${m.hits.length} hits in ${where} (${byKind(m.hits)}): ${fmtHits(m.hits)}`
      : m.listStatus.toUpperCase() === 'PROVISIONAL' ? `0 hits in ${where}, but the blocked-terms list is PROVISIONAL (entries not yet read from logged public sources), so a clean scan cannot pass`
      : `0 hits in ${where}`));
  const n = scans.names;
  out.push(res(mk('release:6b-name-scan', 'automated', "No real person's name in the release", 'R1.2.10 item 6, A6.3', "The release build contains no real person's name."),
    n.source.kind === 'none' ? 'MISSING' : n.hits.length ? 'FAIL' : n.source.kind === 'current-people-guard' ? 'PENDING' : 'PASS',
    n.source.kind === 'none' ? 'no list of real names on this machine (people database or G-18 guard)'
      : n.hits.length ? `${n.hits.length} real full names in ${where} (${byKind(n.hits)}): ${fmtHits(n.hits)}`
      : n.source.kind === 'current-people-guard' ? `0 hits against ${n.source.people} current people only (G-18 guard); the people database (GM_PEOPLE_DIR) is needed for every real person`
      : `0 hits against ${n.source.people} real people from ${n.source.path}, in ${where}`));
  const r = scans.research;
  out.push(res(mk('release:6c-research-paths', 'automated', 'No research path or raw dataset file in the release (A6.4.1 path check)', 'R1.2.10 item 6, A6.4.1', 'No file under the research paths is included.'),
    r.pathHits.length ? 'FAIL' : 'PASS', r.pathHits.length ? fmtHits(r.pathHits, 8) : `0 research paths or raw dataset files in ${where}`));
  out.push(res(mk('release:6d-person-records', 'automated', 'No per-person source record in the release (A6.4.1 item 3)', 'R1.2.10 item 6, A6.4.1', 'No per-person real record ships, named or stripped of names.'),
    r.tokenHits.length || r.copyHits.length ? 'FAIL' : r.dirs.length ? 'PASS' : 'PENDING',
    r.tokenHits.length || r.copyHits.length ? fmtHits([...r.copyHits, ...r.tokenHits], 8)
      : r.dirs.length ? `0 source-record ids or urls; 0 byte-identical copies of ${r.researchFiles} research files (${r.dirs.join(', ')})`
      : '0 source-record ids or urls; research folders not on this machine, so the copy check did not run (set GM_RESEARCH_DIR)'));
  out.push(tracked(mk('release:6e-similarity', 'tracked', 'No shipped file exceeds the similarity threshold against the people data (A6.4.1 item 4)', 'R1.2.10 item 6, A6.4.1', 'No shipped file exceeds a similarity threshold against the people data.'), inp,
    () => ({ status: 'PENDING', detail: 'name, id and byte-copy checks run above; a per-record numeric similarity measure and its threshold are not defined in the bible yet (A6.4.1 gives no number)' })));
  return out;
}

export function phaseGateChecks(inp: Inputs): CheckResult[] {
  return inp.gates.filter((g) => g.phase !== 'R1.2.10').map((g) => {
    const c: Check = { id: `gate:${g.phase}-${g.item}`, group: 'phase-gates', kind: 'tracked', title: `${g.phase} ${g.title}: item ${g.item}`, source: g.phase, criterion: g.text, blocking: true };
    if (/^If\b/.test(g.text)) return res(c, 'NOT_APPLICABLE', 'contingency step, applies only if the gate fails');
    if (/\bis retired\b/.test(g.text)) return res(c, 'NOT_APPLICABLE', 'retired item');
    return tracked(c, inp, () => ({ status: 'PENDING', detail: 'no recorded verification at this commit' }));
  });
}

export function planChecks(inp: Inputs): CheckResult[] {
  return inp.wps.map((w) => {
    const c: Check = { id: `plan:${w.id}`, group: w.plan === 'engine' ? 'engine-plan' : 'game-plan', kind: 'tracked', title: `${w.id} ${w.title}`, source: w.plan === 'engine' ? 'plans/engine-build-plan.md' : 'plans/game-build-plan.md', criterion: w.acceptance, owner: w.id, blocking: true };
    if (w.id === 'G-100') return res(c, 'PENDING', 'this gate: passes when every other check passes on Windows, Linux and the browser at one commit');
    const o = ownedPathsPresent(inp.ctx.root, w);
    return tracked(c, inp, () => (o.present.length === 0
      ? { status: 'MISSING', detail: `module not built: ${o.absent.join(', ') || 'no owned paths'}` }
      : { status: 'PENDING', detail: `module present (${o.present.length}/${o.present.length + o.absent.length} owned paths); acceptance not verified at this commit${o.absent.length ? `; absent: ${o.absent.join(', ')}` : ''}` }));
  });
}

/** Bible leaves whose acceptance is an automated release check. */
export const AUTOMATED_LEAVES: Record<string, string[]> = {
  'A6.2.2': ['release:6a-mark-scan'],
  'A6.4.1': ['release:6c-research-paths', 'release:6d-person-records', 'release:6e-similarity'],
  'Q6.3.1': ['release:3a-provisional-blockers', 'release:3b-provisional-list-printed', 'release:3c-marlon-accepts-provisional'],
};

export function bibleChecks(inp: Inputs, done: readonly CheckResult[]): CheckResult[] {
  const byId = new Map(done.map((d) => [d.id, d]));
  const presentWp = new Map(inp.wps.map((w) => [w.id, ownedPathsPresent(inp.ctx.root, w).present.length > 0]));
  return inp.leaves.map((l) => {
    const owner = ownerOf(l.id, inp.wps);
    const c: Check = { id: `bible:${l.id}`, group: 'bible', kind: AUTOMATED_LEAVES[l.id] ? 'automated' : 'tracked', title: `${l.id} ${l.title}`, source: `${l.id} (${l.file})`, criterion: l.criterion, blocking: true, ...(owner ? { owner } : {}) };
    if (!l.inScope) return res(c, 'NOT_APPLICABLE', l.scopeNote);
    const auto = AUTOMATED_LEAVES[l.id];
    if (auto) {
      const a = aggregate(auto.map((id) => byId.get(id)!).filter(Boolean));
      return res(c, a.status, `from ${auto.join(', ')}: ${a.detail}`);
    }
    if (!l.criterion) return res(c, 'MISSING', 'the bible leaf has no acceptance criterion written');
    return tracked(c, inp, () => {
      const note = l.scopeNote ? ` (${l.scopeNote})` : '';
      if (!owner) return { status: 'PENDING', detail: `no work package names this leaf; no recorded verification${note}` };
      return presentWp.get(owner) ? { status: 'PENDING', detail: `owner ${owner} present; no recorded verification at this commit${note}` } : { status: 'MISSING', detail: `owner ${owner} not built yet${note}` };
    });
  });
}

export function runChecks(inp: Inputs): CheckResult[] {
  const suites = suiteChecks(inp);
  const release = releaseGateChecks(inp, suites);
  const gates = phaseGateChecks(inp);
  const plans = planChecks(inp);
  const bible = bibleChecks(inp, release);
  return [...release, ...suites, ...gates, ...plans, ...bible];
}

export function verdict(all: readonly CheckResult[], ctx: GateContext): { pass: boolean; reasons: string[] } {
  const blocking = all.filter((c) => c.blocking && c.status !== 'PASS');
  const reasons: string[] = [];
  if (ctx.dirty) reasons.push('uncommitted source changes: results cannot be tied to one commit');
  if (blocking.length) reasons.push(`${blocking.length} blocking checks are not PASS`);
  return { pass: reasons.length === 0, reasons };
}

export function readJson<T>(p: string): T | null { return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null; }
