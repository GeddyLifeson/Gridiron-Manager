// Automated calibration search (J15, Q2): the parameter list, the block statistics, the three scan passes,
// the bounded search and the report, on made-up worlds with known answers; and one real block of games.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CalibrationTarget, ParamFile } from '@gm/schema';
import { rowMeta, runBlock, seedHex, type BlockResult, type BlockRow, type RowMeta } from '../../src/tune/job.ts';
import { rng, tunables, unitOf, valueAt, type Tunable } from '../../src/tune/registry.ts';
import { estimate, huber, paired, pairedLoss, pooled, score, summarize } from '../../src/tune/stats.ts';
import { confirmFit, confirmPlan, deadCheckJobs, findRefused, fitScreen, liveness, overridesAt, rankCandidates, rowNeed, screenMoves } from '../../src/tune/scan.ts';
import { search, solveStep } from '../../src/tune/search.ts';
import { formatTuneReport } from '../../src/tune/report.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');

function target(over: Partial<CalibrationTarget>): CalibrationTarget {
  return {
    id: 'test.row', ruleSetId: 'pro_2026', leaf: 'J15.2.1', layer: 'game', kind: 'mean', quantity: 'q', unit: 'u', filter: 'game.pointsPerTeam',
    definition: 'fixture', value: 10, n: null, seasons: 'fixture', tolerance: { type: 'abs', value: 1, low: null, high: null },
    factId: null, tier: 'tune', ruleSetDependent: false, note: null, ...over,
  };
}
const meta = (id: string, over: Partial<CalibrationTarget> = {}): RowMeta => ({ id, target: target({ id, ...over }), status: '1 of 3' });
const param = (name: string, value: number, min: number, max: number, status: 'starting' | 'frozen' = 'starting') =>
  ({ name, value, min, max, unit: 'ratio', belongsTo: 'test', basis: 'assumption' as const, leaf: 'J6.8.1', constrainedBy: 'fixture', status });
const FILE: ParamFile = { module: 'test.mod', version: '1', params: [param('t.b', 0.5, 0, 1), param('t.a', 2, 0, 10), param('t.frozen', 1, 0, 2, 'frozen'), param('t.flat', 3, 3, 3), param('t.outside', 5, 0, 4)] };

describe('parameter list', () => {
  const ps = tunables([FILE]);
  it('keeps rows with a range, in name order, and never a frozen row', () => {
    expect(ps.map((p) => p.name)).toEqual(['t.a', 't.b', 't.outside']);
  });
  it('widens a range to hold a value outside it, and says so', () => {
    const p = ps.find((x) => x.name === 't.outside')!;
    expect([p.lo, p.hi, p.outsideDeclared]).toEqual([0, 5, true]);
  });
  it('maps a value to its place in the range and back, never leaving the range', () => {
    const p = ps[0]!;
    expect(unitOf(p)).toBeCloseTo(0.2);
    expect(valueAt(p, 0.2)).toBe(2);
    expect(valueAt(p, 1.7)).toBe(10);
    expect(valueAt(p, -1)).toBe(0);
  });
  it('filters by name', () => {
    expect(tunables([FILE], { include: /^t\.[ab]$/, exclude: /b$/ }).map((p) => p.name)).toEqual(['t.a']);
  });
  it('the design generator repeats for a seed', () => {
    const a = rng(7), b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('block statistics', () => {
  it('pools a mean by events and an sd by pooled variance', () => {
    expect(pooled('mean', [[1, 10], [3, 30]])).toBeCloseTo(2.5);
    expect(pooled('sd', [[2, 5], [4, 5]])).toBeCloseTo(Math.sqrt((4 * 4 + 4 * 16) / 8));
    expect(pooled('mean', [[null, 0], [null, 0]])).toBeNull();
  });
  it('gives the textbook standard error for equal blocks', () => {
    const rows: BlockRow[] = [[1, 10], [2, 10], [3, 10], [4, 10]];
    const e = estimate('mean', rows);
    expect(e.value).toBeCloseTo(2.5);
    expect(e.se).toBeCloseTo(Math.sqrt(5 / 3 / 4)); // sample sd over root of the block count
    expect(e.blocks).toBe(4);
    expect(estimate('mean', [[1, 10]]).se).toBeNull();
  });
  it('a paired comparison drops the noise both runs share', () => {
    const before: BlockRow[] = [[10, 5], [20, 5], [30, 5], [40, 5]];
    const after: BlockRow[] = before.map(([v, n]) => [v! + 1, n]);
    const d = paired('mean', before, after);
    expect(d.d).toBeCloseTo(1);
    expect(d.se).toBeCloseTo(0);
    expect(estimate('mean', after).se!).toBeGreaterThan(5);
  });
  it('scores a row with the gate\'s own comparison', () => {
    const m = meta('a.b');
    expect(score(m, 10.5, 100)).toMatchObject({ pass: true, z: 0.5 });
    expect(score(m, 7, 100)).toMatchObject({ pass: false, z: -3 });
    expect(score(m, 1e9, 100).z).toBe(50);
    expect(score(m, null, 0)).toMatchObject({ pass: null, z: null });
    expect(score(meta('o.r', { kind: 'ordering', value: ['x', 'y'] }), -0.5, 4)).toMatchObject({ pass: false, z: -2 });
    expect(score(meta('q.r', { kind: 'quantiles', value: [5, 10, 20], tolerance: { type: 'rel', value: 0.1, low: 0.5, high: null } }), 0.5, 100)).toMatchObject({ pass: true, z: 0.5 });
  });
  it('the loss counts a far row linearly and weights a certify row three times', () => {
    expect(huber(2)).toBe(2);
    expect(huber(10)).toBe(4 * 10 - 8);
    const metas = [meta('a.b'), meta('c.d', { tier: 'certify' })];
    const s = summarize(metas, [[[12, 10], [12, 10]], [[12, 10], [12, 10]]]);
    expect(s.loss).toBeCloseTo(2 + 3 * 2);
    expect([s.measured, s.passed]).toEqual([2, 0]);
  });
  it('a paired loss drop comes with a standard error', () => {
    const metas = [meta('a.b')];
    const before: BlockRow[][] = [[[13, 10]], [[14, 10]], [[12, 10]], [[13, 10]]];
    const after: BlockRow[][] = before.map((b) => [[b[0]![0]! - 2, 10]]);
    const d = pairedLoss(metas, before, after);
    expect(d.drop).toBeGreaterThan(0);
    expect(d.se).not.toBeNull();
    expect(d.drop).toBeGreaterThan(2 * d.se!);
  });
});

/** A made-up world: each row is a straight line in the parameters' places plus per-block noise. */
function world(nParams: number, effects: readonly (readonly [row: number, param: number, slope: number])[], rowBase: readonly number[], noise: number) {
  const params: Tunable[] = tunables([{ module: 'w', version: '1', params: Array.from({ length: nParams }, (_, j) => param(`w.p${String(j).padStart(3, '0')}`, 0.5, 0, 1)) }]);
  const value = (u: ArrayLike<number>, seed: number): BlockRow[] => {
    const next = rng(seed);
    return rowBase.map((b, i) => {
      let v = b + (next() - 0.5) * 2 * noise;
      for (const [r, j, s] of effects) if (r === i) v += s * (u[j]! - 0.5);
      return [v, 10];
    });
  };
  return { params, value };
}

describe('scan', () => {
  it('dead check: job 0 is the untouched game and each parameter goes to its far end', () => {
    const ps = tunables([FILE]);
    const jobs = deadCheckJobs('pro_2026', ps, 1, 0x20);
    expect(jobs[0]!.overrides).toEqual({});
    expect(jobs.slice(1).map((j) => j.overrides)).toEqual([{ 't.a': 10 }, { 't.b': 0 }, { 't.outside': 0 }]);
    expect(new Set(jobs.map((j) => j.seedHex)).size).toBe(1);
    const r = (fingerprint: string, error?: string): BlockResult => ({ rows: [], fingerprint, ms: 0, ...(error ? { error } : {}) });
    expect(liveness([r('x'), r('y'), r('x'), r('', 'no')])).toEqual(['live', 'dead', 'error']);
  });
  it('screen runs come in mirrored pairs and stay inside each range', () => {
    const { params } = world(50, [], [], 0);
    const a = screenMoves(params, 6, 0.1, 99), b = screenMoves(params, 7, 0.1, 99);
    for (let j = 0; j < 50; j++) { expect(Math.abs(a[j]!)).toBeCloseTo(0.1); expect(a[j]! + b[j]!).toBeCloseTo(0); }
    expect([...screenMoves(params, 6, 0.1, 99)]).toEqual([...a]);
    expect([...screenMoves(params, 8, 0.1, 99)]).not.toEqual([...a]);
    const edge = tunables([{ module: 'e', version: '1', params: [param('e.top', 1, 0, 1)] }]);
    expect(screenMoves(edge, 0, 0.1, 1)[0]! <= 0 && screenMoves(edge, 1, 0.1, 1)[0]! <= 0).toBe(true);
    const o = overridesAt(params, a);
    expect(Object.values(o).every((v) => Math.abs(v - 0.5) < 0.11)).toBe(true);
  });
  it('finds the planted levers among 300 parameters and ranks them first', () => {
    const w = world(300, [[0, 17, 40], [0, 201, -25], [1, 88, 30]], [10, 10, 10], 1);
    const runs = 96;
    const moves = Array.from({ length: runs }, (_, r) => screenMoves(w.params, r, 0.1, 5));
    const rows = moves.map((m, r) => w.value(Float64Array.from(m, (x) => x + 0.5), 1000 + r));
    const fit = fitScreen(moves, rows, 3, 300);
    expect(fit.slope[0]![17]!).toBeGreaterThan(25);
    expect(fit.slope[0]![201]!).toBeLessThan(-12);
    expect(Math.abs(fit.t[0]![17]!)).toBeGreaterThan(5);
    expect(Math.abs(fit.t[1]![88]!)).toBeGreaterThan(5);
    // Row 2 has no lever: nothing should look strong there beyond chance.
    expect(Math.max(...fit.t[2]!.map(Math.abs))).toBeLessThan(4.5);
    const cands = rankCandidates(fit, [3, 1, 0], 3);
    expect(cands.map((c) => c.param).sort((a, b) => a - b)).toEqual([17, 88, 201]);
    expect(cands.find((c) => c.param === 17)!.topRows[0]!.row).toBe(0);
  });
  it('a passing row needs nothing; a failing row needs more the further off and the higher its tier', () => {
    const metas = [meta('a.b'), meta('c.d'), meta('e.f', { tier: 'certify' })];
    const s = summarize(metas, [[[10.2, 10], [12, 10], [30, 10]], [[10.2, 10], [12, 10], [30, 10]]]);
    expect(rowNeed(metas, s.scores)).toEqual([0, 2, 12]);
  });
  it('confirm measures a slope per full range with a standard error, on shared seeds', () => {
    const w = world(4, [[0, 2, 8]], [10, 10], 0.5);
    const metas = [meta('a.b'), meta('c.d')];
    const plan = confirmPlan('pro_2026', [w.params[2]!], 0.25, 4, 12, 0x1000)[0]!;
    expect(plan.jobs.length).toBe(8);
    expect(plan.jobs.slice(0, 4).map((j) => j.seedHex)).toEqual(plan.jobs.slice(4).map((j) => j.seedHex));
    expect(plan.jobs[0]!.overrides).toEqual({ 'w.p002': 0.25 });
    const res: BlockResult[] = plan.jobs.map((j) => {
      const u = [0.5, 0.5, j.overrides['w.p002']!, 0.5];
      return { rows: w.value(u, parseInt(j.seedHex, 16)), fingerprint: '', ms: 0 };
    });
    const c = confirmFit(metas, plan, res);
    expect(c.slope[0]).toBeCloseTo(8); // the noise is the same on both sides, so it cancels
    expect(c.se[0]!).toBeLessThan(0.01);
    expect(c.slope[1]).toBeCloseTo(0);
    const bad = confirmFit(metas, plan, [{ rows: [], fingerprint: '', ms: 0, error: 'refused' }, ...res.slice(1)]);
    expect(bad.error).toBe('refused');
  });
  it('finds the values the engine refuses by halving', async () => {
    const { params } = world(100, [], [], 0);
    let calls = 0;
    const refused = await findRefused(params, async (set) => { calls++; return set.some((p) => p.name === 'w.p013' || p.name === 'w.p077') ? 'fixed by the design' : null; });
    expect([...refused.keys()].sort()).toEqual(['w.p013', 'w.p077']);
    expect(calls).toBeLessThan(40);
    expect((await findRefused(params, async () => null)).size).toBe(0);
  });
});

describe('search', () => {
  it('the step stays inside the range and the step size, and lowers the predicted loss', () => {
    const step = solveStep({ z: [6, -3, null], weight: [1, 1, 1], a: [[-10, 0], [0, 4], [9, 9]], u: [0.95, 0.5], trust: 0.25, ridge: 0.5 });
    expect(step.delta[0]!).toBeCloseTo(0.05); // wants 0.6, the range ends at 1
    expect(step.delta[1]!).toBeCloseTo(0.25); // wants 0.75, the step size is 0.25
    expect(step.predicted[0]).toBeCloseTo(5.5);
    expect(step.predicted[1]).toBeCloseTo(-2);
    expect(step.predictedLoss).toBeLessThan(huber(6) + huber(3));
  });
  it('a lever with no slope is not moved', () => {
    const step = solveStep({ z: [5], weight: [1], a: [[0, -4]], u: [0.5, 0.5], trust: 0.5, ridge: 0.5 });
    expect(step.delta[0]).toBe(0);
    expect(step.delta[1]!).toBeGreaterThan(0.4);
  });
  it('closes a made-up gate by playing each step, and keeps only steps that helped', async () => {
    // Row 0 starts 6 tolerances high and row 1 four low; lever 0 moves row 0, lever 1 moves both.
    const w = world(3, [[0, 0, -20], [1, 1, 12], [0, 1, 3]], [16, 6], 0.2);
    const metas = [meta('a.b'), meta('c.d')];
    const blocksAt = (u: readonly number[]): BlockRow[][] => Array.from({ length: 6 }, (_, b) => w.value(u, 50 + b));
    const start = [0.5, 0.5, 0.5];
    let plays = 0;
    const r = await search({
      metas, slopes: [[-20, 3, 0], [0, 12, 0]], startU: start, startBlocks: blocksAt(start), iterations: 6,
      evaluate: async (u) => { plays++; return blocksAt(u); },
    });
    expect(r.startPassed).toBe(0);
    expect(r.best.passed).toBe(2);
    expect(r.best.loss).toBeLessThan(r.startLoss / 20);
    expect(r.bestU[2]).toBe(0.5);
    expect(r.bestU.every((u) => u >= 0 && u <= 1)).toBe(true);
    expect(plays).toBe(r.steps.length);
  });
  it('wrong slopes cannot make things worse: a step that plays badly is dropped', async () => {
    const w = world(1, [[0, 0, -20]], [16], 0.2);
    const metas = [meta('a.b')];
    const blocksAt = (u: readonly number[]): BlockRow[][] => Array.from({ length: 6 }, (_, b) => w.value(u, 50 + b));
    const r = await search({ metas, slopes: [[20]], startU: [0.5], startBlocks: blocksAt([0.5]), iterations: 1, evaluate: async (u) => blocksAt(u) });
    expect(r.steps[0]!.accepted).toBe(false);
    expect(r.bestU).toEqual([0.5]);
    expect(r.best.loss).toBe(r.startLoss);
  });
  it('learns from a dropped step: the slope is corrected and the next step goes the right way', async () => {
    const w = world(1, [[0, 0, -20]], [16], 0.2);
    const metas = [meta('a.b')];
    const blocksAt = (u: readonly number[]): BlockRow[][] => Array.from({ length: 6 }, (_, b) => w.value(u, 50 + b));
    const r = await search({ metas, slopes: [[20]], startU: [0.5], startBlocks: blocksAt([0.5]), iterations: 8, evaluate: async (u) => blocksAt(u) });
    expect(r.best.loss).toBeLessThan(r.startLoss);
    expect(r.bestU[0]!).toBeGreaterThan(0.5);
  });
  it('an engine refusal halves the step and is logged, not thrown', async () => {
    const metas = [meta('a.b')];
    const blocks: BlockRow[][] = [[[16, 10]], [[16, 10]]];
    const r = await search({ metas, slopes: [[-20]], startU: [0.5], startBlocks: blocks, iterations: 2, evaluate: async () => null });
    expect(r.steps.map((s) => s.loss)).toEqual([null, null]);
    expect(r.steps[1]!.trust).toBeCloseTo(r.steps[0]!.trust / 2);
  });
});

describe('report', () => {
  it('names rows off target, the levers, the rows no lever can close, and the proposal; the same input gives the same text', () => {
    const w = world(3, [[0, 0, -20]], [16, 6, 10], 0.2);
    const metas = [meta('a.high'), meta('b.stuck'), meta('c.fine')];
    const blocks = Array.from({ length: 4 }, (_, b) => w.value([0.5, 0.5, 0.5], 50 + b));
    const after = Array.from({ length: 4 }, (_, b) => w.value([0.8, 0.5, 0.5], 50 + b));
    const input = {
      ruleSetId: 'pro_2026', build: 'test', metas,
      baseline: { games: 48, blockGames: 12, blocks, overrides: {} },
      dead: { games: 1, params: w.params, verdict: ['live', 'dead', 'error'] as const, errors: { 'w.p002': 'fixed by the design' } },
      confirm: { params: [w.params[0]!], step: 0.25, games: 48, confirmed: [{ name: 'w.p000', uMinus: 0.25, uPlus: 0.75, slope: [-20, 0, 0.01], se: [0.5, 0.5, 0.5] }] },
      search: { params: [w.params[0]!], bestU: [0.8], best: summarize(metas, after), steps: [{ iteration: 1, u: [0.8], trust: 0.25, predictedLoss: 9, loss: 9.5, passed: 2, accepted: true }],
        holdout: { games: 48, before: summarize(metas, blocks), after: summarize(metas, after), lossDrop: 15, lossDropSe: 1 } },
    };
    const text = formatTuneReport(input);
    expect(text).toContain('| a.high | tune | 1 of 3 | 10 |');
    expect(text).toContain('w.p000 (0.5, range 0 to 1): -20');
    expect(text).toContain('move it up');
    expect(text).toMatch(/can bring inside tolerance[\s\S]*- b\.stuck \(off by -4/);
    expect(text.slice(text.indexOf('can bring inside tolerance'), text.indexOf('## 4'))).not.toContain('a.high');
    expect(text).toContain('| w.p000 | 0.5 | 0.8 | 0 to 1 | +30% |');
    expect(text).toContain('The improvement holds on fresh seeds.');
    expect(text).toContain('Rows that now pass: a.high.');
    expect(text).toContain('1 changed the game, 1 left it identical play for play, 1 made the engine refuse the value');
    expect(formatTuneReport(input)).toBe(text);
  });
});

describe('one real block (the game this build plays)', () => {
  it('measures the target rows, repeats byte for byte on a seed, and reports a refused table instead of throwing', () => {
    const job = { ruleSetId: 'pro_2026', games: 1, seedHex: seedHex(0x1000), overrides: {} };
    const a = runBlock(ROOT, job), b = runBlock(ROOT, job);
    const metas = rowMeta(ROOT, 'pro_2026');
    expect(a.error).toBeUndefined();
    expect(a.rows.length).toBe(metas.length);
    expect(a.rows.filter((r) => r[0] !== null).length).toBeGreaterThan(50);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(runBlock(ROOT, { ...job, seedHex: seedHex(0x1001) }).fingerprint).not.toBe(a.fingerprint);
    expect(runBlock(ROOT, { ...job, overrides: { 'no.such.param': 1 } }).error).toMatch(/unknown parameter/);
  }, 120_000);
});
