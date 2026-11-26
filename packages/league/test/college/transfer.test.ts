import { describe, expect, it } from 'vitest';
import {
  aidEndsOnEntry, coachChangeWindow, collegeAct, collegeRules, contactIsTampering, entryAllowed, entryChance, evaluationBandFactor,
  landingChance, staffRead, unsignedShare, type EntryContext, type RetentionFactors,
} from '../../src/college/index.ts';
import { commitAct } from '../../src/compliance/index.ts';
import { COLLEGE_VALUES, MemorySink, emptyCompliance, party, ruleSet as complianceRules } from '../compliance/fixtures.ts';
import { RULES, day, ruleSet, stream } from './helpers.ts';

const W = { open: day(2026, 1, 2), close: day(2026, 1, 16) };
const ctx: EntryContext = { teamLastGameDay: null, headCoachHiredDay: null, priorTransfers: 0, hasEligibilityLeft: true, graduated: false };

describe('the window (T6.1.1 acceptance)', () => {
  it('inside the window an entry is accepted; outside it is refused', () => {
    expect(entryAllowed(day(2026, 1, 2), W, ctx, RULES)).toEqual({ ok: true, via: 'window' });
    expect(entryAllowed(day(2026, 1, 16), W, ctx, RULES)).toEqual({ ok: true, via: 'window' });
    expect(entryAllowed(day(2026, 1, 17), W, ctx, RULES)).toEqual({ ok: false, reason: 'outside_window' });
    expect(entryAllowed(day(2026, 4, 15), W, ctx, RULES)).toEqual({ ok: false, reason: 'outside_window' });
  });
  it('a team still in the postseason when the window closed gets five days after its last game', () => {
    const c = { ...ctx, teamLastGameDay: day(2026, 1, 19) };
    expect(entryAllowed(day(2026, 1, 20), W, c, RULES)).toEqual({ ok: true, via: 'postseason' });
    expect(entryAllowed(day(2026, 1, 24), W, c, RULES)).toEqual({ ok: true, via: 'postseason' });
    expect(entryAllowed(day(2026, 1, 25), W, c, RULES).ok).toBe(false);
    // A team whose season ended well inside the window gets no extension.
    expect(entryAllowed(day(2026, 1, 20), W, { ...ctx, teamLastGameDay: day(2026, 1, 3) }, RULES).ok).toBe(false);
  });
  it('a head coaching change opens 15 days starting five days after the hire', () => {
    const hired = day(2026, 3, 1);
    expect(coachChangeWindow(hired, RULES)).toEqual({ open: day(2026, 3, 6), close: day(2026, 3, 20) });
    const c = { ...ctx, headCoachHiredDay: hired };
    expect(entryAllowed(day(2026, 3, 5), W, c, RULES).ok).toBe(false);
    expect(entryAllowed(day(2026, 3, 6), W, c, RULES)).toEqual({ ok: true, via: 'coach_change' });
    expect(entryAllowed(day(2026, 3, 20), W, c, RULES)).toEqual({ ok: true, via: 'coach_change' });
    expect(entryAllowed(day(2026, 3, 21), W, c, RULES).ok).toBe(false);
  });
  it('no eligibility, no entry; transfers are unlimited until a one-free rule is switched on', () => {
    expect(entryAllowed(day(2026, 1, 5), W, { ...ctx, hasEligibilityLeft: false }, RULES)).toEqual({ ok: false, reason: 'no_eligibility' });
    expect(entryAllowed(day(2026, 1, 5), W, { ...ctx, priorTransfers: 4 }, RULES).ok).toBe(true);
    const one = collegeRules(ruleSet({ 'transfer.max_free': 1 }));
    expect(entryAllowed(day(2026, 1, 5), W, { ...ctx, priorTransfers: 1 }, one)).toEqual({ ok: false, reason: 'transfer_limit' });
    expect(entryAllowed(day(2026, 1, 5), W, { ...ctx, priorTransfers: 1, graduated: true }, one).ok).toBe(true);
    expect(entryAllowed(day(2026, 1, 5), W, { ...ctx, priorTransfers: 2, graduated: true }, one).ok).toBe(false);
  });
  it('entering keeps aid by default (data switch)', () => {
    expect(aidEndsOnEntry(RULES)).toBe(false);
    expect(aidEndsOnEntry(collegeRules(ruleSet({ 'transfer.aid_ends_on_entry': true })))).toBe(true);
  });
});

describe('who leaves (T6.2.1)', () => {
  const content: RetentionFactors = { satisfaction: 0.6, blockedOnDepthChart: false, positionCoachLeft: false, payToMarket: 1, teamLosing: false, backupWithEligibility: false, relationship: 0.2, rolePromise: false };
  it('entry chance drivers: each named driver moves the chance the stated way', () => {
    const base = entryChance(content);
    expect(entryChance({ ...content, satisfaction: 0.1 })).toBeGreaterThan(base);
    expect(entryChance({ ...content, blockedOnDepthChart: true })).toBeGreaterThan(base);
    expect(entryChance({ ...content, positionCoachLeft: true })).toBeGreaterThan(base);
    expect(entryChance({ ...content, payToMarket: 0.5 })).toBeGreaterThan(base);
    expect(entryChance({ ...content, teamLosing: true })).toBeGreaterThan(base);
    expect(entryChance({ ...content, backupWithEligibility: true })).toBeGreaterThan(base);
    const unhappy = { ...content, satisfaction: 0.2, blockedOnDepthChart: true, relationship: 0, rolePromise: false };
    expect(entryChance({ ...unhappy, relationship: 1 })).toBeLessThan(entryChance(unhappy));
    expect(entryChance({ ...unhappy, rolePromise: true })).toBeLessThan(entryChance(unhappy));
    const worst = { satisfaction: 0, blockedOnDepthChart: true, positionCoachLeft: true, payToMarket: 0, teamLosing: true, backupWithEligibility: true, relationship: 0, rolePromise: false };
    expect(entryChance(worst)).toBeLessThanOrEqual(0.95);
  });
  it('staff read: words only, and wrong more often when the position coach\'s tie is weak', () => {
    const wrongShare = (tie: number) => {
      const rng = stream(11); let wrong = 0;
      for (let i = 0; i < 4000; i++) if (staffRead(0.8, tie, rng) !== 'agent_asking_around') wrong++;
      return wrong / 4000;
    };
    expect(wrongShare(1)).toBeLessThan(0.08);
    expect(wrongShare(0)).toBeGreaterThan(0.38);
    expect(['says_staying', 'nothing_heard', 'agent_asking_around']).toContain(staffRead(0.05, 0.5, stream(3)));
  });
  it('placement: starting unsigned shares by level; power-conference scholarship players nearly all land', () => {
    expect(unsignedShare('top', false)).toBe(0.3);
    expect(unsignedShare('second', false)).toBe(0.55);
    expect(unsignedShare('lower', false)).toBe(0.7);
    expect(unsignedShare('top', true)).toBe(0.03);
  });
  it('world volume: a roster-sized population at mixed contentment enters within 30 percent of a quarter', () => {
    const rng = stream(2026); let entries = 0; const n = 105 * 40;
    for (let i = 0; i < n; i++) {
      const f: RetentionFactors = {
        satisfaction: rng.uniform(), blockedOnDepthChart: rng.uniform() < 0.4, positionCoachLeft: rng.uniform() < 0.15, payToMarket: 0.5 + rng.uniform() * 0.7,
        teamLosing: rng.uniform() < 0.5, backupWithEligibility: rng.uniform() < 0.5, relationship: rng.uniform(), rolePromise: rng.uniform() < 0.3,
      };
      if (rng.uniform() < entryChance(f)) entries++;
    }
    const share = entries / n;
    expect(share).toBeGreaterThan(0.25 * 0.7);
    expect(share).toBeLessThan(0.25 * 1.3 + 0.1);
  });
});

describe('the market (T6.3.1, T6.3.2)', () => {
  it('evaluation bands: a transfer is narrower than a high school prospect; a two-year or lower-division player is wider than a same-level transfer', () => {
    expect(evaluationBandFactor('same_level')).toBeLessThan(evaluationBandFactor('high_school'));
    expect(evaluationBandFactor('juco')).toBeGreaterThan(evaluationBandFactor('same_level'));
    expect(evaluationBandFactor('lower_division')).toBeGreaterThan(evaluationBandFactor('same_level'));
    expect(evaluationBandFactor('lower_subdivision')).toBeGreaterThan(evaluationBandFactor('same_level'));
  });
});

describe('tampering (T6.4.1)', () => {
  const tctx = { actor: party(20, 'position_coach', 2), day: day(2025, 12, 10), knew: [21], tier: 1 as const, source: 'sim' as const };
  it('contact before entry is tampering and never blocked; after entry it is not', () => {
    expect(contactIsTampering(false)).toBe(true);
    expect(contactIsTampering(true)).toBe(false);
  });
  it('tampering raises the landing chance and writes exactly one violation row', () => {
    expect(landingChance(0.3, true)).toBeGreaterThan(landingChance(0.3, false));
    const act = collegeAct('transfer_tampering', tctx, { personId: 70, origin: 'generated' })!;
    expect(act.classId).toBe('transfer_tampering');
    const sink = new MemorySink();
    const r = commitAct(emptyCompliance(), act, complianceRules(COLLEGE_VALUES), sink);
    expect(r.ok).toBe(true);
    expect(sink.events).toHaveLength(1);
  });
  it('with the people pack loaded, no tampering event names a real person', () => {
    expect(collegeAct('transfer_tampering', tctx, { personId: 70, origin: 'imported' })).toBeNull();
    expect(collegeAct('transfer_tampering', { ...tctx, actor: party(20, 'position_coach', 2, 'imported') }, { personId: 70, origin: 'generated' })).toBeNull();
  });
});
