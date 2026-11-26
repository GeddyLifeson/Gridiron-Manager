// X13.3.1 timed runner on G-82's real tiers module (loaded by path: @gm/world's entry point does not
// export it yet). The runner walks the ladder and takes each number three ways; G-82 judges them.
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadTiers } from '../../src/tier-timing/cli-lib.ts';
import { coldStart, leagueWeekPlan, runProtocol, type ChildSample, type TierConfig, type WorkloadPlan } from '../../src/tier-timing/index.ts';

const TIERS_PATH = fileURLToPath(new URL('../../../world/src/tiers/index.ts', import.meta.url));
const TOY = new URL('./toy-workload.ts', import.meta.url).href;
const plan = (over: Partial<WorkloadPlan> = {}, options: object = { spin: 2_000_000, supports: [] }): WorkloadPlan => ({ id: 'toy', module: TOY, options: options as never, feeds: { timeMs: 'leagueWeekMs' }, ...over });

/** A sampler that answers from a table, so the ladder logic is tested without timing noise. */
function scripted(ms: (config: TierConfig, call: number) => number, supported: readonly string[] = ['trajectories_non_user_games', 'play_events_outside_tier1']) {
  const calls: string[] = [];
  const sample = (_p: WorkloadPlan, config: TierConfig): ChildSample => {
    calls.push(config.id);
    const unsupported = config.thinned.filter((s) => !supported.includes(s));
    const t = ms(config, calls.filter((c) => c === config.id).length);
    return { ok: true, unsupported, scale: { games: 80 }, harnessMs: t, osMs: t + 1, cpuMs: t * 3, peakRssHarnessMb: 300, peakRssOsMb: 310, value: { harness: 40, os: 40 } };
  };
  return { sample, calls };
}

describe('tier timing runner (X13.3.1)', async () => {
  const tiers = await loadTiers(TIERS_PATH);
  const base = { tiers, buildHash: 'abc123', machine: 'test machine' };

  it('records the baseline even when it is far over budget, then thins one step at a time and stops at the first inside the budget', () => {
    const s = scripted((c) => [900, 400, 100][c.thinned.length]!);
    const r = runProtocol({ ...base, workloads: [plan()], budgets: { leagueWeekMs: 500 }, sample: s.sample });
    expect(r.configs.map((c) => (c.report as { config: TierConfig }).config.id)).toEqual(['baseline', 'thin-1']);
    expect(s.calls).toEqual(['baseline', 'baseline', 'thin-1', 'thin-1']);
    expect(r.configs[0]!.problems.join()).toMatch(/leagueWeekMs: 900 is over the budget of 500/);
    expect(r.configs[1]!.problems).toEqual([]);
    expect(r.stopped).toMatchObject({ at: 'thin-1', reason: 'inside_every_budget' });
    expect(r.choice).toMatchObject({ kind: 'ship', report: { config: { id: 'thin-1' } } });
  });
  it('takes each number three ways: harness, operating system, second cold start', () => {
    const s = scripted((_c, call) => (call === 1 ? 200 : 210));
    const r = runProtocol({ ...base, workloads: [plan({ feeds: { timeMs: 'leagueWeekMs', peakMemoryMb: 'peakMemoryMb', value: 'saveSizeMb' } })], budgets: { leagueWeekMs: 500 }, sample: s.sample });
    const n = (r.configs[0]!.report as { numbers: Record<string, { triple: unknown; accepted: boolean; value: number }> }).numbers;
    expect(n['leagueWeekMs']).toMatchObject({ triple: { harness: 200, os: 201, second: 210 }, accepted: true, value: 201 });
    expect(n['peakMemoryMb']!.triple).toEqual({ harness: 300, os: 310, second: 310 });
    expect(n['saveSizeMb']!.triple).toEqual({ harness: 40, os: 40, second: 40 });
    expect(r.notMeasured.map((x) => x.metric)).toEqual(['seasonTurnoverMs', 'hiringCycleMs', 'worldGenerationMs', 'loadMs']);
  });
  it('does not accept a number whose second cold start disagrees, and escalates instead of shipping it', () => {
    const s = scripted((_c, call) => (call === 1 ? 200 : 300));
    const r = runProtocol({ ...base, workloads: [plan()], budgets: { leagueWeekMs: 500 }, sample: s.sample });
    expect(r.configs).toHaveLength(3);
    expect(r.configs[0]!.problems.join()).toMatch(/three measurements do not agree/);
    expect(r.stopped.reason).toBe('ladder_end');
    expect(r.choice).toMatchObject({ kind: 'escalate', options: ['slower_week', 'smaller_world'] });
  });
  it('stops, and says why, at a thinning step no workload can apply; it never measures it as if applied', () => {
    const s = scripted(() => 900, []);
    const r = runProtocol({ ...base, workloads: [plan()], budgets: { leagueWeekMs: 500 }, sample: s.sample });
    expect(r.configs).toHaveLength(1);
    expect(s.calls).toEqual(['baseline', 'baseline', 'thin-1']);
    expect(r.stopped).toMatchObject({ at: 'thin-1', reason: 'step_not_supported' });
    expect(r.choice).toMatchObject({ kind: 'escalate' });
  });
  it('comes with a diff against the last report', () => {
    const before = runProtocol({ ...base, workloads: [plan()], budgets: { leagueWeekMs: 500 }, sample: scripted(() => 200).sample });
    const after = runProtocol({ ...base, workloads: [plan()], budgets: { leagueWeekMs: 500 }, sample: scripted(() => 300).sample, previous: { baseline: before.configs[0]!.report } });
    expect(before.configs[0]!.diff).toBeNull();
    expect(after.configs[0]!.diff).toContainEqual({ metric: 'leagueWeekMs', before: 200, after: 300, change: 0.5 });
  });
  it('refuses plans that feed an unknown number, feed one number twice, or measure nothing', () => {
    const s = scripted(() => 1).sample;
    expect(() => runProtocol({ ...base, workloads: [], budgets: {}, sample: s })).toThrow(/nothing would be measured/);
    expect(() => runProtocol({ ...base, workloads: [plan({ feeds: { timeMs: 'gamesPerSecond' } })], budgets: {}, sample: s })).toThrow(/not a report metric/);
    expect(() => runProtocol({ ...base, workloads: [plan(), plan({ id: 'again' })], budgets: {}, sample: s })).toThrow(/fed by both toy and again/);
  });

  it('measures a workload in a fresh process, with all three clocks and the memory peak', () => {
    const a = coldStart(plan(), { id: 'baseline', thinned: [] });
    if (!a.ok) throw new Error(a.error);
    expect(a.unsupported).toEqual([]);
    expect(a.scale).toEqual({ spin: 2_000_000 });
    expect(a.harnessMs).toBeGreaterThan(0);
    expect(Math.abs(a.osMs - a.harnessMs)).toBeLessThan(50);
    expect(a.peakRssOsMb).toBeGreaterThan(20);
    expect(a.peakRssHarnessMb).toBeGreaterThan(20);
    expect(a.value).toEqual({ harness: 12.5, os: 12.5 });
    const thin = coldStart(plan(), { id: 'thin-1', thinned: ['trajectories_non_user_games'] });
    expect(thin).toMatchObject({ ok: true, unsupported: ['trajectories_non_user_games'], harnessMs: 0 });
    expect(coldStart(plan({}, { spin: 1, supports: [], fail: true }), { id: 'baseline', thinned: [] })).toMatchObject({ ok: false, error: expect.stringMatching(/told to fail/) });
  });
  it('runs a small league week of real games on the pool end to end', () => {
    const r = runProtocol({ ...base, workloads: [leagueWeekPlan({ proGames: 3, collegeGames: 3, workers: 2 })], budgets: {} });
    expect(r.configs).toHaveLength(1);
    const rep = r.configs[0]!.report as { scale: unknown; numbers: Record<string, { value: number }> };
    expect(rep.scale).toEqual({ proGames: 3, collegeGames: 3, poolWorkers: 2 });
    expect(rep.numbers['leagueWeekMs']!.value).toBeGreaterThan(50);
    expect(rep.numbers['peakMemoryMb']!.value).toBeGreaterThan(50);
    // With no budget given the baseline is inside every budget, so it ships (rule 3: nothing is thinned beyond need).
    expect(r.choice).toMatchObject({ kind: 'ship' });
  }, 240_000);
});
