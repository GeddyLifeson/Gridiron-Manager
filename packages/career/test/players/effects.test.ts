// L1.6.1, D12.5.1, D12.5.2 and D12.6.1 acceptance.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import {
  NEUTRAL_EFFECTS, NEUTRAL_MORALE, PARAMS, REAL_PERSON_DRIVERS, buyIn, effectBounds, ladderWeek, meanBuyIn, moraleEffects, moraleFacets,
  newLadder, nextLosingStreak, relationshipEffects, type LadderEvent, type LadderState,
} from '../../src/players/index.ts';

describe('L1.6.1 bounded effects', () => {
  it('buy_in = 0.5 trust + 0.3 respect + 0.2 role belief', () => {
    expect(buyIn({ trust: 80, respect: 50, roleBelief: 30 })).toBeCloseTo(40 + 15 + 6, 10);
  });

  it('is neutral at 50 and hits the table ends at 0 and 100', () => {
    expect(relationshipEffects(50)).toEqual(NEUTRAL_EFFECTS);
    expect(relationshipEffects(0)).toEqual({ attention: 0.9, practiceEffort: 0.92, reportShift: -15, reducedRoleHit: 1.5, earlyWord: 0.5, leak: 1.5 });
    const top = relationshipEffects(100);
    expect([top.attention, top.practiceEffort, top.reportShift, top.reducedRoleHit, top.earlyWord, top.leak]).toEqual([1.05, 1.04, 10, 0.6, 1.5, 0.7]);
  });

  it('clamps every multiplier to its bound for any input (property test)', () => {
    const rng = stream(seedFromNumber(461), 'players.bounds', []);
    const bounds = effectBounds();
    for (let i = 0; i < 5000; i++) {
      const e = relationshipEffects(rng.uniform() * 400 - 150);
      for (const k of Object.keys(bounds) as (keyof typeof bounds)[]) {
        expect(e[k]).toBeGreaterThanOrEqual(bounds[k][0] - 1e-12);
        expect(e[k]).toBeLessThanOrEqual(bounds[k][1] + 1e-12);
      }
    }
  });

  it('the team mean buy-in is what L2 reads', () => {
    expect(meanBuyIn([{ trust: 100, respect: 100, roleBelief: 100 }, { trust: 0, respect: 0, roleBelief: 0 }])).toBe(50);
  });
});

describe('D12.5.1 effects on football', () => {
  it('development 0.9 below -40 and 1.03 above +40; effort -5 percent below -60; confidence -2 percent after 3 losing games', () => {
    expect(moraleEffects(0, 0)).toEqual(NEUTRAL_MORALE);
    expect(moraleEffects(-41, 0).development).toBe(0.9);
    expect(moraleEffects(41, 0).development).toBe(1.03);
    expect(moraleEffects(-61, 0).decidedGameEffort).toBeCloseTo(0.95, 12);
    expect(moraleEffects(-59, 0).decidedGameEffort).toBe(1);
    expect(moraleEffects(0, 3).confidencePenalty).toBe(0.02);
    expect(moraleEffects(0, 2).confidencePenalty).toBe(0);
  });

  it('a winning game ends the confidence streak; a game with no contests leaves it', () => {
    let s = 0;
    for (const [w, l] of [[2, 5], [1, 4], [3, 6]]) s = nextLosingStreak(s, w!, l!);
    expect(s).toBe(3);
    expect(nextLosingStreak(s, 0, 0)).toBe(3);
    expect(nextLosingStreak(s, 6, 2)).toBe(0);
  });

  it('every size is a starting value with a leaf, none presented as a fact', () => {
    for (const p of PARAMS.params) { expect(['bible', 'assumption']).toContain(p.basis); expect(p.leaf.length).toBeGreaterThan(0); expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
  });
});

/** Run the ladder for a sequence of weekly satisfactions. */
function run(sat: readonly number[], origin: 'generated' | 'imported', opts: { window?: (w: number) => boolean; driverChangedAt?: number; contracts?: boolean } = {}): { events: LadderEvent[]; byWeek: number[] } {
  let s: LadderState = newLadder(54);
  const events: LadderEvent[] = [];
  const byWeek: number[] = [];
  sat.forEach((x, w) => {
    const r = ladderWeek(s, { satisfaction: x, decisionWindow: opts.window?.(w) ?? false, driverChanged: opts.driverChangedAt === w, playerContracts: opts.contracts ?? true }, origin);
    s = r.state;
    for (const e of r.events) { events.push(e); byWeek.push(w); }
  });
  return { events, byWeek };
}

describe('D12.5.2 threshold events', () => {
  it('a benched starter with no conversation reaches the public-complaint step within the stated weeks', () => {
    const benched = Array.from({ length: 12 }, () => -70);
    const r = run(benched, 'generated');
    expect(r.events.map((e) => e.kind)).toEqual(['asks_for_meeting', 'effort_flag_private_complaint', 'public_complaint_or_agent']);
    expect(r.byWeek).toEqual([2, 3, 3]);
  });

  it('the same player given an honest role talk and a real path back does not', () => {
    const r = run([-70, -70, -70, -55, -40, -25, -10], 'generated', { driverChangedAt: 2 });
    expect(r.events.map((e) => e.kind)).not.toContain('public_complaint_or_agent');
  });

  it('words alone do not stop a step: no driver change, no reset', () => {
    expect(run(Array.from({ length: 5 }, () => -70), 'generated').events.length).toBe(3);
  });

  it('at a decision window below -75: a trade request with contracts, the portal decision without', () => {
    const sat = Array.from({ length: 6 }, () => -80);
    expect(run(sat, 'generated', { window: (w) => w === 5 }).events.at(-1)!.kind).toBe('trade_or_release_request');
    expect(run(sat, 'generated', { window: (w) => w === 5, contracts: false }).events.at(-1)!.kind).toBe('portal_decision');
  });
});

describe('D12.6.1 real people', () => {
  it('stops at asks for a meeting and a neutral unquoted statement at a window; never a complaint', () => {
    const r = run(Array.from({ length: 20 }, () => -90), 'imported', { window: (w) => w === 10 });
    expect(r.events.map((e) => e.kind)).toEqual(['asks_for_meeting', 'neutral_seek_larger_role']);
    expect(r.events.every((e) => !e.quoted)).toBe(true);
  });

  it('fuzz: no complaint, quote or personal step on any real person', () => {
    const rng = stream(seedFromNumber(4612), 'players.fuzz', []);
    for (let p = 0; p < 200; p++) {
      const sat = Array.from({ length: 30 }, () => rng.uniform() * 200 - 100);
      const r = run(sat, 'imported', { window: () => rng.uniform() < 0.2, contracts: rng.uniform() < 0.5 });
      for (const e of r.events) { expect(['asks_for_meeting', 'neutral_seek_larger_role']).toContain(e.kind); expect(e.quoted).toBe(false); }
    }
  });

  it('runs with ego fixed at 50 and football drivers only', () => {
    expect(moraleFacets('imported', { ego: 95, loyalty: 20 })).toEqual({ ego: 50, loyalty: 20 });
    expect(moraleFacets('generated', { ego: 95 })).toEqual({ ego: 95 });
    expect(REAL_PERSON_DRIVERS).toEqual(['role_gap', 'team_results', 'fit_and_use']);
  });
});
