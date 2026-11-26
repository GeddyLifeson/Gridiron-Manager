// WP-13 tests: target files (J15.1.1, Q2.1.1, Q6), measures and tolerances (J15.1.2, Q2.3.1), the report
// and gate (J15.10.1, Q1.7.2 on fixture summaries), the chart caller (D-20) and the batch runner (J14.6.1).
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CalibrationTarget, CalibrationTargetFile, FactRow, GameFlow, StatsModule, PlayRecord, GameInput, GameDeps } from '@gm/schema';
import { targetTierProblems } from '@gm/schema';
import {
  loadTargets, readMeasuredRateFacts, checkTargets, parseMeasure, prepare, observe, mean, sampleSd, quantile, compareScalar, compareQuantiles,
  compareOrdering, buildReport, formatReport, createChartCaller, depthRoster, runBatch, gameSeedHex, PARAMS, isKnownMeasure, type CalibrationSample, type RunInfo,
} from '../../src/calibration/index.ts';
import { row, run, pass, summary, drive, situation, request, GEOMETRY } from './fixtures.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');
const RUN: RunInfo = { build: 'test', paramsHash: 'none', resolverId: 'fixture', seeds: 'fixture', games: 0, seedGroups: 1 };

function target(over: Partial<CalibrationTarget>): CalibrationTarget {
  return {
    id: 'test.row', ruleSetId: 'pro_2026', leaf: 'J15.2.1', layer: 'game', kind: 'mean', quantity: 'q', unit: 'u', filter: 'game.pointsPerTeam',
    definition: 'fixture', value: 22, n: null, seasons: 'fixture', tolerance: { type: 'rel', value: 0.03, low: null, high: null },
    factId: null, tier: 'watch', ruleSetDependent: false, note: null, ...over,
  };
}
function fact(id: string, value: number | string | undefined, status: FactRow['status'], level: FactRow['level'] = 'pro'): FactRow {
  return { id, level, domain: 'measured-rate', statement: 'fixture', ...(value === undefined ? {} : { value }), validFor: 'fixture', sources: [], status, usedBy: [], statusHistory: [] };
}
const sample = (summaries: CalibrationSample['summaries'], plays: CalibrationSample['plays'] = []): CalibrationSample => ({ summaries, plays });

describe('target files (J15.1.1, Q2.1.1, Q6)', () => {
  const facts = readMeasuredRateFacts(ROOT);
  for (const id of ['pro_2026', 'college_2026']) {
    it(`${id} loads with no loader problems`, () => {
      const l = loadTargets(ROOT, id);
      expect(l.problems).toEqual([]);
      expect(l.file.targets.length).toBeGreaterThan(50);
    });
  }

  it('targetTierProblems is empty on every row of both files', () => {
    const byId = new Map(facts.map((f) => [f.id, f]));
    for (const id of ['pro_2026', 'college_2026']) {
      for (const t of loadTargets(ROOT, id).file.targets) expect(targetTierProblems(t, t.factId ? byId.get(t.factId)?.status ?? null : null)).toEqual([]);
    }
  });

  it('only Verified rows are certify: points per team, total points, and the rusher-count orderings (build plan section 4)', () => {
    const l = loadTargets(ROOT, 'pro_2026');
    const certify = l.file.targets.filter((t) => t.tier === 'certify');
    for (const t of certify) expect(l.statusOf.get(t.id)).toBe('Verified');
    expect(certify.map((t) => t.id).sort()).toEqual(['game.pointsPerTeam', 'game.totalPoints', 'pressure.byRushers.pressureRate.order',
      'pressure.byRushers.sackRate.order3to5', 'pressure.byRushers.sackRate.order4to6']);
  });

  it('no college row is filled from a pro value and none is certify', () => {
    const l = loadTargets(ROOT, 'college_2026');
    const byId = new Map(facts.map((f) => [f.id, f]));
    for (const t of l.file.targets) {
      expect(t.ruleSetId).toBe('college_2026');
      expect(t.tier).not.toBe('certify');
      if (t.factId) expect(byId.get(t.factId)!.level).toBe('college');
      else { expect(t.value).toEqual([]); expect(t.tier).toBe('watch'); }
    }
    // The T12.7.1 open rows exist as MISSING SOURCE rows.
    expect(l.file.targets.filter((t) => t.leaf === 'T12.7.1' && t.factId === null).length).toBe(11);
  });

  it('every fact row status equals the status computed from its sources', async () => {
    const { computeStatus } = await import('@gm/schema');
    for (const f of facts) expect(computeStatus(f)).toBe(f.status);
  });

  it('the loader rejects a pro fact on a college row, a value mismatch and a certify row that is not Verified', () => {
    const file: CalibrationTargetFile = { ruleSetId: 'college_2026', version: 't', targets: [
      target({ id: 'a.one', ruleSetId: 'college_2026', factId: 'F-measured-rate-9001', value: 22, tier: 'tune' }),
      target({ id: 'a.two', ruleSetId: 'college_2026', factId: 'F-measured-rate-9002', value: 30, tier: 'tune' }),
      target({ id: 'a.three', ruleSetId: 'college_2026', factId: 'F-measured-rate-9002', value: 27, tier: 'certify' }),
      target({ id: 'a.four', ruleSetId: 'college_2026', filter: 'no.suchMeasure', factId: null, value: [], tier: 'watch' }),
    ] };
    const f = [fact('F-measured-rate-9001', 22, '2 of 3', 'pro'), fact('F-measured-rate-9002', 27, '1 of 3', 'college')];
    const probs = checkTargets(file, f).problems.join('\n');
    expect(probs).toMatch(/a\.one: fact row F-measured-rate-9001 is level pro/);
    expect(probs).toMatch(/a\.two: target value 30 does not equal/);
    expect(probs).toMatch(/a\.three: tier certify needs status Verified/);
    expect(probs).toMatch(/a\.four: unknown measure no\.suchMeasure/);
  });
});

describe('measures', () => {
  it('parses names, arguments and quantile points', () => {
    expect(parseMeasure('kick.fieldGoalPct(40,49): words')).toEqual({ name: 'kick.fieldGoalPct', args: ['40', '49'], quantiles: null });
    expect(parseMeasure('rush.gain@5,50,95: x')).toEqual({ name: 'rush.gain', args: [], quantiles: [5, 50, 95] });
    expect(parseMeasure('none')).toEqual({ name: 'none', args: [], quantiles: null });
    expect(isKnownMeasure('pass.completionPct')).toBe(true);
  });

  it('counts passes, sacks and carries by the J15 definitions', () => {
    const plays = [
      pass('complete', 12), pass('incomplete'), pass('interception'), pass('sack', -7),
      run(4), run(-1), row({ offenseKind: 'kneel', resultType: 'kneel', yardsGained: -1 }),
      row({ offenseKind: 'spike', resultType: 'spike', dropback: true, runLocation: null }),
      row({ dropback: true, scramble: true, offenseKind: 'dropback_pass', yardsGained: 9 }),
      run(30, { noPlay: true }), // wiped out by a penalty: never counted
    ];
    const x = prepare(sample([], plays));
    const v = (f: string) => mean(observe(parseMeasure(f), x)!);
    expect(v('pass.completionPct')).toBeCloseTo(1 / 3);
    expect(v('pass.yardsPerAttempt')).toBeCloseTo(4);
    expect(v('pass.sackRate')).toBeCloseTo(1 / 4);
    expect(v('pass.sackYards')).toBe(7);
    expect(v('pass.scrambleShare')).toBeCloseTo(1 / 5);
    expect(v('rush.yardsPerCarry')).toBeCloseTo((4 - 1 + 9) / 3); // scramble in, kneel out
    expect(v('rush.yardsPerCarryOfficial')).toBeCloseTo((4 - 1 + 9 - 1) / 4); // kneel in
    expect(v('rush.yardsPerCarryDesigned')).toBeCloseTo((4 - 1) / 2);
    expect(v('situation.passPlayShare')).toBeCloseTo(4 / 7); // pass plays over pass and run plays, scramble counted as a run
    expect(v('situation.dropbackShare')).toBeCloseTo(5 / 7);
  });

  it('bins yards to go with inches as 1 and reads fourth-down choices', () => {
    const plays = [
      run(1, { down: 4, distanceYd: 0.4, firstDown: true }),
      run(0, { down: 4, distanceYd: 2 }),
      row({ down: 4, distanceYd: 8, kickKind: 'punt', offenseKind: null, resultType: 'punt' }),
      row({ down: 4, distanceYd: 6, kickKind: 'field_goal', offenseKind: null, resultType: 'field_goal_good', kickDistanceYd: 44 }),
      row({ down: 4, distanceYd: 5, kickKind: 'field_goal', offenseKind: null, resultType: 'field_goal_missed', kickDistanceYd: 52 }),
    ];
    const x = prepare(sample([], plays));
    const v = (f: string) => mean(observe(parseMeasure(f), x)!);
    expect(v('situation.conversion(4,1,2)')).toBe(0.5);
    expect(v('situation.fourthDown.share(go)')).toBeCloseTo(2 / 5);
    expect(v('situation.fourthDown.share(punt)')).toBeCloseTo(1 / 5);
    expect(v('situation.fourthDown.goRate(0,2)')).toBe(1);
    expect(v('kick.fieldGoalPct(40,49)')).toBe(1);
    expect(v('kick.fieldGoalPct(0,99)')).toBe(0.5);
  });

  it('reads game, drive and penalty measures from summaries and rows', () => {
    const s = sample([
      summary(1, [24, 17], { drives: [drive({ result: 'touchdown' }), drive({ driveNumber: 2, side: 1, result: 'punt' })] }),
      summary(2, [20, 20], { overtime: true, drives: [drive({ result: 'field_goal' })] }),
    ], [
      run(3, { gameId: 1, driveNumber: 1, yardsToGoalYd: 15, penalties: [{ foulId: 'offensive_holding', side: 0, yards: 10 }] }),
      run(3, { gameId: 1, driveNumber: 2, yardsToGoalYd: 60 }),
    ]);
    const x = prepare(s);
    const v = (f: string) => mean(observe(parseMeasure(f), x)!);
    expect(v('game.pointsPerTeam')).toBeCloseTo(81 / 4);
    expect(v('game.homeWin')).toBe(0.5);
    expect(v('game.tie')).toBe(0.5);
    expect(v('game.overtime')).toBe(0.5);
    expect(v('game.marginAtMost(8)')).toBe(1);
    expect(v('drive.result(touchdown+field_goal)')).toBeCloseTo(2 / 3);
    expect(v('drive.pointsTd7Fg3')).toBeCloseTo(10 / 3);
    expect(v('drive.redZoneShare')).toBeCloseTo(1 / 3);
    expect(v('drive.redZoneResult(touchdown)')).toBe(1);
    expect(v('foul.typePerGame(offensive_holding)')).toBe(0.5);
    expect(sampleSd(observe(parseMeasure('game.totalPoints'), x)!)).toBeCloseTo(Math.sqrt(((41 - 40.5) ** 2 + (40 - 40.5) ** 2) / 1));
    expect(observe(parseMeasure('none'), x)).toBeNull();
  });

  it('quantiles interpolate linearly (numpy default)', () => {
    expect(quantile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(quantile([0, 10], 25)).toBe(2.5);
    expect(quantile([], 50)).toBeNull();
  });
});

describe('tolerances (J15.1.2, Q2.3.1)', () => {
  it('rel uses the larger of the stated tolerance and two real-data standard errors', () => {
    const t = target({ kind: 'rate', value: 0.5, n: 100, tolerance: { type: 'rel', value: 0.03, low: null, high: null } });
    const c = compareScalar(t, 0.58, 1000); // 2 SE = 0.1 > 0.015
    expect(c.toleranceUsed).toBeCloseTo(0.1);
    expect(c.pass).toBe(true);
    expect(compareScalar(target({ value: 22 }), 23, 10).pass).toBe(false);
    expect(compareScalar(target({ value: 22 }), 22.5, 10).pass).toBe(true);
  });
  it('band, abs and poisson rows', () => {
    expect(compareScalar(target({ value: 12.59, tolerance: { type: 'band', value: 0, low: 12, high: 13.5 } }), 13.4, 1).pass).toBe(true);
    expect(compareScalar(target({ value: 12.59, tolerance: { type: 'band', value: 0, low: 12, high: 13.5 } }), 13.6, 1).pass).toBe(false);
    expect(compareScalar(target({ value: 3, tolerance: { type: 'abs', value: 0.5, low: null, high: null } }), 3.4, 1).pass).toBe(true);
    const rare = target({ kind: 'rate', value: 0.0025, tolerance: { type: 'poisson', value: 0.1, low: null, high: null } });
    expect(compareScalar(rare, 0.003, 10000).pass).toBe(true); // expected 25, 2 sqrt = 10 events = 0.001
    expect(compareScalar(rare, 0.006, 10000).pass).toBe(false);
    expect(compareScalar(rare, 0.0025, 0).pass).toBe(false);
  });
  it('quantile rows use the absolute floor per point, ordering rows the seed-group share', () => {
    const t = target({ kind: 'quantiles', value: [1, 10, 100], tolerance: { type: 'rel', value: 0.03, low: 0.5, high: null } });
    expect(compareQuantiles(t, [1.4, 10.2, 102]).pass).toBe(true);
    expect(compareQuantiles(t, [1.6, 10, 100]).pass).toBe(false);
    const o = target({ kind: 'ordering', value: ['a', 'b'], tolerance: { type: 'band', value: 0.95, low: 0.95, high: 1 } });
    expect(compareOrdering(o, 19, 20).pass).toBe(true);
    expect(compareOrdering(o, 18, 20).pass).toBe(false);
  });
});

describe('report and gate (J15.10.1, Q1.7.2 on fixture summaries)', () => {
  const games = [summary(1, [24, 20]), summary(2, [21, 24]), summary(3, [20, 24]), summary(4, [24, 20])];
  const facts = [fact('F-measured-rate-9101', 22, 'Verified'), fact('F-measured-rate-9102', 0.5, '1 of 3')];
  const file: CalibrationTargetFile = { ruleSetId: 'pro_2026', version: 't', targets: [
    target({ id: 'g.points', factId: 'F-measured-rate-9101', tier: 'certify' }),
    target({ id: 'g.home', kind: 'rate', filter: 'game.homeWin', value: 0.5, factId: 'F-measured-rate-9102', tier: 'tune' }),
    target({ id: 'g.missing', factId: null, value: [], tier: 'watch' }),
    target({ id: 'g.none', filter: 'none', factId: 'F-measured-rate-9101', value: 22, tier: 'watch' }),
  ] };

  it('passes the gate when every certify row passes, and prints PROVISIONAL, MISSING SOURCE and NOT MEASURABLE', () => {
    const rep = buildReport(checkTargets(file, facts), [sample(games)], RUN);
    expect(rep.gate).toBe('pass');
    const byId = new Map(rep.rows.map((r) => [r.id, r]));
    expect(byId.get('g.points')!.simulated).toBeCloseTo(22.125);
    expect(byId.get('g.points')!.provisional).toBe(false);
    expect(byId.get('g.home')!.provisional).toBe(true);
    expect(byId.get('g.missing')!.state).toBe('missing_source');
    expect(byId.get('g.none')!.state).toBe('not_measurable');
    const text = formatReport(rep);
    expect(text).toMatch(/g\.home \|.*PASS PROVISIONAL/);
    expect(text).toMatch(/g\.missing \|.*MISSING SOURCE PROVISIONAL/);
    expect(text).toMatch(/g\.none \|.*NOT MEASURABLE/);
    expect(formatReport(buildReport(checkTargets(file, facts), [sample(games)], RUN))).toBe(text); // byte-identical
  });

  it('fails the gate when a certify row fails, and never passes a file with no certify row', () => {
    const low = [summary(1, [10, 10]), summary(2, [10, 10])];
    expect(buildReport(checkTargets(file, facts), [sample(low)], RUN).gate).toBe('fail');
    const noCertify = { ...file, targets: file.targets.filter((t) => t.tier !== 'certify') };
    const rep = buildReport(checkTargets(noCertify, facts), [sample(games)], RUN);
    expect(rep.gate).toBe('no_certify_rows');
    expect(formatReport(rep)).toMatch(/NOT PASSED/);
  });

  it('runs every row of both real target files on a fixture sample without a fault', () => {
    const plays = [pass('complete', 15, { gameId: 1 }), pass('sack', -6, { gameId: 1, rushers: 5, pressure: true }), run(5, { gameId: 1, boxCount: 7 }), run(2, { gameId: 2, boxCount: 8 })];
    for (const id of ['pro_2026', 'college_2026']) {
      const rep = buildReport(loadTargets(ROOT, id), [sample(games.slice(0, 2), plays.slice(0, 3)), sample(games.slice(2), plays.slice(3))], { ...RUN, seedGroups: 2 });
      expect(rep.rows.length).toBe(rep.counts.rows);
      expect(rep.counts.measured + rep.counts.notMeasurable + rep.counts.missingSource + rep.rows.filter((r) => r.state === 'no_events').length).toBe(rep.counts.rows);
      for (const r of rep.rows) if (r.status !== 'Verified') expect(r.provisional).toBe(true);
      if (id === 'college_2026') expect(rep.gate).toBe('no_certify_rows');
    }
  });
});

describe('chart caller (D-20)', () => {
  const depth = { offense: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], defense: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], kick: [41, 42], return: [51] };
  const caller = (side: 0 | 1 = 0) => createChartCaller({ side, geometry: GEOMETRY, roster: depthRoster(depth), regulationPeriods: 4 });

  it('answers only its own side and is deterministic', () => {
    const c = caller();
    expect(c.decide({ situation: situation(), lastCalled: null, request: request({ side: 1 }) })).toBeNull();
    const a = c.decide({ situation: situation(), lastCalled: null, request: request() });
    const b = caller().decide({ situation: situation(), lastCalled: null, request: request() });
    expect(a).toEqual(b);
    expect(a!.snappingCall!.unit).toBe('offense');
    expect(a!.snappingCall!.players.length).toBe(11);
    expect(a!.actor.kind).toBe('ai');
  });

  it('punts deep in its own end on fourth and long, kicks in range, kneels when leading late', () => {
    const c = caller();
    const punt = c.decide({ situation: situation({ down: 4, distanceYd: 12, ballX: 30 }), lastCalled: null, request: request() });
    expect(punt!.snappingCall).toMatchObject({ unit: 'kick', kickKind: 'punt' });
    const fg = c.decide({ situation: situation({ down: 4, distanceYd: 9, ballX: 85 }), lastCalled: null, request: request() });
    expect(fg!.snappingCall).toMatchObject({ unit: 'kick', kickKind: 'field_goal' });
    const kneel = c.decide({ situation: situation({ period: 4, clockTenths: 900, score: [21, 14] }), lastCalled: null, request: request() });
    expect(kneel!.snappingCall).toMatchObject({ unit: 'offense', kind: 'kneel' });
    const goLate = c.decide({ situation: situation({ period: 4, clockTenths: 900, score: [14, 21], down: 4, distanceYd: 12, ballX: 30 }), lastCalled: null, request: request() });
    expect(goLate!.snappingCall!.unit).toBe('offense');
  });

  it('sends a return unit on kickoffs and a predicted punt, and takes the default on other prompts', () => {
    const d = caller(1);
    const ko = d.decide({ situation: situation({ playKind: 'kickoff', down: null, distanceYd: null }), lastCalled: null, request: request({ type: 'opposing_call', side: 1 }) });
    expect(ko!.opposingCall).toMatchObject({ unit: 'return', returnKind: 'kick_return' });
    const pr = d.decide({ situation: situation({ down: 4, distanceYd: 12, ballX: 30 }), lastCalled: null, request: request({ type: 'opposing_call', side: 1 }) });
    expect(pr!.opposingCall).toMatchObject({ unit: 'return', returnKind: 'punt_return' });
    const df = d.decide({ situation: situation(), lastCalled: null, request: request({ type: 'opposing_call', side: 1 }) });
    expect(df!.opposingCall!.unit).toBe('defense');
    const pen = d.decide({ situation: situation(), lastCalled: null, request: request({ type: 'penalty_choice', side: 1, defaultOptionId: 'accept' }) });
    expect(pen!.optionId).toBe('accept');
    expect(d.decide({ situation: situation(), lastCalled: null, request: request({ type: 'timeout', side: 1 }) })).toBeNull();
  });

  it('every chart parameter is an assumption except the frozen J9.4.1 convention, and names a target row', () => {
    for (const p of PARAMS.params) {
      expect(p.constrainedBy.length).toBeGreaterThan(0);
      if (p.basis === 'bible') expect(p.name).toBe('chart.fourth.kickDistanceAddYd');
    }
  });
});

describe('batch runner (J14.6.1) on fakes', () => {
  it('derives seeds from the master seed and index, splits seed groups, and summarises each game', () => {
    const fakeFlow: Pick<GameFlow, 'simulateGame'> = {
      simulateGame: (input: GameInput) => ({
        final: { score: [input.gameId % 2 ? 21 : 17, 14] } as never,
        events: [{ type: 'game_final', score: [0, 0], tie: false }],
        records: [{ stateHash: `h${input.gameId}` } as unknown as PlayRecord],
        drives: [],
      }),
    };
    const fakeStats: Pick<StatsModule, 'playByPlay' | 'summary'> = {
      playByPlay: () => run(4),
      summary: (_r, _d, f) => summary(1, [f.score[0]!, f.score[1]!], { seedHex: f.seedHex, finalStateHash: f.stateHash }),
    };
    const spec = {
      games: 5, seedGroups: 2, masterSeedHex: '00000000000000aa',
      input: (i: number, seedHex: string) => ({ gameId: i + 1, ruleSetId: 'pro_2026', seedHex } as unknown as GameInput),
      deps: () => ({}) as GameDeps, flow: fakeFlow, stats: fakeStats,
    };
    const res = runBatch(spec);
    expect(res.seeds.length).toBe(5);
    expect(new Set(res.seeds).size).toBe(5);
    expect(res.seeds[3]).toBe(gameSeedHex('00000000000000aa', 3));
    expect(res.groups.map((g) => g.summaries.length)).toEqual([3, 2]);
    expect(res.groups[0]!.summaries[0]!.finalStateHash).toBe('h1');
    expect(runBatch(spec).seeds).toEqual(res.seeds);
  });
});
