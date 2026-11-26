import { describe, expect, it } from 'vitest';
import { PROB_FLOOR } from '@gm/schema';
import { P, injuryHazard, knowledgeTotals, newPeriod, resolvePractice, resolvePracticeFast, type ResolveInput, type Practice } from '../../src/practice/index.ts';
import { OC, PC, ctx, practice, rng, script, teamPeriod } from './fixtures.ts';

const scripts = new Map([['s-off', script('s-off', 'offense', ['p1', 'p2'], 80)], ['s-draft', script('s-draft', 'offense', ['p1'], 80, false)]]);
const input = (p: Practice, seed = 1, over: Partial<ResolveInput> = {}): ResolveInput => ({ practice: p, scripts, ctx: ctx(), teachingTerm: () => 1, rng: rng(seed), ...over });
const sumLoad = (r: ReturnType<typeof resolvePractice>) => [...r.load.values()].reduce((s, l) => s + l.liveReps + l.thudReps + l.teamReps + l.walkThroughReps, 0);

describe('H3.5.1 resolving a practice', () => {
  it('same seed and same plan give identical results', () => {
    const p = practice([newPeriod(1, 'warmup', OC), teamPeriod(2, { minutes: 20 })]);
    const a = resolvePractice(input(p, 7));
    const b = resolvePractice(input(p, 7));
    expect(JSON.stringify({ ...a, load: [...a.load] })).toBe(JSON.stringify({ ...b, load: [...b.load] }));
  });
  it('doubling team-period minutes roughly doubles reps and load', () => {
    const one = resolvePractice(input(practice([teamPeriod(1, { minutes: 15 })])));
    const two = resolvePractice(input(practice([teamPeriod(1, { minutes: 30 })])));
    const ratio = sumLoad(two) / sumLoad(one);
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });
  it('full pads use one padded practice when the practice resolves; shells do not', () => {
    expect(resolvePractice(input(practice([teamPeriod(1)], { pads: 'full' }))).paddedUsed).toBe(true);
    expect(resolvePractice(input(practice([teamPeriod(1)]))).paddedUsed).toBe(false);
  });
  it('a player set to Did not participate records zero practice load', () => {
    const part = new Map([['QB0', { personId: 'QB0', label: 'did_not_participate' as const, reason: 'injury' as const }]]);
    const r = resolvePractice(input(practice([teamPeriod(1, { minutes: 20 }), newPeriod(2, 'conditioning', OC, { groups: ['offense'] })]), 1, { ctx: ctx({ participation: part }) }));
    expect(r.load.get('QB0')).toBeUndefined();
    expect(r.knowledge.some((k) => k.personId === 'QB0' && k.mode === 'taken')).toBe(false);
  });
  it('a backup with zero reps gets only mental-rep gains at the mental share', () => {
    const r = resolvePractice(input(practice([teamPeriod(1, { minutes: 20 })])));
    const qb2 = r.knowledge.filter((k) => k.personId === 'QB2');
    expect(qb2.length).toBeGreaterThan(0);
    expect(qb2.every((k) => k.mode === 'mental')).toBe(true);
    const taken = r.knowledge.find((k) => k.personId === 'QB0' && k.mode === 'taken' && k.weight > 0)!;
    expect(Math.min(...qb2.map((k) => k.weight))).toBeLessThanOrEqual(taken.weight * P('mental_rep_share') + 1e-12);
  });
  it('an unapproved script runs as the coordinator drafted it and says so', () => {
    const r = resolvePractice(input(practice([teamPeriod(1, { scriptRef: 's-draft' })])));
    expect(r.draftRun).toEqual([1]);
  });
  it('knowledge exposures carry the card; match is applied at game time (H3.2.2)', () => {
    const r = resolvePractice(input(practice([teamPeriod(1)])));
    expect(r.knowledge.every((k) => k.cardId === 'c-cover3')).toBe(true);
  });
  it('without full pads line technique and run readiness fall (H3.1.3)', () => {
    const per = teamPeriod(1, { minutes: 20 });
    const shells = resolvePractice(input(practice([per]), 3, { errorChance: () => PROB_FLOOR }));
    const full = resolvePractice(input(practice([per], { pads: 'full' }), 3, { errorChance: () => PROB_FLOOR }));
    const tq = (r: typeof shells) => r.technique.filter((t) => t.personId === 'LT0').reduce((s, t) => s + t.weight, 0);
    expect(tq(shells)).toBeCloseTo(tq(full) * P('no_pads_line_technique'), 9);
    expect(knowledgeTotals(shells).get('QB0')! / knowledgeTotals(full).get('QB0')!).toBeCloseTo(P('no_pads_run_readiness'), 2);
  });
  it('injury hazard is never zero, even at walk tempo (MA-52)', () => {
    const p = practice([teamPeriod(1, { tempo: 'walk' })]);
    expect(injuryHazard(p, p.periods[0]!, false, 1)).toBeGreaterThanOrEqual(PROB_FLOOR);
    expect(injuryHazard(p, { ...p.periods[0]!, tempo: 'live' }, false, 1e9)).toBeLessThanOrEqual(1 - PROB_FLOOR);
  });
  it('an injured player leaves practice and his reps go to the next man', () => {
    const r = resolvePractice(input(practice([teamPeriod(1, { minutes: 30, tempo: 'live' })], { pads: 'full' }), 5, { injuryState: (id) => (id === 'WR0' ? 1e9 : 1) }));
    const hurt = r.injuries.find((i) => i.personId === 'WR0')!;
    expect(hurt).toBeDefined();
    expect(r.outcomes.filter((o) => o.personId === 'WR0' && o.rep > hurt.rep).length).toBe(0);
  });
  it('a position coach\'s drill choice changes the technique gains of his group and no other (H3.6.2 acceptance 1)', () => {
    const base = (drills: string[]) => practice([newPeriod(1, 'individual', PC, { minutes: 10, groups: ['LT', 'LG', 'C', 'RG', 'RT'], drills }), newPeriod(2, 'individual', OC, { minutes: 10, groups: ['WR'], drills: ['route_release'] })]);
    const a = resolvePractice(input(base(['pass_set'])));
    const b = resolvePractice(input(base(['hand_placement'])));
    const techOf = (r: typeof a, id: string) => r.technique.filter((t) => t.personId === id).flatMap((t) => t.techniques);
    expect(techOf(a, 'LT0')).not.toEqual(techOf(b, 'LT0'));
    expect(techOf(a, 'WR0')).toEqual(techOf(b, 'WR0'));
  });
  it('correction flags raise the flagged player\'s gain from that period only', () => {
    const p = (corr: string[]) => practice([newPeriod(1, 'individual', PC, { minutes: 10, groups: ['LT'], drills: ['pass_set'], corrections: corr })]);
    const a = resolvePractice(input(p([])));
    const b = resolvePractice(input(p(['LT0'])));
    const w = (r: typeof a, id: string) => r.technique.filter((t) => t.personId === id).reduce((s, t) => s + t.weight, 0);
    expect(w(b, 'LT0')).toBeCloseTo(w(a, 'LT0') * P('correction_bonus'), 9);
    expect(w(b, 'LT1')).toBeCloseTo(w(a, 'LT1'), 9);
  });
  it('scout players take every rep at half technique rate and the load counts', () => {
    const r = resolvePractice(input(practice([teamPeriod(1)]), 1, { scoutPlayers: new Map([[1, ['CB8']]]) }));
    const l = r.load.get('CB8')!;
    expect(l.scoutReps).toBe(Math.floor(10 * P('rate_thud')));
    expect(r.technique.filter((t) => t.personId === 'CB8').every((t) => t.scout)).toBe(true);
  });
  it('fast mode and rep-level mode give matching average gains within 5 percent over 1,000 practices', () => {
    const p = practice([newPeriod(1, 'warmup', OC), teamPeriod(2, { minutes: 15 })]);
    let rep = 0;
    let fast = 0;
    const low = { injuryState: () => 0 };
    for (let s = 1; s <= 1000; s++) {
      rep += [...knowledgeTotals(resolvePractice(input(p, s, low))).values()].reduce((a, b) => a + b, 0);
    }
    const f = resolvePracticeFast({ practice: p, scripts, ctx: ctx(), teachingTerm: () => 1, ...low });
    fast = [...knowledgeTotals(f).values()].reduce((a, b) => a + b, 0) * 1000;
    expect(Math.abs(rep - fast) / fast).toBeLessThan(P('fast_mode_tolerance'));
  });
});
