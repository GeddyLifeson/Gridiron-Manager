// Staff learn the head coach's preferences and raise their own in a game-week one-on-one
// (Marlon 2026-11-26 07:08; K6, K6.3.2, L4.3.3, N3, H4).
import { describe, expect, it } from 'vitest';
import { stream } from '@gm/engine-core';
import type { decisions } from '@gm/models';
import { FRESH_HISTORY, P, learnPreferences, oneOnOneAgenda, preferredOption, respond, type PreferenceWindow } from '../../src/staff/index.ts';
import { SEED, staffer } from './fixtures.ts';

const USER_ID = 1;
let seq = 0;
function view(over: { type?: string; chosen?: string; date?: string; actor?: 'user' | 'staff'; personId?: number; bucket?: string; superseded?: boolean; notMade?: boolean } = {}): decisions.DecisionView {
  const id = `d${String(seq++).padStart(4, '0')}`;
  const record = {
    id, time: { worldDate: over.date ?? '2030-10-01', gameId: 1, playIndex: seq, period: 4, gameClockTenths: 1200 },
    actor: { kind: over.actor ?? 'user', personId: over.personId ?? USER_ID }, rung: 'head_coach', type: over.type ?? 'fourth_down', owner: 'I5', teamId: 3,
    situation: { bucket: over.bucket ?? 'short_opp_territory' }, options: [], chosen: over.chosen ?? 'go', information: [],
    timeTaken: { tenthsFromPrompt: 50, playClockLeftTenths: null }, attribution: { creditedPersonId: USER_ID, basis: 'own_decision', viaPersonId: null },
    notMade: over.notMade ?? false, supersedes: null, snapshotId: null, violationLogId: null,
  } as unknown as decisions.DecisionRecord;
  return { record, modelView: null, outcome: null, followUps: [], supersededBy: over.superseded ? ['x'] : [] };
}
const bucketOf = (r: decisions.DecisionRecord): string | null => ((r.situation as { bucket?: string }).bucket ?? null);
const window = (over: Partial<PreferenceWindow> = {}): PreferenceWindow => ({ staffId: 20, headCoachId: USER_ID, sinceIso: '2030-08-01', types: ['fourth_down', 'try'], ...over });
const many = (n: number, o: Parameters<typeof view>[0]) => Array.from({ length: n }, () => view(o));

describe('learning the head coach\'s preferences', () => {
  it('a habit seen often enough, mostly one way, becomes a preference with its evidence', () => {
    const vs = [...many(7, { chosen: 'go' }), ...many(2, { chosen: 'punt' })];
    const prefs = learnPreferences(vs, window(), bucketOf);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatchObject({ type: 'fourth_down', bucket: 'short_opp_territory', chosen: 'go', times: 7, of: 9 });
    expect(prefs[0]!.decisionIds).toHaveLength(7);
    expect(preferredOption(prefs, 'fourth_down', 'short_opp_territory')).toBe('go');
    expect(preferredOption(prefs, 'fourth_down', 'long_own_territory')).toBeNull();
  });

  it('too few decisions, or a split habit, is not a preference', () => {
    expect(learnPreferences(many(P('pref_min_seen') - 1, {}), window(), bucketOf)).toEqual([]);
    const split = [...many(5, { chosen: 'go' }), ...many(5, { chosen: 'punt' })];
    expect(learnPreferences(split, window(), bucketOf)).toEqual([]);
  });

  it('he learns only what he could have seen: his kinds of decision, since he joined, the head coach\'s own choices', () => {
    const vs = [
      ...many(6, { date: '2030-07-01' }), // before he joined
      ...many(6, { type: 'timeout' }), // not his duty
      ...many(6, { actor: 'staff', personId: 30 }), // someone else's call
      ...many(6, { superseded: true }),
      ...many(6, { notMade: true }),
    ];
    expect(learnPreferences(vs, window(), bucketOf)).toEqual([]);
  });

  it('is the same whatever order the log is read in', () => {
    const vs = [...many(6, { chosen: 'go' }), ...many(6, { type: 'try', chosen: 'two', bucket: 'down_8' })];
    const a = learnPreferences(vs, window(), bucketOf);
    const b = learnPreferences([...vs].reverse(), window(), bucketOf);
    expect(b).toEqual(a);
    expect(a.map((p) => p.type).sort()).toEqual(['fourth_down', 'try']);
  });
});

describe('the game-week one-on-one', () => {
  const prefs = learnPreferences([...many(8, { chosen: 'go' }), ...many(8, { type: 'try', chosen: 'one', bucket: 'down_2' })], window(), bucketOf);
  const own = (type: string) => (type === 'fourth_down' ? { optionId: 'punt', gap: 0.04, ownSystem: false } : { optionId: 'one', gap: 0, ownSystem: false });

  it('he brings suggestions only where his own pick differs, and only through the candor rule', () => {
    const open = staffer(20, 'offensiveCoordinator', { facets: { candor: 100 } });
    let raised = 0;
    for (let i = 0; i < 200; i++) {
      const a = oneOnOneAgenda(open, prefs, own, FRESH_HISTORY, stream(SEED, 'coachAI', ['oneOnOne', i]));
      expect(a.learned).toEqual(prefs);
      expect(a.weighed).toHaveLength(1); // the try habit matches his own pick: nothing to weigh
      raised += a.suggestions.length;
      for (const s of a.suggestions) expect(s).toMatchObject({ type: 'fourth_down', yourHabit: 'go', hisPick: 'punt', times: 8, of: 8 });
    }
    const quiet = staffer(21, 'offensiveCoordinator', { facets: { candor: 0 } });
    let quietRaised = 0;
    for (let i = 0; i < 200; i++) quietRaised += oneOnOneAgenda(quiet, prefs, own, FRESH_HISTORY, stream(SEED, 'coachAI', ['oneOnOne', i])).suggestions.length;
    expect(raised).toBeGreaterThan(quietRaised);
    expect(quietRaised).toBeGreaterThan(0); // Marlon 2026-11-25: the quietest still has a chance
  });

  it('a head coach who keeps punishing candor hears fewer suggestions', () => {
    const m = staffer(22, 'offensiveCoordinator', { facets: { candor: 60 } });
    let punished = FRESH_HISTORY;
    for (let i = 0; i < 4; i++) punished = respond(punished, 'punished');
    let fresh = 0; let after = 0;
    for (let i = 0; i < 300; i++) {
      fresh += oneOnOneAgenda(m, prefs, own, FRESH_HISTORY, stream(SEED, 'coachAI', ['p', i])).suggestions.length;
      after += oneOnOneAgenda(m, prefs, own, punished, stream(SEED, 'coachAI', ['p', i])).suggestions.length;
    }
    expect(after).toBeLessThan(fresh);
  });

  it('an absent staff member raises nothing, and the meeting never counts as a headset push', () => {
    const away = staffer(23, 'offensiveCoordinator', { facets: { candor: 100 }, available: false });
    expect(oneOnOneAgenda(away, prefs, own, FRESH_HISTORY, stream(SEED, 'coachAI', ['away'])).suggestions).toEqual([]);
    const m = staffer(24, 'offensiveCoordinator', { facets: { candor: 100 } });
    expect(oneOnOneAgenda(m, prefs, own, FRESH_HISTORY, stream(SEED, 'coachAI', ['h'])).history.pushesThisSeries).toBe(0);
  });
});
