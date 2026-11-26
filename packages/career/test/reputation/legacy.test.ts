// G-52 acceptance part 3: observer views (X2.3.1, E5.3), the career record and records (E5.5.1, E5.6.2),
// awards and the Hall of Fame (E5.6.1, E5.6.3), and the career summary (E5.5.2, S11.3.1).
import { describe, expect, it } from 'vitest';
import { computeStatus, type MemoryRow, type RelationshipEdge } from '@gm/schema';
import {
  FACT, REPUTATION_FACTS, buildSummary, byLevel, caseScore, eligible, electionChance, factStatus, headCoachLines, milestonesCrossed, mislabels, observerStanding,
  outlook, passed, proHallFromFacts, recordsTable, referenceCall, runBallot, tailAtLeast, unsourcedLines, voteAward, votesNeeded,
  type GameResult, type HallCase, type LabelEntry,
} from '../../src/reputation/index.ts';
import { COLLEGE, MATH, PRO, levelKeyOf, testStream } from './fixtures.ts';

const D = (y: number, d: number) => ({ seasonYear: y, dayIndex: d });

describe('X2.3.1 observer views', () => {
  const mem = (holderId: number, sign: -1 | 0 | 1, eventId: number): MemoryRow => ({ holderId, eventId, aboutPersonId: 1, aboutTeamId: null, category: 'game', sign, strength: 50, layer: 'permanent', formed: D(2030, 1), lastFelt: D(2030, 1) });
  const edge: RelationshipEdge = { a: 7, b: 1, bTeamId: null, kind: 'worked_under', strength: 80, sign: 'warm', since: D(2028, 1), lastContact: D(2030, 1), basisEventIds: [41] };
  const label: LabelEntry = { labelId: 'fourth_down_aggressive', basis: 'record', held: true, weight: 1, result: { evidenceIds: [5, 6] } };

  it('an observer with no knowledge holds the audience value; first-hand outweighs public 2 to 1', () => {
    const none = observerStanding({ observerId: 9, subjectId: 1, audienceValue: 40, audience: 'administrators_and_owners', memories: [], edges: [], labels: [] });
    expect(none.value).toBe(40);
    expect(none.firstHandValue).toBeNull();
    const fh = observerStanding({ observerId: 7, subjectId: 1, audienceValue: 40, audience: 'administrators_and_owners', memories: [mem(7, 1, 30)], edges: [edge], labels: [label] });
    expect(fh.firstHandValue).toBeCloseTo(50 + 5 + 16, 9);
    expect(fh.value).toBeCloseTo((2 * 71 + 40) / 3, 9);
    expect(fh.lines.flatMap((l) => l.evidenceIds)).toEqual(expect.arrayContaining([30, 41, 5, 6]));
  });

  it('deleting an observer\'s memory rows changes his view and nothing else', () => {
    const all = [mem(7, -1, 30), mem(8, 1, 31)];
    const v8 = (memories: MemoryRow[]) => observerStanding({ observerId: 8, subjectId: 1, audienceValue: 50, audience: 'peers', memories, edges: [], labels: [] }).value;
    const v7 = (memories: MemoryRow[]) => observerStanding({ observerId: 7, subjectId: 1, audienceValue: 50, audience: 'peers', memories, edges: [], labels: [] }).value;
    const without7 = all.filter((m) => m.holderId !== 7);
    expect(v7(without7)).not.toBe(v7(all));
    expect(v8(without7)).toBe(v8(all));
  });
});

describe('E5.3.2 lag, error and correction', () => {
  it('flags labels the public has not seen and labels that no longer match', () => {
    expect(mislabels([{ labelId: 'conservative', held: true }], [{ labelId: 'conservative', held: false }, { labelId: 'develops_qbs', held: true }])).toEqual([
      { labelId: 'conservative', flag: 'no_longer_matches' },
      { labelId: 'develops_qbs', flag: 'not_seen_by_public' },
    ]);
  });

  it('a reference call from a trusted contact changes that party\'s copy and no one else\'s', () => {
    const copies = new Map([[100, [{ labelId: 'conservative', held: true }]], [200, [{ labelId: 'conservative', held: true }]]]);
    const call = { partyId: 100, contactId: 5, partyTrust: 80, vouchFor: ['conservative'], full: [{ labelId: 'conservative', held: false }] };
    const after = referenceCall(copies, call);
    expect(after.get(100)).toEqual([{ labelId: 'conservative', held: false }]);
    expect(after.get(200)).toEqual(copies.get(200));
    expect(referenceCall(copies, { ...call, partyTrust: 10 }).get(100)).toEqual(copies.get(100));
  });
});

describe('E5.5.1 career record and E5.6.2 records', () => {
  const g = (eventId: number, y: number, d: number, teamId: number, competitionId: number, result: GameResult['result'], extra: Partial<GameResult> = {}): GameResult =>
    ({ eventId, date: D(y, d), teamId, competitionId, result, postseason: false, title: false, ...extra });
  const spells = [
    { personId: 1, teamId: 10, from: D(2030, 0), to: D(2031, 300) },
    { personId: 1, teamId: 20, from: D(2032, 0), to: null },
    { personId: 2, teamId: 10, from: D(2031, 301), to: null },
  ];
  const games = [
    g(1, 2030, 50, 10, COLLEGE, 'win'), g(2, 2030, 57, 10, COLLEGE, 'loss'), g(3, 2031, 50, 10, COLLEGE, 'win', { postseason: true, title: true }),
    g(4, 2032, 50, 10, COLLEGE, 'win'), g(5, 2032, 50, 20, PRO, 'win'), g(6, 2032, 57, 20, PRO, 'tie'), g(7, 2032, 64, 20, PRO, 'win'),
  ];

  it('head coach totals equal the games on the dates he held the job; levels never mix', () => {
    const { lines } = headCoachLines({ spells, games });
    const lv = byLevel(lines, 1, levelKeyOf);
    expect(lv.get('college')).toMatchObject({ wins: 2, losses: 1, ties: 0, titles: 1, postseasonWins: 1 });
    expect(lv.get('pro')).toMatchObject({ wins: 2, losses: 0, ties: 1 });
    expect(byLevel(lines, 2, levelKeyOf).get('college')!.wins).toBe(1);
  });

  it('a suspended coach does not get those games; vacated games are removed and flagged', () => {
    const { lines, vacated } = headCoachLines({ spells, games, acting: new Map([[5, 9]]), vacated: new Set([1]) });
    expect(byLevel(lines, 1, levelKeyOf).get('pro')!.wins).toBe(1);
    expect(byLevel(lines, 9, levelKeyOf).get('pro')!.wins).toBe(1);
    expect(byLevel(lines, 1, levelKeyOf).get('college')!.wins).toBe(1);
    expect(vacated).toEqual([1]);
  });

  it('tables rebuild exactly, need 80 games for win share, and report who was passed', () => {
    const { lines } = headCoachLines({ spells, games });
    expect(recordsTable(lines, 'college', 'wins', levelKeyOf)).toEqual(recordsTable(headCoachLines({ spells, games: [...games].reverse() }).lines, 'college', 'wins', levelKeyOf));
    expect(recordsTable(lines, 'college', 'win_share', levelKeyOf)).toEqual([]);
    expect(recordsTable(lines, 'college', 'win_share', levelKeyOf, { 'records.winShareMinGames': 1 }).length).toBe(2);
    const before = [{ personId: 1, value: 99, rank: 2 }, { personId: 2, value: 100, rank: 1 }];
    const after = [{ personId: 1, value: 101, rank: 1 }, { personId: 2, value: 100, rank: 2 }];
    expect(passed(before, after, 1)).toEqual([2]);
    expect(milestonesCrossed(99, 201)).toEqual([100, 200]);
  });
});

describe('E5.6.1 awards', () => {
  it('across 200 seasons the best record wins less than half the time: surprise wins', () => {
    const rng = testStream(7);
    let bestWon = 0;
    for (let s = 0; s < 200; s++) {
      const cands = [
        { personId: 1, teamId: 1, winsAboveProjection: 1, improvement: 1, place: 3 },   // best record, expected to be good
        { personId: 2, teamId: 2, winsAboveProjection: 4, improvement: 5, place: 1 },   // surprise team
        { personId: 3, teamId: 3, winsAboveProjection: 3, improvement: 2, place: 1 },
      ];
      if (voteAward(cands, 50, rng).winnerId === 1) bestWon += 1;
    }
    expect(bestWon).toBeLessThan(100);
  });
});

describe('E5.6.3 the Hall of Fame case', () => {
  const rules = proHallFromFacts();
  const base: HallCase = { personId: 1, titles: 0, wins: 60, postseasonWins: 0, winShare: 0.42, treeHeadCoaches: 0, conductFindings: 0, imported: false, mediaValue: 50, lastSeasonYear: 2040 };

  it('reads its numbers from fact rows with computed statuses', () => {
    for (const r of REPUTATION_FACTS) expect(r.status).toBe(computeStatus(r));
    expect(factStatus(FACT.hallElectShare)).toBe('Verified');
    expect(factStatus(FACT.hallCoachWaitSeasons)).toBe('Verified');
    expect(rules.electShare).toBe(0.8);
    expect(votesNeeded(rules)).toBe(Math.ceil(0.8 * rules.committeeSize));
  });

  it('zero titles and a losing record is never elected in 1,000 trials', () => {
    const rng = testStream(11);
    let elected = 0;
    for (let i = 0; i < 1000; i++) elected += runBallot([base], 2045, rules, rng, MATH).elected.length;
    expect(elected).toBe(0);
  });

  it('election happens only with at least 80 percent yes', () => {
    const great: HallCase = { ...base, titles: 4, wins: 250, postseasonWins: 20, winShare: 0.65, treeHeadCoaches: 5 };
    const rng = testStream(3);
    for (let i = 0; i < 200; i++) {
      const r = runBallot([great], 2045, rules, rng, MATH);
      for (const id of r.elected) expect(r.yesShare.get(id)!).toBeGreaterThanOrEqual(0.8);
      for (const id of r.finalists) if (!r.elected.includes(id)) expect(r.yesShare.get(id)!).toBeLessThan(0.8);
    }
    expect(outlook(great, rules, MATH).outlook).toBe('near_certain');
    expect(outlook(base, rules, MATH).outlook).toBe('no_case');
  });

  it('no imported person carries a conduct penalty; a scandal lowers a generated coach', () => {
    const c = { ...base, titles: 2, conductFindings: 2 };
    expect(caseScore({ ...c, imported: true })).toBe(caseScore({ ...c, conductFindings: 0 }));
    expect(caseScore(c)).toBeLessThan(caseScore({ ...c, conductFindings: 0 }));
  });

  it('waits one full season out of the game; one coach finalist per class', () => {
    expect(eligible(base, 2041, rules)).toBe(false);
    expect(eligible(base, 2042, rules)).toBe(true);
    const r = runBallot([base, { ...base, personId: 2, titles: 1 }], 2045, rules, testStream(1), MATH);
    expect(r.nominated).toEqual([2, 1]);
    expect(r.finalists).toEqual([2]);
  });

  it('binomial tail is exact at the edges', () => {
    expect(tailAtLeast(28, 23, 1)).toBe(1);
    expect(tailAtLeast(28, 23, 0)).toBe(0);
    expect(tailAtLeast(2, 1, 0.5)).toBeCloseTo(0.75, 12);
    expect(electionChance(base, rules, MATH)).toBeLessThan(1e-12);
  });
});

describe('E5.5.2 the career summary', () => {
  const recordByLevel = new Map([['pro', { wins: 10, losses: 6, ties: 1, postseasonWins: 1, postseasonLosses: 1, titles: 0, gameIds: [1, 2, 3] }]]);
  const input = {
    personId: 1, origin: 'user' as const, ownCoach: true, recordByLevel,
    honours: [{ eventId: 9, awardKind: 'head_coach', seasonYear: 2031 }], book: [{ labelId: 'x', evidenceIds: [4] }], tree: null,
    decisions: [{ eventId: 12, verdict: 'best' as const }], standing: [{ category: 'wins', level: 'pro', rank: 14, sourceIds: [1] }], hall: { outlook: 'borderline' as const },
    privateLines: { money: [{ textKey: 'money.net', params: {}, sourceIds: [77] }], family: [{ textKey: 'family.line', params: {}, sourceIds: [78] }] },
    publicMoneyLines: [{ textKey: 'money.public', params: {}, sourceIds: [79] }],
  };

  it('every figure matches its source and links to it; no overall score', () => {
    const s = buildSummary(input);
    const rec = s.sections.get('record')![0]!;
    expect(rec.params).toMatchObject({ wins: 10, losses: 6, ties: 1, games: 17 });
    expect(rec.sourceIds).toEqual([1, 2, 3]);
    expect(unsourcedLines(s)).toEqual([]);
    expect(s.sections.get('money')![0]!.textKey).toBe('money.net');
    expect(JSON.stringify([...s.sections])).not.toMatch(/overall|grade|score/);
  });

  it('an imported person\'s summary holds no family, health or money text', () => {
    const s = buildSummary({ ...input, origin: 'imported', ownCoach: false });
    expect(s.sections.has('money')).toBe(false);
    expect(s.sections.has('family')).toBe(false);
    expect(s.sections.has('time')).toBe(false);
  });

  it('another coach shows public money events only', () => {
    const s = buildSummary({ ...input, origin: 'generated', ownCoach: false });
    expect(s.sections.get('money')!.map((l) => l.textKey)).toEqual(['money.public']);
    expect(s.sections.has('family')).toBe(false);
  });
});
