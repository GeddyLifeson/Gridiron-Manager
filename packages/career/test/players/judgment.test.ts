// Credibility as the multiplier (plans/head-coach-nuance.md item 5, Q3): respect for the head coach rises from
// calls that were right given what was known, not from lucky results, and that respect scales how cleanly his
// halftime changes are carried out and how soon his staff push back.
import { describe, expect, it } from 'vitest';
import { judgmentStrength, newRecord, respectFromCredibility, roomCredibility, seeJudgment, witnessRead, type RelationshipRecord, type SeenResult } from '../../src/players/index.ts';
import { uptake, type UptakeInput } from '../../src/gameday/halftime.ts';
import { objectionThreshold } from '../../src/staff/manage.ts';
import { stream } from '../gameday/fixtures.ts';

const D = (dayIndex: number) => ({ seasonYear: 2030, dayIndex });
const FACETS = { ego: 50, competitiveness: 50, coachability: 50, loyalty: 50 };

/** A season of visible calls: `edge` is the true WP edge of each call, `workRate` how often it worked anyway. */
function season(edge: number, workRate: number, knowledge: number, witnesses: number, seed: number): number {
  const rng = stream(seed);
  let total = 0;
  for (let w = 0; w < witnesses; w++) {
    let r: RelationshipRecord = newRecord({ holderId: 100 + w, aboutId: 1, coachPlayerRegard: 0, season: 2030 });
    const start = r.respect;
    for (let c = 0; c < 68; c++) {
      const result: SeenResult = rng() < workRate ? 'worked' : 'failed';
      r = seeJudgment(r, { edgeWp: edge + (rng() - 0.5), result, knowledge, draw: rng() }, D(c * 2), FACETS).record;
    }
    total += r.respect - start;
  }
  return total / witnesses;
}

describe('respect from judgment the witness saw', () => {
  it('a coach who loses with good calls gains more respect over a season than one who wins with bad calls, with staff and with players', () => {
    for (const knowledge of [0.85, 0.3]) {
      const goodUnlucky = season(1.5, 0.4, knowledge, 40, 11);
      const badLucky = season(-1.5, 0.6, knowledge, 40, 11);
      expect(goodUnlucky).toBeGreaterThan(0);
      expect(badLucky).toBeLessThan(0);
      expect(goodUnlucky).toBeGreaterThan(badLucky);
    }
  });

  it('a knowing witness reads a call closer to the truth than one who knows little', () => {
    const rng = stream(3);
    let errHigh = 0, errLow = 0;
    for (let i = 0; i < 2000; i++) {
      const d = rng();
      errHigh += Math.abs(witnessRead({ edgeWp: 2, knowledge: 0.9, draw: d }) - 2);
      errLow += Math.abs(witnessRead({ edgeWp: 2, knowledge: 0.1, draw: d }) - 2);
    }
    expect(errHigh).toBeLessThan(errLow / 3);
  });

  it('a lucky bad call costs respect with a coordinator who reads it right; a witness who knows little leans more on the result', () => {
    const knowing = judgmentStrength({ edgeWp: -3, result: 'worked', knowledge: 1, draw: 0.5 });
    const novice = judgmentStrength({ edgeWp: -3, result: 'worked', knowledge: 0, draw: 0.5 });
    expect(knowing).toBeLessThan(0);
    expect(novice).toBeGreaterThan(knowing);
  });

  it('moves respect only (event judgment_seen), and replays the same', () => {
    const r = newRecord({ holderId: 2, aboutId: 1, coachPlayerRegard: 0, season: 2030 });
    const j = { edgeWp: 2.5, result: 'worked' as const, knowledge: 0.7, draw: 0.42 };
    const a = seeJudgment(r, j, D(5), FACETS);
    expect(a.moved.trust).toBe(0);
    expect(a.moved.roleBelief).toBe(0);
    expect(a.moved.respect).toBeGreaterThan(0);
    expect(seeJudgment(r, j, D(5), FACETS)).toEqual(a);
  });
});

describe('respect as the multiplier', () => {
  const base: UptakeInput = {
    start: 'repoint', weeklyKnowledge: 0, longTermKnowledge: 0, teacher: { kind: 'user', methodFits: true, namesTrueCause: false },
    sawPictures: false, structuralInMeeting: 0, structuralLimit: 2, cut: 'none', seriesUsed: 0, roadCrowdNoise: false, heardIt: true,
  };

  it('a halftime change from a coach the player respects is carried out more cleanly; no respect given, no term', () => {
    const low = uptake({ ...base, respect: 20 }), mid = uptake({ ...base, respect: 50 }), high = uptake({ ...base, respect: 85 });
    expect(mid).toBe(uptake(base));
    expect(high).toBeGreaterThan(mid);
    expect(low).toBeLessThan(mid);
  });

  it('a coordinator objects sooner to a head coach he does not yet believe in; no respect given, no term', () => {
    const h = { outcomes: [], weeksSinceAnyObjection: 0 };
    expect(objectionThreshold(50, h, 50)).toBe(objectionThreshold(50, h));
    expect(objectionThreshold(50, h, 20)).toBeLessThan(objectionThreshold(50, h, 80));
  });

  it("the room's credibility for a talk is its mean respect; a talk's credibility change maps to respect points", () => {
    expect(roomCredibility([])).toBe(0.5);
    expect(roomCredibility([{ respect: 40 }, { respect: 80 }])).toBeCloseTo(0.6, 12);
    expect(respectFromCredibility(-0.02)).toBeCloseTo(-2, 12);
  });
});
