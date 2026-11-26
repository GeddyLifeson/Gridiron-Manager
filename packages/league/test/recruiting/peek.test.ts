// February 10, 2026 sits in the FBS dead period (February 2 to March 1 in the sourced calendar, PR 254).
// peekBreaches / peekAct (read models): the same rules as breachesOf without changing the state; and the
// date of the latest look kept on the board grade (MA-48).
import { describe, expect, it } from 'vitest';
import { breachesOf, generateClass, peekAct, peekBreaches, takeLook, findTie, type ActRef } from '../../src/recruiting/index.ts';
import { D, circleIds, context, factory, freshState, hook, makePrograms } from './fixtures.ts';

function setup() {
  const programs = makePrograms(6);
  const { ctx } = context(programs);
  const state = freshState();
  const req = { classYear: 2027, programs: 6, topPrograms: 6, favourites: programs.map((p) => ({ teamId: p.teamId, weight: p.prestige })), advisersAllowed: true };
  const made = generateClass(state, req, factory(), circleIds(), ctx.rng);
  return { ctx, state, id: made[0]!.personId };
}

describe('peekBreaches', () => {
  it('lists the same rules as breachesOf and leaves the state as it was', () => {
    const { ctx, state, id } = setup();
    const acts: ActRef[] = ([['contact_off_campus', D('2026-02-10')], ['call', D('2026-09-10')], ['evaluation', D('2026-12-20')]] as const)
      .map(([kind, day]) => ({ kind, teamId: 1, staffId: 101, prospectId: id, day }));
    const before = JSON.stringify(state);
    const peeked = acts.map((a) => peekBreaches(state, ctx, a).map((b) => b.rule));
    const viaAct = acts.map((a) => peekAct(state, ctx, a, hook().party(101, 1)).breaches.map((b) => b.rule));
    expect(JSON.stringify(state)).toBe(before);
    expect(findTie(state, id, 1)).toBeUndefined();
    expect(viaAct).toEqual(peeked);
    expect(peeked[0]).toContain('contact_out_of_period');
    // breachesOf creates the tie and rolls the week; each act is checked on a fresh state so earlier ones do not count.
    acts.forEach((a, i) => { const s2 = setup(); expect(breachesOf(s2.state, s2.ctx, { ...a, prospectId: s2.id }).map((b) => b.rule)).toEqual(peeked[i]); });
  });
});

describe('BoardGrade.lastLookDay', () => {
  it('is the day of the latest look', () => {
    const { ctx, state, id } = setup();
    takeLook(state, ctx, 1, id, 'full_film', D('2026-03-02'), { skill: 0.5, competition: 1, byPositionCoach: true });
    takeLook(state, ctx, 1, id, 'live', D('2026-04-20'), { skill: 0.5, competition: 1, byPositionCoach: true });
    expect(state.boards[1]!.grades[id]!.lastLookDay).toBe(D('2026-04-20'));
  });
});
