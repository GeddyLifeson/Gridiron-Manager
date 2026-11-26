import { describe, expect, it } from 'vitest';
import {
  classify, evaluateOptions, halfWidth, noModelView, playCallTruth, scoreGameManagement, scorePlayCall,
} from '../../src/decisions/model-view.ts';
import { PARAMS, param } from '../../src/decisions/params.ts';
import { captureInformation } from '../../src/decisions/information.ts';
import type { Estimate } from '../../src/decisions/types.ts';

const est = (value: number, half: number, sparse = false): Estimate => ({ value, se: half / param('rangeSe'), sparse });

describe('N3.3.1 game-management view', () => {
  it('reproduces the bible example: go 61 (58 to 64), field goal 57 (54 to 60), kicked is within the margin', () => {
    const r = scoreGameManagement({
      modelId: 'wp.test',
      chosen: 'field_goal',
      information: [],
      options: [
        { optionId: 'go', staff: est(0.61, 0.03), truth: est(0.6, 0.03) },
        { optionId: 'field_goal', staff: est(0.57, 0.03), truth: est(0.58, 0.03) },
      ],
    });
    const go = r.view.options.find((o) => o.optionId === 'go')!;
    expect(go.low).toBeCloseTo(0.58, 10);
    expect(go.high).toBeCloseTo(0.64, 10);
    expect(r.view.best).toBe('go');
    expect(r.view.cost).toBeCloseTo(0.04, 10);
    expect(r.view.margin).toBeCloseTo(0.06, 10);
    expect(r.view.class).toBe('toss_up');
    expect(r.truth.kind).toBe('game_management');
  });

  it('matches a 200-situation hand table and never classes a decision inside the range clearly wrong', () => {
    // Hand rule, written independently of classify(): wrong only when the chosen high end is below the best
    // low end (ranges do not touch); right only when the chosen low end is above every other high end.
    let n = 0;
    for (let bestTenths = 30; bestTenths <= 70; bestTenths += 10) {
      for (let gapHund = 0; gapHund < 10; gapHund++) {
        for (let half = 1; half <= 4; half++) {
          for (const choseBest of [true, false]) {
            const hi = bestTenths / 100, lo = hi - gapHund / 100, h = half / 100;
            const opts = [{ optionId: 'x', est: est(hi, h) }, { optionId: 'y', est: est(lo, h) }];
            const chosen = choseBest ? 'x' : 'y';
            const c = classify(opts, chosen);
            const ch = choseBest ? hi : lo, other = choseBest ? lo : hi;
            const expected = gapHund === 0 ? 'toss_up'
              : choseBest ? (ch - h > other + h + 1e-12 ? 'clearly_right' : 'toss_up')
              : (ch + h < other - h - 1e-12 ? 'clearly_wrong' : 'toss_up');
            // Exact boundary (gap equals the combined range) is inside the range: never wrong.
            if (Math.abs(gapHund / 100 - 2 * h) < 1e-12) expect(c.class).not.toBe('clearly_wrong');
            else expect(c.class).toBe(expected);
            n++;
          }
        }
      }
    }
    expect(n).toBe(400);
  });

  it('never classes a sparse state clearly wrong and widens its range', () => {
    const c = classify([{ optionId: 'x', est: est(0.9, 0.01, true) }, { optionId: 'y', est: est(0.2, 0.01) }], 'y');
    expect(c.class).toBe('toss_up');
    expect(halfWidth(est(0.5, 0.01, true))).toBe(param('sparseMinHalfWidth'));
  });

  it('carries model-lacks notes from the information set (rule 4)', () => {
    const info = captureInformation([{ source: 'medical.kicker', visibility: 'own_team', modelLacks: 'lacks.kicker_injured' }], { 'medical.kicker': { status: 'questionable' } }, new Set());
    const r = scoreGameManagement({ modelId: 'm', chosen: 'a', information: info, options: [{ optionId: 'a', staff: est(0.5, 0.01), truth: est(0.5, 0.01) }, { optionId: 'b', staff: est(0.4, 0.01), truth: est(0.4, 0.01) }] });
    expect(r.view.lacks).toEqual(['lacks.kicker_injured']);
    expect(r.view.class).toBe('clearly_right');
  });

  it('evaluates staff and truth chances through the injected G-07 evaluator', () => {
    const table: Record<string, { value: number; se: number }> = { s1: { value: 0.6, se: 0.01 }, t1: { value: 0.7, se: 0.01 }, s2: { value: 0.5, se: 0.01 }, t2: { value: 0.4, se: 0.01 } };
    const ev = evaluateOptions([{ optionId: 'go', staffOutcomes: 's1', truthOutcomes: 't1' }, { optionId: 'punt', staffOutcomes: 's2', truthOutcomes: 't2', sparse: true }], (k: string) => table[k]!);
    expect(ev[0]!.staff.value).toBe(0.6);
    expect(ev[0]!.truth.value).toBe(0.7);
    expect(ev[1]!.staff.sparse).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(() => classify([{ optionId: 'x', est: est(0.5, 0.01) }], 'x')).toThrow();
    expect(() => classify([{ optionId: 'x', est: est(0.5, 0.01) }, { optionId: 'y', est: est(0.5, 0.01) }], 'z')).toThrow();
    expect(() => scoreGameManagement({ modelId: 'm', chosen: 'x', information: [], options: [{ optionId: 'x', staff: est(1.2, 0.01), truth: est(0.5, 0.01) }, { optionId: 'y', staff: est(0.5, 0.01), truth: est(0.5, 0.01) }] })).toThrow();
  });
});

describe('N3.3.2 play-call view', () => {
  const mix = [{ look: 'cover3', probability: 0.6, sample: 300 }, { look: 'cover1', probability: 0.4, sample: 200 }];
  const staff = (c: string, l: string) => (c === 'mesh' ? (l === 'cover3' ? 0.2 : -0.1) : 0);
  it('foresight is the mix average and ignores the true call', () => {
    const v = scorePlayCall({ modelId: 't', concept: 'mesh', scoutedMix: mix, staffTable: staff, predictability: 0.35 });
    expect(v.foresight).toBeCloseTo(0.6 * 0.2 + 0.4 * -0.1, 12);
    expect(v.foresightSample).toBe(500);
    const engine = (c: string, l: string) => staff(c, l) + 0.05;
    const t1 = playCallTruth({ concept: 'mesh', scoutedMix: mix, actualLook: 'cover3', engineTable: engine });
    const t2 = playCallTruth({ concept: 'mesh', scoutedMix: mix, actualLook: 'cover1', engineTable: engine });
    // Swapping the opponent's actual call changes hindsight only.
    expect(t1.kind === 'play_call' && t2.kind === 'play_call' && t1.hindsight !== t2.hindsight).toBe(true);
    expect(scorePlayCall({ modelId: 't', concept: 'mesh', scoutedMix: mix, staffTable: staff, predictability: 0.35 })).toEqual(v);
  });
  it('rejects a mix that does not sum to 1 and a predictability outside 0 to 1', () => {
    expect(() => scorePlayCall({ modelId: 't', concept: 'mesh', scoutedMix: [{ look: 'a', probability: 0.5, sample: 1 }], staffTable: staff, predictability: 0.1 })).toThrow();
    expect(() => scorePlayCall({ modelId: 't', concept: 'mesh', scoutedMix: mix, staffTable: staff, predictability: 1.1 })).toThrow();
  });
});

describe('N3.3.3 no-model view', () => {
  it('schedules checks at 4 weeks and at the end of the season', () => {
    expect(noModelView('2027-10-03', '2028-01-09').followUps).toEqual(['2027-10-31', '2028-01-09']);
    expect(noModelView('2027-12-30', '2028-01-09').followUps).toEqual(['2028-01-09', '2028-01-27']);
    expect(noModelView('2027-10-03', null).followUps).toEqual(['2027-10-31']);
  });
});

describe('params', () => {
  it('every parameter names a basis and sits inside its bounds', () => {
    for (const p of PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
      expect(['bible', 'assumption']).toContain(p.basis);
    }
  });
});
