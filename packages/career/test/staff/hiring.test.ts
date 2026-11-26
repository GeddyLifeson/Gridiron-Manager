import { describe, expect, it } from 'vitest';
import {
  acceptChance, candidateScore, candidateWindow, compatibility, computeTies, coachingTree, contactIsTampering, diverseCheck,
  interview, interviewFits, moveKind, network, orderCandidates, permissionRule, rankCandidates, referenceCall, revealedNeeds,
  runSearch, searchRole, tieBetween, witnesses, type CandidateFile, type CandidateScoreInput, type ClubCycle, type Offer,
} from '../../src/staff/index.ts';
import { COLLEGE_RULES, D0, NEEDS, PRO_RULES, row, threshold } from './fixtures.ts';

const alive = (round: 'wild_card' | 'divisional' | 'conference' | 'championship', o: Partial<{ hadBye: boolean; daysSinceLastGame: number; daysSinceRegularSeasonEnd: number; championshipByeWeek: boolean }> = {}): ClubCycle =>
  ({ kind: 'alive', round, hadBye: false, daysSinceLastGame: 0, daysSinceRegularSeasonEnd: 0, championshipByeWeek: false, ...o });

describe('E2.3.1 candidate window', () => {
  it('college record (no keys): every coach reachable any time', () => {
    for (const c of [alive('conference'), { kind: 'regular_season', weeksLeft: 5, employerConsents: false } as ClubCycle]) {
      expect(candidateWindow(c, COLLEGE_RULES)).toMatchObject({ request: true, virtual: true, inPerson: true, signing: true });
    }
  });
  it('regular season: no requests; consent interview only when the key allows it', () => {
    const c: ClubCycle = { kind: 'regular_season', weeksLeft: 2, employerConsents: true };
    expect(candidateWindow(c, PRO_RULES)).toMatchObject({ request: false, virtual: false, signing: false });
    const consent = { ...PRO_RULES, lateSeasonConsent: true };
    expect(candidateWindow(c, consent).virtual).toBe(true);
    expect(candidateWindow({ ...c, weeksLeft: 3 }, consent).virtual).toBe(false);
  });
  it('season over: virtual from the configured day, in person after the divisional round', () => {
    expect(candidateWindow({ kind: 'season_over', daysSinceLastGame: 2, divisionalRoundOver: false }, PRO_RULES)).toMatchObject({ request: true, virtual: false, inPerson: false, signing: true });
    expect(candidateWindow({ kind: 'season_over', daysSinceLastGame: 3, divisionalRoundOver: false }, PRO_RULES)).toMatchObject({ virtual: true, inPerson: false });
    expect(candidateWindow({ kind: 'season_over', daysSinceLastGame: 9, divisionalRoundOver: true }, PRO_RULES).inPerson).toBe(true);
  });
  it('playoff clubs: bye week, wild-card winner, conference and championship rows', () => {
    expect(candidateWindow(alive('wild_card', { hadBye: true, daysSinceRegularSeasonEnd: 3 }), PRO_RULES).virtual).toBe(true);
    expect(candidateWindow(alive('wild_card', { hadBye: false, daysSinceRegularSeasonEnd: 5 }), PRO_RULES).virtual).toBe(false);
    expect(candidateWindow(alive('divisional', { hadBye: true, daysSinceLastGame: 20 }), PRO_RULES).virtual).toBe(false);
    expect(candidateWindow(alive('divisional', { hadBye: false, daysSinceLastGame: 3 }), PRO_RULES).virtual).toBe(true);
    expect(candidateWindow(alive('conference', { daysSinceLastGame: 6 }), PRO_RULES).virtual).toBe(false);
    expect(candidateWindow(alive('championship', { championshipByeWeek: true }), PRO_RULES).virtual).toBe(true);
    expect(candidateWindow(alive('championship'), PRO_RULES).virtual).toBe(false);
    for (const r of ['wild_card', 'divisional', 'conference', 'championship'] as const) {
      const w = candidateWindow(alive(r, { hadBye: true, daysSinceRegularSeasonEnd: 9, championshipByeWeek: true }), PRO_RULES);
      expect(w.inPerson).toBe(false);
      expect(w.signing).toBe(false); // agreed in principle only (rule 6)
    }
  });
  it('playoff interview cap per hiring club', () => {
    const w = candidateWindow(alive('divisional', { daysSinceLastGame: 4 }), PRO_RULES);
    expect(interviewFits(w, 120, 60, PRO_RULES)).toBe(true);
    expect(interviewFits(w, 150, 60, PRO_RULES)).toBe(false);
    expect(interviewFits(candidateWindow({ kind: 'not_employed' }, PRO_RULES), 500, 60, PRO_RULES)).toBe(true);
  });
});

describe('L4.2.1 permission and tampering', () => {
  it('classifies moves by rung', () => {
    expect(moveKind(5, 7, false)).toBe('promotion');
    expect(moveKind(5, 5, false)).toBe('lateral');
    expect(moveKind(7, 9, true)).toBe('head_coach');
  });
  it('promotion may not be refused, lateral may (rule keys); college needs no permission', () => {
    expect(permissionRule('promotion', PRO_RULES)).toMatchObject({ needed: true, mayRefuse: false });
    expect(permissionRule('lateral', PRO_RULES)).toMatchObject({ needed: true, mayRefuse: true });
    expect(permissionRule('lateral', { ...PRO_RULES, lateralBlockAllowed: false }).mayRefuse).toBe(false);
    expect(permissionRule('promotion', COLLEGE_RULES).needed).toBe(false);
  });
  it('contact without permission is tampering only where permission is required', () => {
    expect(contactIsTampering(PRO_RULES, false, true)).toBe(true);
    expect(contactIsTampering(PRO_RULES, true, true)).toBe(false);
    expect(contactIsTampering(PRO_RULES, false, false)).toBe(false);
    expect(contactIsTampering(COLLEGE_RULES, false, true)).toBe(false);
  });
});

describe('L4.2.3 coaching graph', () => {
  const hist = [
    row(1, 10, 'job:pro.head_coach', 2020, 2023),
    row(2, 10, 'job:pro.coordinator.offense', 2020, 2021),
    row(3, 10, 'job:pro.position_coach.qb', 2022, 2023),
    row(4, 11, 'job:pro.head_coach', 2020, null),
  ];
  const ties = computeTies(hist, D0);
  it('ties come only from shared staffs; no shared staff, no tie', () => {
    expect(tieBetween(ties, 1, 4)).toBe(0);
    expect(tieBetween(ties, 2, 3)).toBe(0);
  });
  it('grows per shared season (direct report adds), decays apart, holds the floor', () => {
    // 1 and 2: 2020, 2021 direct (6+3 each) = 18, then 2022..2026 apart: 5 x 2 = 10 off -> 8, floor 10.
    expect(tieBetween(ties, 1, 2)).toBe(10);
    // 1 and 3: 2022, 2023 (QB coach reports to OC, not HC): 12, then 2024..2026: -6 -> 6, floor 10.
    expect(tieBetween(ties, 1, 3)).toBe(10);
    const recent = computeTies(hist, { seasonYear: 2023, dayIndex: 100 });
    expect(tieBetween(recent, 1, 3)).toBe(12);
    expect(tieBetween(recent, 1, 2)).toBe(14);
  });
  it('shows the years behind each tie and builds the tree', () => {
    expect(network(ties, 1).find((t) => t.a === 2 || t.b === 2)!.together.map((t) => t.seasonYear)).toEqual([2020, 2021]);
    const tree = coachingTree(hist, 1, D0, (r) => r.catalogueId === 'job:pro.head_coach');
    expect([...tree.keys()].sort()).toEqual([2, 3]);
    expect(orderCandidates([4, 3, 9], ties, 1)).toEqual([3, 4, 9]);
  });
  it('witness copies go only to ties above 60', () => {
    const long = [row(5, 12, 'job:pro.head_coach', 2010, null), row(6, 12, 'job:pro.coordinator.defense', 2010, null), row(7, 12, 'job:pro.analyst', 2025, null)];
    const t = computeTies(long, D0);
    expect(witnesses(t, 5)).toEqual([6]);
  });
});

const FILE: CandidateFile = {
  personId: 50, currentRung: 5,
  units: [{ seasonYear: 2025, unitKey: 'qb_room', evidenceEventIds: [101, 102] }],
  rooms: [{ weeks: 10, knowledgeGainRatio: 1.1, assignmentErrorRate: 0.04, evidenceEventIds: [201] }],
  callersWorkedFor: [1, 4], schemeFamily: 'west_coast', knownTerms: ['spot', 'stick', 'y_cross'],
  schemeAnswers: { third_and_long: { textKey: 'k6.answer.third_long_sail', evidenceEventIds: [301] } },
  wouldBring: [60], needs: NEEDS,
};

describe('L4.2.2 interviews', () => {
  const base = { file: FILE, situations: ['third_and_long', 'red_zone'], installedTerms: ['spot', 'stick', 'mesh', 'dagger'], relearnWeeks: (u: number) => u * 2, familiarity: 20 };
  it('at most four topics', () => {
    expect(() => interview({ ...base, topics: ['scheme', 'teaching', 'references', 'terminology', 'wants'] })).toThrow();
  });
  it('every note links to record rows or says there are none; no numeric overall anywhere', () => {
    const r = interview({ ...base, topics: ['scheme', 'teaching', 'terminology', 'wants'] });
    expect(r.notes.find((n) => n.textKey === 'k6.answer.third_long_sail')!.evidenceEventIds).toEqual([301]);
    expect(r.notes.find((n) => n.topic === 'scheme' && n.params.situation === 'red_zone')!.textKey).toBe('staff.interview.scheme_no_answer');
    const teach = r.notes.find((n) => n.topic === 'teaching')!;
    expect(teach.textKey).toBe('staff.interview.teaching_small_sample');
    expect(teach.evidenceEventIds).toEqual([201]);
    expect(r.notes.find((n) => n.topic === 'terminology')!.params).toMatchObject({ carryOver: 2, unknown: 2, weeks: 4 });
    for (const n of r.notes) for (const k of Object.keys(n.params)) expect(k).not.toMatch(/overall|rating|grade/i);
    expect(r.familiarityAfter).toBeGreaterThan(20);
  });
  it('a candidate with no record at the level says so', () => {
    const r = interview({ ...base, file: { ...FILE, rooms: [] }, topics: ['teaching'] });
    expect(r.notes[0]!.textKey).toBe('staff.interview.teaching_no_record');
  });
  it('more familiarity reveals more of what he wants', () => {
    expect(revealedNeeds(NEEDS, 10).length).toBeLessThan(revealedNeeds(NEEDS, 100).length);
    expect(revealedNeeds(NEEDS, 10)[0]).toBe('advancement');
  });
  it('a reference tied above 70 to the candidate omits negatives', () => {
    const remarks = [{ sign: 1 as const, textKey: 'a', evidenceEventIds: [] }, { sign: -1 as const, textKey: 'b', evidenceEventIds: [] }];
    expect(referenceCall(remarks, 100, 80, threshold(0)).map((r) => r.textKey)).toEqual(['a']);
    expect(referenceCall(remarks, 100, 40, threshold(0.5)).map((r) => r.textKey)).toEqual(['a', 'b']);
    expect(referenceCall(remarks, 20, 40, threshold(0.5)).map((r) => r.textKey)).toEqual(['a']);
  });
});

describe('L4.2.4 compatibility panel', () => {
  it('same family and language costs nothing; otherwise both ways are offered with G4 weeks', () => {
    expect(compatibility({ ...FILE, knownTerms: ['spot'] }, 'west_coast', ['spot'], () => 9, false).options).toEqual([{ kind: 'learn_house', coachSlowWeeks: 0 }]);
    const p = compatibility(FILE, 'air_coryell', ['spot', 'mesh'], (u) => u * 3, true);
    expect(p.options).toEqual([{ kind: 'learn_house', coachSlowWeeks: 3 }, { kind: 'convert_side', renamedConcepts: 1, headCoachSlowWeeks: 3 }]);
  });
});

describe('Offers, scoring and searches (K7.6.1)', () => {
  const offer: Offer = { seatId: 3, rung: 7, titleKey: 'oc', years: 2, salaryCents: 100, callsPlays: false, promises: [] };
  const view = { currentRung: 5, askCents: 100, needs: NEEDS, trustInHeadCoach: 50, prospects: 0 };
  it('acceptance is bounded and rises with pay, trust and play calling', () => {
    const p = acceptChance(offer, view);
    expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1);
    expect(acceptChance({ ...offer, rung: 5, salaryCents: 80 }, view)).toBeLessThan(acceptChance({ ...offer, rung: 5, salaryCents: 120 }, view));
    expect(acceptChance({ ...offer, rung: 5 }, { ...view, trustInHeadCoach: 10 })).toBeLessThan(acceptChance({ ...offer, rung: 5 }, view));
    expect(acceptChance({ ...offer, rung: 5, callsPlays: true }, view)).toBeGreaterThan(acceptChance({ ...offer, rung: 5 }, view));
  });
  it('the user and an AI candidate with identical records and views score the same', () => {
    const input: CandidateScoreInput = { sameFamily: true, termOverlap: 0.6, viewOfQuality: 0.7, tie: 30, askCents: 50, budgetLeftCents: 200 };
    const user = { personId: 1, input }; const ai = { personId: 2, input: { ...input } };
    expect(candidateScore(user.input)).toBe(candidateScore(ai.input));
    expect(rankCandidates([ai, user])).toEqual([1, 2]); // tie broken by id, deterministic
  });
  it('familiarity bias: a known candidate outranks an equal stranger; unaffordable asks drop out', () => {
    const known: CandidateScoreInput = { sameFamily: false, termOverlap: 0.5, viewOfQuality: 0.5, tie: 20, askCents: 50, budgetLeftCents: 100 };
    expect(rankCandidates([{ personId: 9, input: { ...known, tie: 0 } }, { personId: 8, input: known }, { personId: 7, input: { ...known, askCents: 500 } }])).toEqual([8, 9]);
  });
  it('a search offers down the list until someone accepts', () => {
    const r = runSearch([5, 6, 7], (id) => ({ offer, view: { ...view, trustInHeadCoach: id === 7 ? 100 : 0, currentRung: 7 } }), threshold(0.6));
    expect(r).toEqual({ hiredPersonId: 7, offered: [5, 6, 7], declined: [5, 6] });
  });
});

describe('E2.3.1 diverse interview requirement', () => {
  const q = (id: number) => id >= 100;
  const held = [
    { personId: 100, external: true, inPerson: true, date: D0 },
    { personId: 101, external: true, inPerson: false, date: D0 },
    { personId: 5, external: true, inPerson: true, date: D0 },
  ];
  it('head coach search needs two external qualifying in-person interviews', () => {
    expect(diverseCheck('head_coach', held, q, PRO_RULES)).toMatchObject({ required: 2, counted: 1, met: false });
    expect(diverseCheck('head_coach', held, q, { ...PRO_RULES, hcExternal: 1 }).met).toBe(true);
  });
  it('coordinator needs one external; QB coach one of any; college has none', () => {
    expect(diverseCheck('coordinator', held, q, PRO_RULES).met).toBe(true);
    expect(diverseCheck('quarterback_coach', [held[2]!], q, PRO_RULES).met).toBe(false);
    expect(diverseCheck('head_coach', [], q, COLLEGE_RULES)).toMatchObject({ required: 0, met: true });
    expect(searchRole('pos:offensive_coordinator', 'coordinators')).toBe('coordinator');
    expect(searchRole('pos:position_coach.qb', 'position_coaches')).toBe('quarterback_coach');
  });
});
