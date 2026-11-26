// G8.1.1, H2.2.1 and N2.3.1: tendency tables, bands, the strength mark and the shared store.
import { describe, expect, it } from 'vitest';
import { ParamFile } from '@gm/schema';
import { stream, seedFromNumber } from '@gm/engine-core';
import { tendencyTable, highlighted, wilson, effectiveN, chartOpponent, PERFECT_TAGGER, PARAMS, RULE_KEYS, downDistance, type ChartedPlay } from '../../src/tendencies/index.ts';
import { play, split, defense } from './helpers.ts';

const cell = (plays: ChartedPlay[]) => {
  const cells = tendencyTable(plays, { cuts: ['formation'], measure: 'runPass' });
  expect(cells).toHaveLength(1);
  return cells[0]!;
};

describe('params', () => {
  it('parse as a ParamFile and declare no rule keys', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(RULE_KEYS).toEqual([]);
  });
});

describe('G8.1.1 own-call tendency tables', () => {
  it('acceptance: 18 of 20 runs from one formation over three games shows as strong', () => {
    const c = cell(split(18, 2));
    expect(c.band).toBe('strong');
    expect(c.bandOutcome).toBe('run');
    expect(new Set(split(18, 2).map((p) => p.gameId)).size).toBe(3);
  });
  it('acceptance: 7 of 10 shows as watch, 13 of 20 as lean, 4 of 4 as counts only', () => {
    expect(cell(split(7, 3)).band).toBe('watch');
    expect(cell(split(13, 7)).band).toBe('lean');
    const four = cell(split(4, 0));
    expect(four.band).toBeNull();
    expect(four.countsOnly).toBe(true);
    expect(four.outcomes[0]!.rate).toBeNull();
    expect(four.outcomes[0]!.count).toBe(4);
  });
  it('a 50 to 50 split is not highlighted, and the pass side of a 2-of-20 run cell is the strong outcome', () => {
    expect(cell(split(10, 10)).band).toBeNull();
    const c = cell(split(2, 18));
    expect(c.band).toBe('strong');
    expect(c.bandOutcome).toBe('pass');
  });
  it('acceptance: every cell equals a direct count from the call log, and no rate appears without its count', () => {
    const s = stream(seedFromNumber(66), 'test.tendencies', []);
    const plays: ChartedPlay[] = [];
    for (let i = 0; i < 400; i++) {
      const down = 1 + s.int(0, 3);
      plays.push(play({ down, distanceYd: down === 1 ? 10 : 1 + s.int(0, 12), formation: ['a', 'b', 'c'][s.int(0, 2)]!, personnel: ['11', '12'][s.int(0, 1)]!, playKind: s.chance(0.45) ? 'run' : 'dropback_pass', gameId: 1 + s.int(0, 5) }));
    }
    const cells = tendencyTable(plays, { cuts: ['downDistance', 'formation', 'personnel'], measure: 'runPass' });
    for (const c of cells) {
      const direct = plays.filter((p) => downDistance(p) === c.cuts.downDistance && p.formation === c.cuts.formation && p.personnel === c.cuts.personnel);
      expect(c.calls).toBe(direct.length);
      expect(c.refs.length).toBe(direct.length);
      for (const o of c.outcomes) {
        const k = direct.filter((p) => (o.outcome === 'run' ? p.playKind === 'run' : p.playKind !== 'run')).length;
        expect(o.count).toBe(k);
        if (o.rate !== null) expect(o.count).toBeGreaterThan(0);
      }
    }
    expect(cells.reduce((a, c) => a + c.calls, 0)).toBe(plays.length);
  });
  it('kneels, spikes and cancelled plays are left out of call tendencies (H2.1.2 edge case)', () => {
    const c = cell([...split(6, 0), play({ playKind: 'kneel', forced: true }), play({ lookOnly: true })]);
    expect(c.calls).toBe(6);
  });
  it('edge case: calls by a delegated coordinator can be filtered by caller', () => {
    const rows = [...split(10, 0, { callerId: 7 }), ...split(0, 10, { callerId: 8 })];
    expect(tendencyTable(rows, { cuts: ['formation'], measure: 'runPass', callerIds: [8] })[0]!.bandOutcome).toBe('pass');
  });
  it('multi-outcome strong line: one outcome at 1.5 times its league share and at least 60%', () => {
    const rows = Array.from({ length: 30 }, (_, i) => defense({ coverageFamily: i < 27 ? 'cover1' : 'cover3' }));
    const strong = tendencyTable(rows, { cuts: ['front'], measure: 'coverage', league: () => 0.3 })[0]!;
    expect(strong.band).toBe('strong');
    expect(strong.bandOutcome).toBe('cover1');
    // Same split, league share 0.7: the line is 1.05, so nothing is strong.
    expect(tendencyTable(rows, { cuts: ['front'], measure: 'coverage', league: () => 0.7 })[0]!.band).toBeNull();
  });
  it('highlighted cells come strongest first', () => {
    const rows = [...split(18, 2, { formation: 'a' }), ...split(7, 3, { formation: 'b' }), ...split(5, 5, { formation: 'c' })];
    expect(highlighted(tendencyTable(rows, { cuts: ['formation'], measure: 'runPass' })).map((c) => c.cuts.formation)).toEqual(['a', 'b']);
  });
});

describe('H2.2.1 tendency tables', () => {
  it('acceptance: rate, n_eff and interval equal hand-computed values', () => {
    const rows = [
      ...[1, 1, 1, 0.7, 0.7].map((w) => play({ playKind: 'run', weight: w })),
      ...[1, 0.4, 0.4].map((w) => play({ playKind: 'dropback_pass', runDirection: null, weight: w })),
    ];
    const c = cell(rows);
    const W = 1 + 1 + 1 + 0.7 + 0.7 + 1 + 0.4 + 0.4;
    const W2 = 1 + 1 + 1 + 0.49 + 0.49 + 1 + 0.16 + 0.16;
    expect(c.nEff).toBeCloseTo((W * W) / W2, 12);
    const run = c.outcomes.find((o) => o.outcome === 'run')!;
    const p = 4.4 / W;
    expect(run.rate).toBeCloseTo(p, 12);
    // 90% Wilson by hand.
    const n = (W * W) / W2, z = 1.6448536269514722;
    const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
    expect(run.low).toBeCloseTo(centre - half, 12);
    expect(run.high).toBeCloseTo(centre + half, 12);
  });
  it('acceptance: thin rows are marked at n_eff under 8', () => {
    expect(cell(split(4, 3)).thin).toBe(true);
    expect(cell(split(5, 3)).thin).toBe(false);
  });
  it('the interval helpers behave at the edges', () => {
    expect(effectiveN([])).toBe(0);
    expect(effectiveN([2, 2, 2])).toBe(3);
    expect(wilson(0.5, 0, 1.64)).toEqual({ low: 0, high: 1 });
  });
  it('shows the league rate beside the team rate and never mixes it in (rule 5)', () => {
    const c = tendencyTable(split(6, 4), { cuts: ['formation'], measure: 'runPass', league: (_k, o) => (o === 'run' ? 0.42 : 0.58) })[0]!;
    const run = c.outcomes.find((o) => o.outcome === 'run')!;
    expect(run.rate).toBeCloseTo(0.6, 12);
    expect(run.leagueRate).toBe(0.42);
  });
});

describe('N2.3.1 shared tendency store', () => {
  it('strength mark: strong past 15 points with 12 plays, lean past 8 points with 8 plays', () => {
    // Team overall 50% run; formation a runs 11 of 12 (+42 points), b 5 of 8 (+12.5 points against 50%).
    const rows = [...split(11, 1, { formation: 'a' }), ...split(5, 3, { formation: 'b' }), ...split(0, 16, { formation: 'c' })];
    const cells = tendencyTable(rows, { cuts: ['formation'], measure: 'runPass' });
    const by = Object.fromEntries(cells.map((c) => [c.cuts.formation, c]));
    expect(by.a!.mark).toBe('strong');
    expect(by.b!.mark).toBe('lean');
    expect(by.c!.mark).toBe('strong');
    expect(by.c!.markOutcome).toBe('pass');
  });
  it('acceptance: the same query on the own team and from an opponent returns identical counts at zero charter error', () => {
    const own = [...split(9, 4), ...Array.from({ length: 12 }, () => defense({ coverageFamily: 'cover4' }))];
    const charted = chartOpponent(own, { tagger: PERFECT_TAGGER, disguise: () => 0 }, stream(seedFromNumber(1), 'test.chart', []));
    for (const q of [{ cuts: ['formation'], measure: 'runPass' }, { cuts: ['front'], measure: 'coverage' }] as const) {
      const a = tendencyTable(own, q).map((c) => [c.key, c.outcomes.map((o) => [o.outcome, o.count])]);
      const b = tendencyTable(charted, q).map((c) => [c.key, c.outcomes.map((o) => [o.outcome, o.count])]);
      expect(b).toEqual(a);
    }
  });
});
