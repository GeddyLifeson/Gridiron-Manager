// G-76 K7.7.1: front office violation opportunities go through K2.8.2 and the L8.2.5 pipeline (league.compliance).
import { describe, expect, it } from 'vitest';
import { compliance } from '@gm/league';
import { COLLEGE_COMPLIANCE as college, D, MemorySink, PRO_COMPLIANCE as pro, complianceContext, party, scripted, seeded } from './league-fixtures.ts';
import { OPPORTUNITIES, OPPORTUNITY_KINDS, actFor, campFine, gainFromWins, opportunity, raise, type Raise } from '../../src/gm/index.ts';
import { draw, noDraw } from './fixtures.ts';

const disposition = (ruleRespectZ: number, origin: compliance.Disposition['origin'] = 'generated'): compliance.Disposition => ({ personId: 10, origin, ruleRespectZ, riskTolerance: 80, candor: 50, pressure: 0.5 });
const base = (over: Partial<Raise> = {}): Raise => ({
  kind: 'camp_fine', gainWins: 0.8, belief: { publicDetectRate: 0.05, penalty: 0.2 }, actor: party(10, 'general_manager'), marketRead: 0, disposition: disposition(-2),
  orderedBy: null, knew: [10, 77], date: D(2026, 100), competitionId: 1, tier: 1, source: 'sim', ...over,
});
const yes = scripted(() => true), no = scripted(() => false);

describe('K7.7.1 opportunities', () => {
  it('every opportunity the leaf lists maps to a class in the L8.2.5 catalogue whose roles fit a front office', () => {
    expect(OPPORTUNITY_KINDS.length).toBe(12);
    for (const k of OPPORTUNITY_KINDS) expect(compliance.hasViolationClass(OPPORTUNITIES[k].classId), k).toBe(true);
  });
  it('the gain is the K7.2.2 estimate on the 0 to 1 scale, and the read of the risk is persistent', () => {
    expect(gainFromWins(0)).toBe(0);
    expect(gainFromWins(99)).toBe(1);
    expect(gainFromWins(0.4)).toBeGreaterThan(gainFromWins(0.2));
    const a = opportunity('pay_above_cap', 0.5, { publicDetectRate: 0.2, penalty: 0.5 }, { personId: 10, marketRead: -1 }, draw);
    const b = opportunity('pay_above_cap', 0.5, { publicDetectRate: 0.2, penalty: 0.5 }, { personId: 10, marketRead: -1 }, draw);
    expect(a).toEqual(b);
    expect(a.pDetectPerceived).not.toBe(0.2);
    expect(opportunity('pay_above_cap', 0.5, { publicDetectRate: 0.2, penalty: 0.5 }, { personId: 10, marketRead: 0 }, noDraw).pDetectPerceived).toBe(0.2);
  });
  it('a non-waivable camp fine reaches K2.8.2: a willing general manager commits and one row is logged', () => {
    expect(campFine({ waivable: false }, { starter: true, extensionPending: false })).toBe('violation_opportunity');
    const sink = new MemorySink();
    const r = raise(compliance.emptyCompliance(), base(), pro, noDraw, yes, sink);
    expect(r.commit).toBe(true);
    expect(r.state.log.length).toBe(1);
    expect(r.row?.classId).toBe('camp_fine_waiver');
    expect(sink.events.length).toBe(1);
  });
  it('a rule-respecting one declines, and still might with the floor chance (MA-52)', () => {
    const r = raise(compliance.emptyCompliance(), base({ disposition: disposition(3), gainWins: 0.05 }), pro, noDraw, no, new MemorySink());
    expect(r).toMatchObject({ commit: false, reason: 'score', row: null });
    expect(r.state.log.length).toBe(0);
    const slip = raise(compliance.emptyCompliance(), base({ disposition: disposition(3), gainWins: 0.05 }), pro, noDraw, scripted((scope) => scope[0] === 'slip'), new MemorySink());
    expect(slip.commit).toBe(true);
  });
  it('an imported real person never breaks a rule', () => {
    const r = raise(compliance.emptyCompliance(), base({ disposition: disposition(-3, 'imported'), actor: party(10, 'general_manager', 1, 'imported') }), pro, noDraw, yes, new MemorySink());
    expect(r).toMatchObject({ commit: false, reason: 'protected_person' });
  });
  it('a class the rule set does not have is not a violation there (by key, never by level)', () => {
    const r = raise(compliance.emptyCompliance(), base({ kind: 'transfer_contact', actor: party(10, 'head_coach') }), pro, noDraw, yes, new MemorySink());
    expect(r).toMatchObject({ commit: false, reason: 'class_not_in_rule_set' });
    expect(raise(compliance.emptyCompliance(), base({ kind: 'transfer_contact', actor: party(10, 'head_coach') }), college, noDraw, yes, new MemorySink()).commit).toBe(true);
  });
  it('the same scripted violation by the user and by an AI club has the same detection chance and penalty', () => {
    const run = (origin: 'user' | 'generated', source: 'user' | 'sim') => {
      const sink = new MemorySink();
      const a = actFor({ ...base({ kind: 'hidden_injury', actor: party(10, 'general_manager', 1, origin) }), source });
      const done = compliance.commitAct(compliance.emptyCompliance(), a, pro, sink);
      if (!done.ok) throw new Error(done.reason);
      const c = complianceContext(pro);
      return { chance: compliance.detectionChance(done.row, c), sources: compliance.detectionSources(done.row, c), gain: done.row.gain, classId: done.row.classId };
    };
    expect(run('user', 'user')).toEqual(run('generated', 'sim'));
  });
  it('over many seasons AI violations occur, and not every opportunity is taken', () => {
    let state = compliance.emptyCompliance();
    const conduct = seeded(9);
    let taken = 0, offered = 0;
    for (let season = 2026; season < 2076; season++) for (let gmId = 1; gmId <= 32; gmId++) {
      const z = ((gmId * 37) % 50) / 10 - 2.5;
      const r = raise(state, base({ kind: 'pay_above_cap', gainWins: 0.3 + (gmId % 5) / 5, actor: party(gmId, 'general_manager', gmId), disposition: { ...disposition(z), personId: gmId }, date: D(season, 60), knew: [gmId] }), pro, draw, conduct, new MemorySink());
      state = r.state; offered += 1; if (r.commit) taken += 1;
    }
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThan(offered);
    expect(state.log.length).toBe(taken);
  });
});
