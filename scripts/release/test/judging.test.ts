import { describe, it, expect } from 'vitest';
import { judgeEvidence } from '../lib/evidence.ts';
import { judgeSuite, readSummary, suiteIdsIn, RELEASE_SUITES } from '../lib/suites.ts';
import { provisionalReport } from '../lib/provisional.ts';
import { runChecks, verdict, type Inputs } from '../lib/checks.ts';
import { sameCommit } from '../lib/git.ts';
import type { EvidenceRecord } from '../lib/types.ts';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const C = 'abcdef1234567890';
const rec = (o: Partial<EvidenceRecord>): EvidenceRecord => ({ check: 'x', result: 'pass', commit: C, date: '2026-11-26', confirmations: ['test', 'measurement', 'output'], by: 't', ...o });

describe('evidence', () => {
  it('passes only with three confirmations at this commit on a clean tree', () => {
    expect(judgeEvidence('x', [rec({})], C, false)?.status).toBe('PASS');
    expect(judgeEvidence('x', [rec({ confirmations: ['test', 'output'] })], C, false)?.status).toBe('PENDING');
    expect(judgeEvidence('x', [rec({ commit: '9999999aaaa' })], C, false)?.status).toBe('STALE');
    expect(judgeEvidence('x', [rec({})], C, true)?.status).toBe('PENDING');
    expect(judgeEvidence('x', [rec({ result: 'fail' })], C, false)?.status).toBe('FAIL');
    expect(judgeEvidence('y', [rec({})], C, false)).toBeNull();
  });
  it('commit prefixes of 7+ characters match', () => {
    expect(sameCommit('abcdef1', C)).toBe(true);
    expect(sameCommit('abcde', C)).toBe(false);
    expect(sameCommit('', C)).toBe(false);
  });
});

describe('suites', () => {
  const def = RELEASE_SUITES.find((s) => s.id === 'Q1.3.1')!;
  const r = (o: object) => ({ suite: 'Q1.3.1', platform: 'linux' as const, commit: C, ok: true, skipped: false, ruleSets: ['pro', 'college'], source: 'f', ...o });
  it('PASS at this commit with both rule sets; otherwise the exact reason', () => {
    expect(judgeSuite(def, 'linux', [r({})], C).status).toBe('PASS');
    expect(judgeSuite(def, 'linux', [r({ ruleSets: ['pro'] })], C).status).toBe('PENDING');
    expect(judgeSuite(def, 'linux', [r({ commit: '1234567' })], C).status).toBe('STALE');
    expect(judgeSuite(def, 'linux', [r({ ok: false })], C).status).toBe('FAIL');
    expect(judgeSuite(def, 'linux', [r({ skipped: true })], C).status).toBe('PENDING');
    expect(judgeSuite(def, 'windows', [r({})], C).status).toBe('MISSING');
  });
  it('reads npm run check summaries: platform from the machine, browser steps for the browser', () => {
    const d = mkdtempSync(join(tmpdir(), 'gm-rel-'));
    const p = join(d, 'summary.json');
    writeFileSync(p, JSON.stringify({ commit: 'abcdef1', machine: 'win32 10 x64', steps: [
      { name: 'headless golden gate (Q1.3.1)', ok: true }, { name: 'browser golden gate (R1.2.1 items 1-2)', ok: true }, { name: 'desktop (R1.2.1 item 1)', ok: true, skipped: 'no build' } ] }));
    const recs = readSummary(p, { windows: '"pro_2026.plays": 1, "college_2026.plays": 1' });
    expect(recs.map((x) => `${x.suite}@${x.platform}`)).toEqual(['Q1.3.1@windows', 'Q1.3.1@browser']);
    expect(recs[0]!.ruleSets).toEqual(['pro', 'college']);
    expect(suiteIdsIn('lints (P1.2.1, Q1.2.1, Q6.2.1)')).toEqual(['P1.2.1', 'Q1.2.1', 'Q6.2.1']);
  });
});

function factRoot(rows: object[]): { root: string; files: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'gm-facts-'));
  mkdirSync(join(root, 'facts'));
  writeFileSync(join(root, 'facts/t.json'), JSON.stringify({ domain: 'rule', rows }));
  return { root, files: ['facts/t.json'] };
}
const src = (g: string, o: object = {}) => ({ citation: 'c', locator: 'l', dateRead: '2026-11-25', howRead: 'primary text', independenceGroup: g, primary: false, value: 4, ...o });
const row = (id: string, sources: object[], o: object = {}) => ({ id, level: 'pro', domain: 'rule', statement: 's', value: 4, unit: 'count', validFor: '2026', sources, status: 'Verified', usedBy: [], notes: '', statusHistory: [], ...o });

describe('provisional list (Q6.3.1)', () => {
  it('acceptance: a Verified row reduced to 1 of 3 shows as provisional; status is recomputed, not trusted', () => {
    const three = [src('a'), src('b'), src('c')];
    const ok = factRoot([row('F-t-0001', three)]);
    expect(provisionalReport(ok.root, ok.files).provisional).toEqual([]);
    const one = factRoot([row('F-t-0001', [src('a')], { domain: 'measured-rate' })]);
    const r = provisionalReport(one.root, one.files);
    expect(r.provisional.map((e) => `${e.row.id}:${e.computed}`)).toEqual(['F-t-0001:1 of 3']);
    expect(r.statusMismatch.length).toBe(1);
  });
  it('a rule row below Rulebook only and a Conflict row block', () => {
    const f = factRoot([row('F-t-0002', [src('a')]), row('F-t-0003', [src('a', { value: 5, primary: true }), src('b')], { domain: 'measured-rate' })]);
    const r = provisionalReport(f.root, f.files);
    expect(r.blockingRule.map((e) => e.row.id)).toEqual(['F-t-0002']);
    expect(r.blockingConflict.map((e) => e.row.id)).toEqual(['F-t-0003']);
  });
});

describe('the gate never passes what it did not verify', () => {
  it('with no evidence and no suite results, no tracked check is PASS and the verdict is HOLD', () => {
    const f = factRoot([]);
    const inp: Inputs = {
      ctx: { root: f.root, commit: C, dirty: false },
      leaves: [{ id: 'Z1.1.1', title: 't', tag: 'v1', file: 'z.md', inScope: true, scopeNote: '', criterion: 'c' }],
      gates: [{ phase: 'R1.2.1', title: 'p', item: 1, text: 'Q1.3.1 passes.' }],
      wps: [{ id: 'G-01', title: 'Save', plan: 'game', owns: ['packages/store/src/save/'], bible: ['Z1'], needs: '', acceptance: 'a' }],
      evidence: [], suites: [],
      scans: { shippedFiles: 0, buildArtifact: null, marks: { listPath: 'l', listStatus: 'verified', hits: [] }, names: { source: { kind: 'people-database', path: 'p', people: 1, hashes: new Set() }, hits: [] },
        research: { pathHits: [], tokenHits: [], copyHits: [], researchFiles: 1, dirs: ['d'] }, provisional: provisionalReport(f.root, f.files), licences: { ok: true, errors: [], rows: 0, files: 0 } },
    };
    const all = runChecks(inp);
    expect(all.filter((c) => c.kind === 'tracked' && c.status === 'PASS')).toEqual([]);
    expect(all.find((c) => c.id === 'plan:G-01')!.status).toBe('MISSING');
    expect(all.find((c) => c.id === 'bible:Z1.1.1')!.status).toBe('MISSING');
    expect(verdict(all, inp.ctx).pass).toBe(false);
    // PV-15: the licence checker's ok:false is a FAIL and lists its errors; a missing checker is MISSING.
    const licFail = runChecks({ ...inp, scans: { ...inp.scans, licences: { ok: false, errors: ['assets/x.png has no row'], rows: 0, files: 1 } } });
    expect(licFail.find((c) => c.id === 'release:6f-asset-licences')).toMatchObject({ status: 'FAIL' });
    expect(licFail.find((c) => c.id === 'release:6f-asset-licences')!.detail).toContain('assets/x.png has no row');
    expect(runChecks({ ...inp, scans: { ...inp.scans, licences: null } }).find((c) => c.id === 'release:6f-asset-licences')!.status).toBe('MISSING');
    // With evidence at this commit the tracked check passes.
    const withEv = runChecks({ ...inp, evidence: [rec({ check: 'bible:Z1.1.1' })] });
    expect(withEv.find((c) => c.id === 'bible:Z1.1.1')!.status).toBe('PASS');
  });
});
