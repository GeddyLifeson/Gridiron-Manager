// L1.1.1 display, L1.1.3, L1.2 and L1.5.2 acceptance.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import {
  CONVERSATION_TYPES, afterPersonalRequest, demotionMemory, demotionPrompts, holdConversation, mayBringPersonalMatter, mayPromise,
  neglectRespectLoss, newRecord, noiseWidth, praiseStrength, readBand, relationshipPanel, reveal, REVEAL_ORDER, revealThreshold,
  roleTalk, suggestedTalks, typesOffered, youthScale, correctionReason, type ConversationInput, type Role,
} from '../../src/players/index.ts';

const D = (seasonYear: number, dayIndex: number) => ({ seasonYear, dayIndex });
const rec = (trust = 50) => ({ ...newRecord({ holderId: 2, aboutId: 1, coachPlayerRegard: 0, season: 2030 }), trust });
const talk = (over: Partial<ConversationInput> = {}): ConversationInput => ({
  typeId: 'playing_time', approach: 'direct', date: D(2030, 40), playerRecord: rec(), facets: { ego: 50, competitiveness: 50, coachability: 50 },
  reason: 'none', beforeVisible: false, byPhone: false, statementMultiplier: 1, withPromise: false, youthScale: 1, draw: 0.5, ...over,
});

describe('L1.1.1 display and L1.1.3 knowing the player', () => {
  it('cannot tell under 15 familiarity, a range under 30, one band from 30', () => {
    const d = () => 0.99;
    expect(readBand(90, 10, 'trust', d).kind).toBe('unknown');
    expect(readBand(90, 20, 'trust', d).kind).toBe('range');
    const b = readBand(90, 80, 'trust', d);
    expect(b).toEqual({ kind: 'band', band: 4, textKey: 'players.read.trust.band.4' });
  });

  it('the panel carries words only, never the true numbers', () => {
    const p = relationshipPanel({ ...rec(), trust: 73, respect: 41 }, 60, () => 0.99);
    const json = JSON.stringify(p);
    expect(json).not.toContain('73');
    expect(json).not.toContain('41');
  });

  it('can be a band off at familiarity 50', () => {
    const rng = stream(seedFromNumber(3), 'players.read', []);
    let off = 0;
    for (let i = 0; i < 2000; i++) { const r = readBand(50, 50, 'trust', () => rng.uniform()); if (r.kind === 'band' && r.band !== 2) off++; }
    expect(off).toBeGreaterThan(800);
    expect(off).toBeLessThan(1200);
  });

  it('shows no field as exact before its threshold, in the stated order; noise under 5 at familiarity 100', () => {
    const thresholds = REVEAL_ORDER.map(revealThreshold);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    for (const f of REVEAL_ORDER) expect(reveal(f, 70, revealThreshold(f) - 1, () => 0.5).state).toBe('unknown');
    expect(noiseWidth(100)).toBeLessThan(5);
    expect(reveal('offFieldRisk', 90, 100, () => 0.5)).toEqual({ field: 'offFieldRisk', state: 'hint', hint: 'high' });
  });
});

describe('L1.2.1 conversation system', () => {
  it('scores base + fit + 0.2 (trust - 50) + reason + timing', () => {
    const r = holdConversation(talk({ playerRecord: rec(80), reason: 'true', beforeVisible: true }));
    expect(r.score).toBeCloseTo(2 + 0 + 6 + 8 + 5, 10);
    expect(r.band).toBe('good');
    expect(holdConversation(talk({ reason: 'false', playerRecord: rec(20) })).band).toBe('bad');
  });

  it('high ego takes direct best; high competitiveness and low ego take challenging best (L1.2.3)', () => {
    const ego = { ego: 90, competitiveness: 50, coachability: 50 };
    expect(holdConversation(talk({ facets: ego, approach: 'direct' })).score).toBeGreaterThan(holdConversation(talk({ facets: ego, approach: 'challenging' })).score);
    const grinder = { ego: 10, competitiveness: 90, coachability: 50 };
    expect(holdConversation(talk({ facets: grinder, approach: 'challenging' })).score).toBeGreaterThan(holdConversation(talk({ facets: grinder, approach: 'direct' })).score);
  });

  it('handing a major talk to the position coach costs no hours, gives no familiarity, and leaves a -6 memory', () => {
    const r = holdConversation(talk({ approach: 'delegate' }));
    expect([r.userMinutes, r.userFamiliarity]).toEqual([0, false]);
    expect(r.handOffMemory).toEqual({ kind: 'did_not_tell_me_himself' });
    expect(holdConversation(talk({ approach: 'delegate', typeId: 'praise' })).handOffMemory).toBeNull();
    expect(holdConversation(talk()).userMinutes).toBe(30);
  });

  it('by phone at 70 percent; trust under 15 may decline', () => {
    expect(holdConversation(talk({ byPhone: true })).memory!.scale).toBeCloseTo(0.7, 10);
    expect(holdConversation(talk({ playerRecord: rec(5), draw: 0.1 })).declined).toBe(true);
    expect(holdConversation(talk({ playerRecord: rec(5), draw: 0.9 })).declined).toBe(false);
  });

  it('gives the same outcome for the same inputs', () => {
    expect(holdConversation(talk())).toEqual(holdConversation(talk()));
  });

  it('every type is a data row with all approaches and a template key', () => {
    for (const t of Object.values(CONVERSATION_TYPES)) {
      for (const a of ['direct', 'supportive', 'challenging'] as const) { expect(typeof t.base[a]).toBe('number'); expect(t.fit[a]).toBeDefined(); }
      expect(t.textKey.startsWith('players.talk.')).toBe(true);
    }
  });
});

describe('L1.5.2 and L1.5.1 offered types', () => {
  it('follows the rung table: GA no promises and no role talks, head coach everything, release only for the head coach', () => {
    expect(mayPromise('graduate_assistant')).toBe(false);
    expect(mayPromise('position_coach')).toBe(true);
    expect(typesOffered('student_assistant', true)).toEqual(['praise']);
    expect(typesOffered('graduate_assistant', true)).not.toContain('role_definition');
    expect(typesOffered('coordinator', true)).not.toContain('release');
    expect(typesOffered('head_coach', true)).toContain('release');
  });

  it('college types are on only where players hold no contracts', () => {
    expect(typesOffered('head_coach', false)).toEqual(expect.arrayContaining(['redshirt', 'are_you_staying', 'draft_decision', 'parent_call']));
    expect(typesOffered('head_coach', true)).not.toContain('redshirt');
    expect(youthScale(1, true)).toBe(1.2);
    expect(youthScale(1, false)).toBe(1);
    expect(youthScale(3, true)).toBe(1);
  });
});

describe('L1.2.2 to L1.2.5', () => {
  it('role talk: equal +5, one below -5 (halved with a reason), two below -15 and flagged', () => {
    expect(roleTalk('starter', 'starter', 'starter', false, false)).toEqual({ roleBeliefChange: 5, flagForPersonalTalk: false, createsPromise: 'implied_starter' });
    expect(roleTalk('starter', 'rotation', 'rotation', true, false).roleBeliefChange).toBe(-2.5);
    const two = roleTalk('starter', 'situational', 'situational', true, false);
    expect([two.roleBeliefChange, two.flagForPersonalTalk]).toEqual([-15, true]);
    expect(roleTalk('starter', 'situational', 'situational', true, true).roleBeliefChange).toBe(-7.5);
    expect(roleTalk('rotation', 'starter', 'rotation', false, false).createsPromise).toBe('above_depth_chart');
  });

  it('every role-step drop raises exactly one prompt; skipping it writes the found-out memory', () => {
    const before = new Map<number, Role>([[1, 'starter'], [2, 'rotation'], [3, 'situational']]);
    const after = new Map<number, Role>([[1, 'rotation'], [2, 'starter'], [3, 'special_teams_core']]);
    const prompts = demotionPrompts(before, after, false);
    expect(prompts.map((p) => p.playerId)).toEqual([1, 3]);
    expect(demotionMemory(prompts[0]!, 'say_nothing')).toEqual({ kind: 'found_out_depth_chart' });
    expect(demotionMemory(prompts[0]!, 'tell_now')).toEqual({ kind: 'told_before_depth_chart' });
    expect(demotionMemory({ ...prompts[0]!, duringGame: true }, 'say_nothing').strength).toBe(-15);
  });

  it('praise decays by half per earlier praise within four weeks; the suggested list never exceeds six', () => {
    expect(praiseStrength(8, [D(2030, 1), D(2030, 8)], D(2030, 15))).toBe(2);
    expect(praiseStrength(8, [D(2030, 1)], D(2030, 60))).toBe(8);
    expect(suggestedTalks(Array.from({ length: 10 }, (_, i) => ({ playerId: i, priority: i }))).length).toBe(6);
    expect(correctionReason(false, true)).toBe('false');
    expect(neglectRespectLoss(80, true, false)).toBe(-1);
    expect(neglectRespectLoss(30, true, false)).toBe(0);
  });

  it('imported people never bring a personal matter; with the door shut requests stop within three weeks', () => {
    expect(mayBringPersonalMatter({ origin: 'imported' }, 10, { unanswered: 0 })).toBe(false);
    let s = { unanswered: 0 };
    let asked = 0;
    for (let week = 0; week < 3; week++) if (mayBringPersonalMatter({ origin: 'generated' }, 0, s)) { asked++; s = afterPersonalRequest(s, false); }
    expect(asked).toBe(2);
    expect(mayBringPersonalMatter({ origin: 'generated' }, 0, s)).toBe(false);
  });
});
