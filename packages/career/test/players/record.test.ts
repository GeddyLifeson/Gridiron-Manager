// L1.1.1 and L1.1.2 acceptance: starting values, bounds under an event storm, half-life decay, the 40-row
// cap, replay, the familiarity shield, witness copies, and moving between teams and back.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import {
  EVENT_KINDS, applyEvent, effectiveStrength, halfPow, insertMemory, knownRecent, newRecord, reunite, separate,
  sharedWeek, talkFamiliarity, witnessCopy, familiarityShield, type LedgerMemory, type RelationshipRecord,
} from '../../src/players/index.ts';

const D = (seasonYear: number, dayIndex: number) => ({ seasonYear, dayIndex });
const NEUTRAL = { ego: 50, competitiveness: 50, coachability: 50, loyalty: 50 };
const base = (): RelationshipRecord => newRecord({ holderId: 2, aboutId: 1, coachPlayerRegard: 0, season: 2030 });

describe('L1.1.1 relationship record', () => {
  it('starts at trust 50, respect 40 plus up to 30 from reputation, familiarity 0, role belief 60', () => {
    const r = base();
    expect([r.trust, r.respect, r.familiarity, r.roleBelief]).toEqual([50, 40, 0, 60]);
    expect(newRecord({ holderId: 2, aboutId: 1, coachPlayerRegard: 1, season: 2030 }).respect).toBe(70);
    expect(newRecord({ holderId: 2, aboutId: 1, coachPlayerRegard: 0.5, season: 2030, recruitingFamiliarity: 90 }).familiarity).toBe(40);
  });

  it('keeps every value in 0 to 100 under a random storm of 10,000 events', () => {
    const rng = stream(seedFromNumber(46), 'players.storm', []);
    const kinds = Object.keys(EVENT_KINDS);
    let r = base();
    for (let i = 0; i < 10000; i++) {
      const kind = kinds[Math.floor(rng.uniform() * kinds.length)]!;
      const strength = kind.startsWith('talk') || kind === 'praise' || kind === 'correction' ? rng.uniform() * 200 - 100 : undefined;
      const facets = { ego: Math.floor(rng.uniform() * 101), competitiveness: 50, coachability: Math.floor(rng.uniform() * 101), loyalty: 50 };
      r = applyEvent(r, { kind, date: D(2030 + Math.floor(i / 300), i % 300), strength, scale: 1 + rng.uniform() }, facets).record;
      if (i % 7 === 0) r = sharedWeek(r);
      for (const v of [r.trust, r.respect, r.familiarity, r.roleBelief]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
      expect(r.memories.length).toBeLessThanOrEqual(40);
    }
  });

  it('a long good relationship absorbs part of a single bad event; good events are not shielded', () => {
    const fresh = base();
    const close = { ...base(), familiarity: 100, trust: 80 };
    expect(familiarityShield(close)).toBeCloseTo(0.3 * 0.8, 10);
    const a = applyEvent(fresh, { kind: 'promise_broken', date: D(2030, 10) }, NEUTRAL);
    const b = applyEvent(close, { kind: 'promise_broken', date: D(2030, 10) }, NEUTRAL);
    expect(a.moved.trust).toBe(-30);
    expect(b.moved.trust).toBeCloseTo(-30 * (1 - 0.24), 10);
    expect(applyEvent(close, { kind: 'promise_kept', date: D(2030, 10) }, NEUTRAL).moved.trust).toBe(15);
  });

  it('the personality factor runs 0.5 to 1.5 from the row facet', () => {
    const lo = applyEvent(base(), { kind: 'found_out_depth_chart', date: D(2030, 1) }, { ...NEUTRAL, ego: 0 });
    const hi = applyEvent(base(), { kind: 'found_out_depth_chart', date: D(2030, 1) }, { ...NEUTRAL, ego: 100 });
    expect(lo.memory.strength).toBe(-5);
    expect(hi.memory.strength).toBe(-15);
  });

  it('moving a player between teams and back restores the record minus familiarity decay', () => {
    let r = { ...base(), familiarity: 45, trust: 70 };
    r = separate(r, 2030);
    expect(sharedWeek(r).familiarity).toBe(45);
    const back = reunite(r, 2033);
    expect(back.familiarity).toBe(15);
    expect(back.trust).toBe(70);
    expect(back.together).toBe(true);
  });

  it('a talk gives 3 to 6 familiarity', () => {
    expect(talkFamiliarity(base(), 0).familiarity).toBe(3);
    expect(talkFamiliarity(base(), 0.9999).familiarity).toBe(6);
  });
});

describe('L1.1.2 memory ledger', () => {
  it('halfPow matches 0.5^x', () => {
    for (const x of [0, 0.25, 0.5, 1, 1.7, 3.3333, 12.5, 40]) expect(halfPow(x)).toBeCloseTo(Math.pow(0.5, x), 12);
  });

  it('a memory at one half-life shows half its strength within rounding', () => {
    const m: LedgerMemory = { kind: 'found_out_depth_chart', date: D(2030, 0), strength: -10, halfLifeWeeks: 12, witnesses: [], aboutPersonId: 1, firstHand: true, eventId: null };
    expect(effectiveStrength(m, D(2030, 84))).toBeCloseTo(-5, 10);
    expect(effectiveStrength(m, D(2030, 168))).toBeCloseTo(-2.5, 10);
  });

  it('touchstones never fall below a quarter of their strength', () => {
    const m: LedgerMemory = { kind: 'lied_found_out', date: D(2030, 0), strength: -80, halfLifeWeeks: 4, witnesses: [], aboutPersonId: 1, firstHand: true, eventId: null };
    expect(effectiveStrength(m, D(2040, 0))).toBe(-20);
  });

  it('holds at most 40 live memories, dropping the weakest effective one', () => {
    let list: LedgerMemory[] = [];
    for (let i = 0; i < 45; i++) list = insertMemory(list, { kind: 'praise', date: D(2030, i), strength: i === 3 ? 90 : 1 + (i % 5), halfLifeWeeks: 4, witnesses: [], aboutPersonId: 1, firstHand: true, eventId: null }, D(2030, 50));
    expect(list.length).toBe(40);
    expect(list.some((m) => m.strength === 90)).toBe(true);
  });

  it('replays to an identical ledger and trust from a fixed seed and event list', () => {
    const run = () => {
      const rng = stream(seedFromNumber(7), 'players.replay', []);
      let r = base();
      for (let i = 0; i < 300; i++) r = applyEvent(r, { kind: rng.uniform() < 0.5 ? 'praise' : 'found_out_depth_chart', date: D(2030, i), strength: rng.uniform() < 0.5 ? undefined : 4 }, NEUTRAL).record;
      return r;
    };
    expect(run()).toEqual(run());
  });

  it('copies a witnessed memory at half strength to witnesses tied above 60 only; the coach does not see copies', () => {
    const subject = applyEvent(base(), { kind: 'promise_broken', date: D(2030, 5), witnesses: [7, 8] }, NEUTRAL);
    const recs = new Map([[7, newRecord({ holderId: 7, aboutId: 1, coachPlayerRegard: 0, season: 2030 })], [8, newRecord({ holderId: 8, aboutId: 1, coachPlayerRegard: 0, season: 2030 })]]);
    const out = witnessCopy(subject.memory, (w) => (w === 7 ? 75 : 60), (w) => recs.get(w) ?? null, () => NEUTRAL);
    expect(out.map((o) => o.witnessId)).toEqual([7]);
    expect(out[0]!.result.memory.strength).toBe(-15);
    expect(out[0]!.result.memory.firstHand).toBe(false);
    expect(knownRecent(out[0]!.result.record)).toEqual([]);
    expect(knownRecent(subject.record)).toEqual([{ kind: 'promise_broken', date: D(2030, 5) }]);
  });

  it('lists the last five known events newest first, without strengths', () => {
    let r = base();
    for (let i = 0; i < 8; i++) r = applyEvent(r, { kind: 'praise', date: D(2030, i * 7), strength: 5 }, NEUTRAL).record;
    const recent = knownRecent(r);
    expect(recent.map((e) => e.date.dayIndex)).toEqual([49, 42, 35, 28, 21]);
    expect(Object.keys(recent[0]!)).toEqual(['kind', 'date']);
  });
});
