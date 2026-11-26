// C3.2 acceptance: one case per tiebreak step, each built so every earlier step is level, resolved at
// the intended step (C3.2.1, C3.2.2), plus the multi-club procedure and its restarts (C3.2.3).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Ledger, LISTS, Tiebreaker, decidingStep, type StepId, type TeamId, type TieDraw } from '../../src/standings/index.ts';
import { Games, PRO_RULES, fixedDraw, proLeague } from './fixture.ts';

const LEAGUE = proLeague();

function decide(g: Games, clubs: TeamId[], draw: TieDraw = fixedDraw(), rules = PRO_RULES, divisionOrder?: Map<TeamId, number>) {
  const tb = new Tiebreaker(new Ledger(LEAGUE, g.list, rules), rules, draw, divisionOrder ? { divisionOrder } : {});
  const winner = tb.pickBest(clubs, 'conference');
  return { winner, log: tb.log, step: decidingStep(tb.log, winner)?.step };
}

/** Split season series with mirror scores: every earlier step stays level. */
function split(g: Games, a: TeamId, b: TeamId): Games { return g.add(a, b, 20, 10).add(b, a, 20, 10); }

describe('published step lists (research 3a to 3f)', () => {
  it('division list has 12 steps in the published order', () => {
    expect(LISTS.division).toEqual(['head_to_head', 'division_pct', 'common_pct', 'conference_pct', 'strength_of_victory', 'strength_of_schedule',
      'conference_points_rank', 'league_points_rank', 'common_net_points', 'net_points', 'net_touchdowns', 'coin_toss']);
  });
  it('two-club wild-card list has 11 steps in the published order', () => {
    expect(LISTS.wildcard_two).toEqual(['head_to_head', 'conference_pct', 'common_pct_min', 'strength_of_victory', 'strength_of_schedule',
      'conference_points_rank', 'league_points_rank', 'conference_net_points', 'net_points', 'net_touchdowns', 'coin_toss']);
  });
  it('multi-club wild-card list has 12 steps, one club per division first, then the sweep', () => {
    expect(LISTS.wildcard_multi.slice(0, 2)).toEqual(['one_per_division', 'head_to_head_sweep']);
    expect(LISTS.wildcard_multi.slice(2)).toEqual(LISTS.wildcard_two.slice(1));
  });
  it('interconference draft list (3f B i)', () => {
    expect(LISTS.interconference).toEqual(['head_to_head', 'common_pct_min', 'strength_of_victory', 'league_points_rank', 'net_points', 'net_touchdowns', 'coin_toss']);
  });
});

// Division clubs A = 1 and B = 2 (division 11, rivals 3 and 4). 5 to 16 are conference 1, 17 up conference 2.
const A = 1, B = 2;
describe('C3.2.1 two clubs in the same division: one case per step', () => {
  const cases: { step: StepId; build: (g: Games) => void; winner: TeamId; draw?: TieDraw }[] = [
    { step: 'head_to_head', winner: A, build: (g) => g.add(A, B, 20, 10) },
    { step: 'division_pct', winner: A, build: (g) => { split(g, A, B); g.add(A, 3, 20, 10).add(3, B, 20, 10); } },
    { step: 'common_pct', winner: A, build: (g) => { split(g, A, B); g.add(A, 5, 20, 10).add(5, B, 20, 10); } },
    { step: 'conference_pct', winner: A, build: (g) => { split(g, A, B); g.add(A, 5, 20, 10).add(6, B, 20, 10); } },
    { step: 'strength_of_victory', winner: A, build: (g) => { split(g, A, B); g.add(A, 17, 20, 10).add(B, 18, 20, 10).add(17, 19, 20, 10); } },
    { step: 'strength_of_schedule', winner: A, build: (g) => { split(g, A, B); g.add(17, A, 20, 10).add(18, B, 20, 10).add(17, 19, 20, 10); } },
    { step: 'conference_points_rank', winner: A, build: (g) => { split(g, A, B); g.add(A, 17, 30, 0).add(B, 18, 20, 0); } },
    { step: 'league_points_rank', winner: B, build: (g) => { split(g, A, B); g.add(A, 17, 35, 10).add(B, 18, 20, 0); } },
    { step: 'common_net_points', winner: A, build: (g) => { split(g, A, B); g.add(A, 17, 30, 10).add(B, 17, 10, 0); } },
    { step: 'net_points', winner: B, build: (g) => { split(g, A, B); g.add(A, 17, 25, 10).add(B, 18, 20, 0); } },
    { step: 'net_touchdowns', winner: A, build: (g) => { g.add(A, B, 21, 20, { touchdowns: [3, 2] }).add(B, A, 21, 20, { touchdowns: [0, 2] }); } },
    { step: 'coin_toss', winner: B, draw: fixedDraw([B]), build: (g) => { g.add(A, B, 21, 20, { touchdowns: [3, 2] }).add(B, A, 21, 20, { touchdowns: [3, 2] }); } },
  ];
  for (const c of cases) {
    it(`step ${LISTS.division.indexOf(c.step) + 1}: ${c.step}`, () => {
      const g = new Games(); c.build(g);
      const r = decide(g, [A, B], c.draw);
      expect(r.step).toBe(c.step);
      expect(r.winner).toBe(c.winner);
      expect(decide(g, [B, A], c.draw).winner).toBe(c.winner);
    });
  }
  it('forfeit points are left out of points steps (Rule 11-1-1)', () => {
    // Without the forfeit flag A would win on points rank; with it the clubs are level until the coin toss.
    const g = new Games();
    g.add(A, B, 21, 20, { touchdowns: [3, 2] }).add(B, A, 21, 20, { touchdowns: [3, 2] }).add(A, 17, 2, 0, { forfeit: true, touchdowns: [0, 0] }).add(B, 18, 2, 0, { forfeit: true, touchdowns: [0, 0] });
    expect(decide(g, [A, B], fixedDraw([B])).step).toBe('coin_toss');
  });
});

// Wild-card clubs from different divisions of conference 1: A = 1 (division 11), E = 5 (division 12).
const E = 5;
describe('C3.2.2 two clubs in different divisions: one case per step', () => {
  const cases: { step: StepId; build: (g: Games) => void; winner: TeamId; draw?: TieDraw }[] = [
    { step: 'head_to_head', winner: A, build: (g) => g.add(A, E, 20, 10) },
    { step: 'conference_pct', winner: A, build: (g) => g.add(A, 6, 20, 10).add(7, E, 20, 10) },
    { step: 'common_pct_min', winner: A, build: (g) => {
      for (const o of [17, 18, 19]) g.add(A, o, 20, 10);
      g.add(20, A, 20, 10);
      g.add(E, 17, 20, 10).add(E, 18, 20, 10).add(19, E, 20, 10).add(20, E, 20, 10);
    } },
    { step: 'strength_of_victory', winner: A, build: (g) => g.add(A, 17, 20, 10).add(E, 18, 20, 10).add(17, 19, 20, 10) },
    { step: 'strength_of_schedule', winner: A, build: (g) => g.add(17, A, 20, 10).add(18, E, 20, 10).add(17, 19, 20, 10).add(19, 18, 20, 10) },
    { step: 'conference_points_rank', winner: A, build: (g) => g.add(A, 17, 30, 0).add(E, 18, 20, 0) },
    { step: 'league_points_rank', winner: E, build: (g) => g.add(A, 17, 30, 14).add(E, 18, 21, 7).add(19, 20, 10, 0) },
    { step: 'conference_net_points', winner: A, build: (g) => g.add(A, 6, 28, 10).add(E, 2, 21, 7) },
    { step: 'net_points', winner: A, build: (g) => g.add(A, 6, 28, 10).add(E, 2, 24, 6).add(A, 17, 40, 0).add(E, 18, 30, 0) },
    { step: 'net_touchdowns', winner: A, build: (g) => g.add(A, 6, 21, 20, { touchdowns: [3, 2] }).add(E, 2, 21, 20, { touchdowns: [1, 2] }) },
    { step: 'coin_toss', winner: E, draw: fixedDraw([E]), build: (g) => g.add(A, 6, 21, 20).add(E, 2, 21, 20) },
  ];
  for (const c of cases) {
    it(`step ${LISTS.wildcard_two.indexOf(c.step) + 1}: ${c.step}`, () => {
      const g = new Games(); c.build(g);
      const r = decide(g, [A, E], c.draw);
      expect(r.log[r.log.length - 1]!.list).toBe('wildcard_two');
      expect(r.step).toBe(c.step);
      expect(r.winner).toBe(c.winner);
      expect(decide(g, [E, A], c.draw).winner).toBe(c.winner);
    });
  }
  it('common games below the minimum of four are skipped', () => {
    const g = new Games();
    for (const o of [17, 18, 19]) g.add(A, o, 20, 10);
    g.add(E, 17, 20, 10).add(E, 18, 20, 10).add(19, E, 20, 10);
    const r = decide(g, [A, E]);
    expect(r.step).toBe('strength_of_victory');
    expect(r.log.some((x) => x.step === 'common_pct_min')).toBe(false);
  });
  it('two clubs of one division use the division list even for a wild-card spot (C3.2.2 edge case)', () => {
    const g = new Games(); split(g, A, B); g.add(A, 3, 20, 10).add(3, B, 20, 10);
    const r = decide(g, [A, B]);
    expect(r.log[r.log.length - 1]!.list).toBe('division');
    expect(r.step).toBe('division_pct');
  });
});

describe('C3.2.3 three or more clubs', () => {
  it('same division: circular head-to-head moves to the next step for all three', () => {
    const g = new Games();
    g.add(A, B, 20, 10).add(B, 3, 20, 10).add(3, A, 20, 10).add(A, 4, 20, 10);
    const r = decide(g, [A, B, 3]);
    expect(r.winner).toBe(A);
    expect(r.step).toBe('division_pct');
  });
  it('same division: a step that removes one and leaves two restarts at step 1 of the two-club list', () => {
    const g = new Games();
    g.add(A, B, 20, 10).add(B, 3, 20, 10).add(3, A, 20, 10); // circle: level on head-to-head among three
    g.add(A, 4, 20, 10).add(B, 4, 20, 10).add(4, 3, 20, 10); // division record removes 3
    const r = decide(g, [A, B, 3]);
    expect(r.log[0]).toMatchObject({ step: 'division_pct', removed: [3], advanced: null });
    expect(r.step).toBe('head_to_head');
    expect(r.winner).toBe(A);
  });
  it('same division: a fourth club removed leaves three, which restart at step 1 (restart_on_three) or go on (continue_on_three)', () => {
    const g = new Games();
    const four = [1, 2, 3, 4];
    for (const x of four) for (const y of four) if (x < y) split(g, x, y);
    for (const x of [1, 2, 3]) g.add(x, 5, 20, 10);
    g.add(5, 4, 20, 10);
    g.add(1, 7, 20, 10).add(7, 2, 20, 10).add(7, 3, 20, 10);
    const restart = decide(g, four);
    expect(restart.log[0]).toMatchObject({ step: 'common_pct', removed: [4] });
    expect(restart.winner).toBe(1);
    expect(restart.step).toBe('common_pct'); // common opponents widened to 5 and 7 once club 4 left
    const cont = decide(g, four, fixedDraw(), { ...PRO_RULES, 'tiebreak.restarts': 'continue_on_three' });
    expect(cont.winner).toBe(1);
    expect(cont.step).toBe('conference_pct');
  });
  it('wild card: one club per division first, keeping the division order, then the head-to-head sweep', () => {
    const g = new Games();
    g.add(5, 2, 20, 10).add(5, 9, 20, 10);
    const order = new Map<TeamId, number>([[2, 0], [1, 1], [5, 0], [9, 0]]);
    const r = decide(g, [1, 2, 5, 9], fixedDraw(), PRO_RULES, order);
    expect(r.log[0]).toMatchObject({ step: 'one_per_division', removed: [1] });
    expect(r.step).toBe('head_to_head_sweep');
    expect(r.winner).toBe(5);
  });
  it('wild card: a club that lost to every other is removed by the sweep, and the two left restart at step 1', () => {
    const g = new Games();
    g.add(1, 9, 20, 10).add(5, 9, 20, 10); // 9 lost to each other club
    g.add(5, 17, 20, 10).add(18, 1, 20, 10); // 1 and 5 never met; 5 better in nothing yet
    g.add(5, 6, 20, 10).add(1, 2, 10, 20); // conference record: 5 ahead
    const r = decide(g, [1, 5, 9]);
    expect(r.log[0]).toMatchObject({ step: 'head_to_head_sweep', removed: [9] });
    expect(r.log[r.log.length - 1]!.list).toBe('wildcard_two');
    expect(r.winner).toBe(5);
    expect(r.step).toBe('conference_pct');
  });
  it('wild card: a step that removes one of three across divisions restarts at step 1 of the two-club list (head-to-head)', () => {
    const g = new Games();
    g.add(1, 5, 20, 10); // 1 beat 5; 9 met neither, so no sweep
    g.add(1, 6, 20, 10).add(5, 10, 20, 10).add(11, 9, 20, 10); // conference: 1 2-0, 5 1-1, 9 0-1
    g.add(5, 12, 20, 10); // 5 now 2-1 in conference
    const r = decide(g, [1, 5, 9]);
    expect(r.winner).toBe(1);
  });

  it('property: the order is total, repeatable, and never puts a club above a division rival that beat it in a clean two-club tie', () => {
    const clubs = [1, 2, 3, 4, 5, 6];
    const pairs: [number, number][] = [];
    for (const x of clubs) for (const y of clubs) if (x < y) pairs.push([x, y]);
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 2 }), { minLength: pairs.length, maxLength: pairs.length }), fc.integer(), (outcomes, seed) => {
      const g = new Games();
      pairs.forEach(([x, y], i) => { const o = outcomes[i]!; g.add(x, y, o === 0 ? 20 : o === 1 ? 10 : 17, o === 0 ? 10 : o === 1 ? 20 : 17); });
      const ledger = new Ledger(LEAGUE, g.list, PRO_RULES);
      const draw = fixedDraw([Math.abs(seed % 6) + 1]);
      const run = () => new Tiebreaker(ledger, PRO_RULES, draw).orderByPct(clubs, 'conference');
      const order = run();
      expect([...order].sort()).toEqual(clubs);
      expect(run()).toEqual(order);
      for (const x of [1, 2, 3, 4]) for (const y of [1, 2, 3, 4]) {
        if (x === y || ledger.pct(x) !== ledger.pct(y)) continue;
        if (clubs.some((z) => z !== x && z !== y && ledger.pct(z) === ledger.pct(x))) continue;
        const h2h = ledger.recordWhere(x, (gm) => gm.opp === y);
        if (h2h.w > h2h.l) expect(order.indexOf(x)).toBeLessThan(order.indexOf(y));
      }
    }), { numRuns: 300 });
  });
});
