// G-43 acceptance: awards and records computed from logs; notability keep line per X4.2.
import { describe, expect, it } from 'vitest';
import { FactFile, ParamFile, RuleKeyManifest, computeStatus, scanForbiddenJson } from '@gm/schema';
import factsJson from '../../src/awards/facts.json' with { type: 'json' };
import ruleValuesJson from '../../src/awards/rule-values.json' with { type: 'json' };
import * as A from '../../src/awards/index.ts';
import { MATH, candidates, ev, rng, season } from './fixtures.ts';

const PRO = A.proposedRules('pro_2027');
const PRO_OLD = A.proposedRules('pro_2026');
const COLLEGE = A.proposedRules('college_2027');

describe('Q6 fact rows and proposed rule values', () => {
  it('rows parse and every stored status is the computed status', () => {
    FactFile.parse(factsJson);
    for (const r of A.HONOURS_FACTS) expect(r.status, r.id).toBe(computeStatus(r));
    expect(new Set(A.HONOURS_FACTS.map((r) => r.id)).size).toBe(A.HONOURS_FACTS.length);
  });
  it('every proposed rule value cites a fact row with the same value, at least Rulebook only', () => {
    for (const s of A.PROPOSED_RULE_SETS) {
      for (const v of s.values) {
        const f = A.fact(v.factId);
        expect(f.value, `${s.id} ${v.key}`).toBe(v.value);
        expect(['Verified', 'Rulebook only'], v.factId).toContain(A.factStatus(v.factId));
      }
      expect(A.ruleValueProblems(Object.fromEntries(s.values.map((v) => [v.key, v.value])))).toEqual([]);
    }
  });
  it('pro sets hold every key the election and voting need; the college set lacks the election keys (research owed)', () => {
    const need = [A.KEY.panelSize, A.KEY.ballotPoints, A.KEY.voteTiming, A.KEY.hallClassMax, A.KEY.hallVoteShare, A.KEY.hallCommittee, A.KEY.hallPlayerWait, A.KEY.hallCoachWait];
    expect(A.ruleValueProblems(PRO, need)).toEqual([]);
    expect(A.ruleValueProblems(PRO_OLD, need)).toEqual([]);
    expect(A.ruleValueProblems(COLLEGE, [A.KEY.hallCommittee])).toEqual(['missing hall.committee_voting']);
  });
  it('manifest, params, event types and data files validate; no forbidden keys', () => {
    RuleKeyManifest.parse(A.RULE_KEYS);
    ParamFile.parse(A.PARAMS);
    expect(A.HONOUR_EVENT_TYPES).toHaveLength(Object.keys(A.HONOUR).length);
    for (const t of A.HONOUR_EVENT_TYPES) { expect(t.harmClass).toBe('none'); expect(t.importedAllowed).toBe(true); }
    for (const [n, j] of [['facts.json', factsJson], ['rule-values.json', ruleValuesJson]] as const) expect(scanForbiddenJson(n, j)).toEqual([]);
  });
});

describe('X4 notability', () => {
  it('a 20-point underdog win outscores a favourite win in the same week, identically on replay (X4.1.1)', () => {
    const under = A.scoreEvent('game_result', 'game', { expectation: 0.2, outcome: 1 });
    const fav = A.scoreEvent('game_result', 'game', { expectation: 0.8, outcome: 1 });
    expect(under).toBeGreaterThan(fav);
    expect(A.scoreEvent('game_result', 'game', { expectation: 0.2, outcome: 1 })).toBe(under);
  });
  it('terms add as X4.1.1 rule 2 states and cap at 100', () => {
    const p = A.scoreParts('game_result', 'game', { expectation: 0.5, outcome: 1, stakes: ['title', 'rivalry'], streak: 6, record: 'level', edge: { kind: 'rival', formedInSave: true, prior: false }, firstOrLast: true });
    expect([p.surprise, p.stakes, p.streak, p.record, p.relationship, p.firstOrLast]).toEqual([20, 25, 15, 30, 15, 10]);
    expect(p.score).toBe(100);
    expect(A.scoreEvent('timeout_used', 'game', {})).toBe(0);
    expect(A.scoreEvent('hired', 'career', { rung: 'head_coach' })).toBeGreaterThan(A.scoreEvent('hired', 'career', { rung: 'position_coach' }));
  });
  it('band edges belong to the higher band and the keep line stays inside 50 to 70 (X4.2.1)', () => {
    expect([29, 30, 59, 60, 79, 80].map(A.bandOf)).toEqual(['routine', 'noted', 'noted', 'notable', 'notable', 'historic']);
    expect(A.keepLine()).toBe(60);
    expect(A.keepLine(90)).toBe(70);
    expect(A.keepLine(10)).toBe(50);
    expect(A.isKept(ev('x', 1, 2030, 60))).toBe(true);
    expect(A.isKept(ev('x', 1, 2030, 59))).toBe(false);
  });
  it('protected people: the relationship term needs a save-formed edge and the historic cap holds (X4.4.1)', () => {
    const edge = { kind: 'rival' as const, formedInSave: false, prior: false };
    expect(A.edgeCounts({ edge, protectedSides: { a: true, b: false } })).toBe(false);
    expect(A.edgeCounts({ edge, protectedSides: { a: true, b: true } })).toBe(false);
    expect(A.edgeCounts({ edge: { ...edge, prior: true }, protectedSides: { a: true, b: true } })).toBe(true);
    const ctx = { expectation: 0.4, outcome: 1, stakes: ['title'], edge: { kind: 'teammate' as const, formedInSave: true, prior: false }, firstOrLast: true };
    expect(A.scoreEvent('game_result', 'game', ctx)).toBeGreaterThanOrEqual(80);
    const capped = A.scoreParts('game_result', 'game', { ...ctx, protectedActor: true, protectedSides: { a: true, b: false } });
    expect(capped.score).toBeLessThan(80);
    // Football alone past 80: no cap.
    expect(A.scoreEvent('game_result', 'game', { expectation: 0, outcome: 1, stakes: ['title'], record: 'team', protectedActor: true })).toBeGreaterThanOrEqual(80);
  });
  it('an interviewer cites the candidate\'s highest-scoring recent event (X4.3.1)', () => {
    const rows = [ev('a', 7, 2030, 65), ev('b', 7, 2031, 88), ev('c', 8, 2031, 95), ev('d', 7, 2020, 99)];
    const got = A.forConsumer(rows, 'interview', undefined, { candidateId: 7, season: 2032 });
    expect(got[0]!.type).toBe('b');
    expect(got.map((e) => e.type)).toEqual(['b', 'a']);
  });
  it('inbox: single items need score plus closeness at 70; the digest is capped at 10 (X4.3.2)', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ev('n', i + 1, 2030, 61));
    rows.push(ev('own', 99, 2030, 45));
    const w = A.inboxWeek(rows, (e) => ({ ownTeam: e.type === 'own', edge: false, conference: false }));
    expect(w.single.map((e) => e.type)).toEqual(['own']);
    expect(w.digest).toHaveLength(10);
  });
});

describe('X4.2.2 rollups', () => {
  const rows = [
    ev(A.HONOUR.allLeague, 5, 2030, 40, { slot: 'QB', team: 1, points: 400 }),
    ev(A.HONOUR.allLeague, 5, 2031, 40, { slot: 'QB', team: 2, points: 90 }),
    ev(A.HONOUR.allStar, 5, 2031, 25, { slot: 'QB', share: 0.4 }),
    ev(A.HONOUR.award, 5, 2031, 70, { award: 'mvp', place: 1, points: 300, firstPlaceVotes: 20, voters: 50, shared: false }),
    ev('title_won', 5, 2031, 85),
    ...Array.from({ length: 12 }, () => ev('game_result', 5, 2031, 50, {}, 200)),
  ];
  it('season counters, ordering and rebuild are stable', () => {
    const s = A.seasonRollups(rows);
    const y31 = s.find((r) => r.seasonYear === 2031)!;
    expect(y31.honourCounters).toEqual({ all_league_second: 1, all_star: 1, major_award: 1, title: 1 });
    expect(y31.topEventIds).toHaveLength(10);
    expect(y31.topEventIds[0]).toBe(rows[4]!.id);
    expect(A.seasonRollups([...rows].reverse())).toEqual(s);
  });
  it('the career rollup equals the sum of season rollups; a vacated title stays in its season but leaves the career', () => {
    const c = A.careerRollup(5, rows);
    expect(c.honourCounters).toEqual({ all_league_first: 1, all_league_second: 1, all_star: 1, major_award: 1, title: 1 });
    const vac = ev('result_vacated', 1, 2033, 30, {}, 10, { causeId: rows[4]!.id });
    const c2 = A.careerRollup(5, [...rows, vac]);
    expect(c2.honourCounters['title']).toBe(0);
    expect(A.seasonRollups([...rows, vac]).find((r) => r.subjectId === 5 && r.seasonYear === 2031)!.honourCounters['vacated']).toBe(1);
  });
});

describe('C9.1.1 weekly honours', () => {
  const lines = season(11, 2030);
  it('one winner per category per group per week, replayable', () => {
    const picks = A.pickWeekly(lines, rng(3));
    expect(picks).toHaveLength(17 * 2 * 3);
    expect(A.pickWeekly(lines, rng(3))).toEqual(picks);
    const drafts = A.weeklyDrafts(picks, { date: { seasonYear: 2030, dayIndex: 250 }, tier: 2, source: 'sim' });
    expect(drafts[0]!.type).toBe(A.HONOUR.weekly);
  });
  it('at least 80 percent of offensive winners are quarterbacks, running backs or receivers', () => {
    expect(A.skillShare(A.pickWeekly(lines, rng(4)))).toBeGreaterThanOrEqual(A.param('weekly.skillShareMin'));
  });
});

describe('C9.1.2 and E5.6.1 voting', () => {
  const lines = season(21, 2030);
  const wins = new Map<number, number>();
  for (const l of lines) if (l.position === 'QB' && l.won) wins.set(l.teamId, (wins.get(l.teamId) ?? 0) + 1);
  const pool = candidates(lines, wins);
  const panel = A.drawPanel(PRO, ['stats', 'teamSuccess', 'narrative', 'unitRankGain'], rng(5));

  it('the panel holds the rule\'s voters and vote totals sum to voters times the ballot points', () => {
    const r = A.voteAward(A.awardSet('pro')[0]!, pool, panel, PRO, rng(6));
    expect(r.voters).toBe(50);
    expect(r.tallies.reduce((a, t) => a + t.points, 0)).toBe(50 * (10 + 5 + 3 + 2 + 1));
    expect(r.tallies.reduce((a, t) => a + t.firstPlaceVotes, 0)).toBe(50);
    expect(A.voteAward(A.awardSet('pro')[0]!, pool, panel, PRO, rng(6))).toEqual(r);
  });
  it('the most valuable player is usually a quarterback', () => {
    let qb = 0;
    for (let s = 0; s < 20; s++) {
      const l = season(100 + s, 2030);
      const r = A.voteAward(A.awardSet('pro')[0]!, candidates(l, wins), panel, PRO, rng(s));
      if (l.find((x) => x.personId === r.winners[0])!.position === 'QB') qb++;
    }
    expect(qb).toBeGreaterThan(10);
  });
  it('ties share the award', () => {
    const twin = [
      { personId: 1, teamId: 1, position: 'QB', features: { winsAboveProjection: 4, improvement: 3, postseasonPlace: 1 } },
      { personId: 2, teamId: 2, position: 'QB', features: { winsAboveProjection: 4, improvement: 3, postseasonPlace: 1 } },
    ];
    const coach = A.awardSet('pro').find((d) => d.kind === 'coach')!;
    const two = { ...PRO, [A.KEY.panelSize]: 2 };
    const panel2 = A.drawPanel(two, ['winsAboveProjection'], { next: () => 0.5 });
    // Voter 1 draws high noise for candidate 1, voter 2 for candidate 2: a split panel.
    const seq = [0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9];
    let i = 0;
    const r = A.voteAward(coach, twin, panel2, two, { next: () => seq[i++ % seq.length]! });
    expect(r.winners).toEqual([1, 2]);
    expect(r.tallies.every((t) => t.shared)).toBe(true);
  });
  it('coach of the year: surprise wins; over 200 seasons the best record wins less than half the time and winners average 3+ wins above expectation', () => {
    const coach = A.awardSet('pro').find((d) => d.kind === 'coach')!;
    const r0 = rng(77);
    let best = 0;
    let above = 0;
    const seasons = 200;
    for (let s = 0; s < seasons; s++) {
      const teams = Array.from({ length: 32 }, (_, i) => {
        const proj = 4 + r0.next() * 9;
        const winsNow = Math.max(0, Math.min(17, Math.round(proj + (r0.next() + r0.next() + r0.next() - 1.5) * 5)));
        const prior = Math.max(0, Math.min(17, Math.round(proj + (r0.next() - 0.5) * 4)));
        return { personId: i + 1, teamId: i + 1, position: 'HC', wins: winsNow, proj, features: A.coachFeatures({ wins: winsNow, projectedWins: proj, priorWins: prior, postseasonPlace: winsNow >= 10 ? 1 : 0 }) };
      });
      const p = A.drawPanel(PRO, ['winsAboveProjection', 'improvement', 'postseasonPlace'], r0);
      const r = A.voteAward(coach, teams, p, PRO, r0);
      const w = teams.find((t) => t.personId === r.winners[0])!;
      const top = Math.max(...teams.map((t) => t.wins));
      if (w.wins === top) best++;
      above += w.wins - w.proj;
    }
    expect(best / seasons).toBeLessThan(A.param('voting.coach.bestRecordShareMax'));
    expect(above / seasons).toBeGreaterThanOrEqual(A.param('voting.coach.winsAboveExpectationMin'));
  });
  it('all-league first and second teams fill each slot; all-star picks follow reputation', () => {
    const sel = A.allLeague(pool, panel, PRO, rng(8));
    const qbs = sel.filter((s) => s.slot === 'QB');
    expect(qbs.map((s) => s.team)).toEqual([A.FIRST_TEAM, A.SECOND_TEAM]);
    expect(sel.filter((s) => s.slot === 'WR' && s.team === A.FIRST_TEAM)).toHaveLength(2);
    const famous = pool.map((c) => (c.position === 'K' && c.personId === 113 ? { ...c, features: { ...c.features, reputation: 1000 } } : c));
    expect(A.allStars(famous, rng(9)).some((s) => s.personId === 113)).toBe(true);
  });
  it('award events carry the vote counts', () => {
    const r = A.voteAward(A.awardSet('pro')[0]!, pool, panel, PRO, rng(6));
    const d = A.awardDrafts(r, { date: { seasonYear: 2031, dayIndex: 30 }, competitionId: 1, tier: 3, source: 'sim' });
    expect(d.reduce((a, x) => a + (x.payload['points'] as number), 0)).toBe(50 * 21);
  });
});

describe('C9.2.1 and E5.6.2 records', () => {
  const lines = [...season(31, 2030), ...season(32, 2031)];
  const def = (id: string) => A.RECORDS_CONTENT.records.find((r) => r.id === id)!;
  it('every book recomputes identically from the lines and notes season length', () => {
    const b = A.computeBook(def('pass_yards_season'), lines);
    expect(A.computeBook(def('pass_yards_season'), [...lines].reverse())).toEqual(b);
    expect(b.entries[0]!.seasonGames).toBe(17);
    const c = A.computeBook(def('pass_yards_career'), lines);
    expect(c.entries[0]!.value).toBeGreaterThan(b.entries[0]!.value);
  });
  it('imported prior careers never enter the ranked list', () => {
    const prior = [{ holderId: 9999, value: 1e9, season: 1990, gameId: null, seasonGames: 16 }];
    const b = A.computeBook(def('pass_yards_career'), lines, {}, prior);
    expect(b.entries.some((e) => e.holderId === 9999)).toBe(false);
    expect(b.prior).toHaveLength(1);
    expect(A.mark(b)!.holderId).not.toBe(9999);
  });
  it('rate records need the minimum; team records sum player lines; max records take the longest', () => {
    const rate = A.computeBook(def('completion_share_season'), lines);
    expect(rate.entries.every((e) => e.value > 0 && e.value < 1)).toBe(true);
    const fg = A.computeBook(def('longest_field_goal'), lines);
    expect(fg.entries[0]!.value).toBeLessThanOrEqual(55);
    expect(A.computeBook(def('team_rush_yards_game'), lines).entries[0]!.holderId).toBeLessThanOrEqual(16);
  });
  it('new marks are found season by season, and a world with no history starts empty', () => {
    expect(A.mark(A.computeBook(def('rush_yards_game'), []))).toBeNull();
    const first = A.newRecords(def('pass_yards_season'), lines, 2030);
    expect(first).toHaveLength(1);
    expect(first[0]!.previous).toBe(0);
  });
  it('record watch fires near a club mark and not far from it', () => {
    const b = A.computeBook(def('rush_yards_game'), lines, { teamId: 3 });
    const m = A.mark(b)!.value;
    expect(A.recordWatch(b, 'team', 301, m - 5)).not.toBeNull();
    expect(A.recordWatch(b, 'team', 301, m / 2)).toBeNull();
  });
  it('coach tables: win share needs the minimum games, vacated wins leave the table, tables rebuild exactly', () => {
    const rows: A.CoachSeasonRow[] = [];
    for (let y = 0; y < 6; y++) rows.push({ personId: 1, season: 2020 + y, level: 'L1', teamId: 1, wins: 12, losses: 5, ties: 0, postseasonWins: 1, title: y === 2, age: 50 + y });
    rows.push({ personId: 2, season: 2020, level: 'L1', teamId: 2, wins: 16, losses: 1, ties: 0, postseasonWins: 3, title: true, age: 36 });
    rows.push({ personId: 1, season: 2026, level: 'L2', teamId: 9, wins: 10, losses: 2, ties: 0, postseasonWins: 0, title: false, age: 56, vacatedWins: 4 });
    const t = A.coachTotals(rows, 'L1', 0.5);
    expect(A.coachTotals([...rows].reverse(), 'L1', 0.5)).toEqual(t);
    expect(A.coachTable(t, 'winShare').map((x) => x.personId)).toEqual([1]);
    expect(A.coachTable(t, 'youngestTitle')[0]).toEqual({ personId: 2, value: 36, prior: false });
    expect(t.find((x) => x.personId === 1)!.longestWinningRun).toBe(6);
    const l2 = A.coachTotals(rows, 'L2', 0.5)[0]!;
    expect([l2.wins, l2.vacated]).toEqual([6, 4]);
    expect(A.milestonesCrossed('coach_wins', 95, 102)).toEqual([100]);
  });
});

describe('C9.3.1 and E5.6.3 halls', () => {
  const rollup = (h: Record<string, number>, seasons = 10): A.CareerRollup => ({ personId: 0, seasons, countsByBand: {}, honourCounters: h, topEventIds: [] });
  const coach = (id: number, o: Partial<A.CoachTotals>, extra: Partial<A.HallCandidate> = {}): A.HallCandidate => ({
    personId: id, kind: 'coach', origin: 'generated', lastSeason: 2020, active: false, age: 60, rollup: rollup({}), conductFindings: 0, regard: 0,
    coach: { personId: id, games: 200, wins: 100, losses: 100, ties: 0, winShare: 0.5, postseasonWins: 0, titles: 0, seasons: 12, vacated: 0, longestWinningRun: 0, longestTenure: 0, youngestTitleAge: null, oldestTitleAge: null, ...o },
    ...extra,
  });
  it('eligibility follows the waits: a player last active in 2021 is first eligible for the Class of 2027 (ballot after 2026)', () => {
    const p: A.HallCandidate = { personId: 1, kind: 'player', origin: 'generated', lastSeason: 2021, active: false, age: 35, rollup: rollup({ all_league_first: 1 }), conductFindings: 0, regard: 0 };
    expect(A.isEligible(p, 2025, PRO)).toBe(false);
    expect(A.isEligible(p, 2026, PRO)).toBe(true);
    expect(A.isEligible(coach(2, {}, { lastSeason: 2025 }), 2026, PRO)).toBe(true);
    expect(A.isEligible(coach(2, {}, { lastSeason: 2026 }), 2026, PRO)).toBe(false);
  });
  it('college rules: first-team requirement, window, coach games and share, age exceptions', () => {
    const p: A.HallCandidate = { personId: 1, kind: 'player', origin: 'generated', lastSeason: 2010, active: false, age: 40, rollup: rollup({}), conductFindings: 0, regard: 0 };
    expect(A.isEligible(p, 2026, COLLEGE)).toBe(false);
    expect(A.isEligible({ ...p, rollup: rollup({ all_league_first: 1 }) }, 2026, COLLEGE)).toBe(true);
    expect(A.isEligible({ ...p, lastSeason: 1960, rollup: rollup({ all_league_first: 1 }) }, 2026, COLLEGE)).toBe(false);
    const c = coach(3, { games: 150, winShare: 0.62 }, { lastSeason: 2025, age: 66 });
    expect(A.isEligible(c, 2026, COLLEGE)).toBe(false);
    expect(A.isEligible({ ...c, age: 71 }, 2026, COLLEGE)).toBe(true);
    expect(A.isEligible({ ...c, active: true, lastSeason: 2026, age: 75 }, 2026, COLLEGE)).toBe(true);
    expect(A.isEligible(coach(4, { games: 150, winShare: 0.59 }, { lastSeason: 2020 }), 2026, COLLEGE)).toBe(false);
  });
  it('a coach with zero titles and a losing record is never elected in 1,000 trials', () => {
    const c = coach(5, { wins: 90, losses: 110, winShare: 0.45 });
    const r = rng(12);
    let elected = 0;
    for (let i = 0; i < 1000; i++) if (A.runElection([c], 2026, { ...PRO, [A.KEY.hallClassMin]: 0 }, r, MATH).elected.length) elected++;
    expect(elected).toBe(0);
  });
  it('election needs the 80 percent share, and over 30 years every class stays inside the rule set bounds', () => {
    const r = rng(13);
    const pool: A.HallCandidate[] = [];
    for (let y = 0; y < 30; y++) {
      for (let k = 0; k < 12; k++) {
        const fl = Math.floor(r.next() * 8);
        pool.push({ personId: y * 100 + k + 1, kind: 'player', origin: 'generated', lastSeason: 2000 + y, active: false, age: 36, rollup: rollup({ all_league_first: fl, all_star: fl + Math.floor(r.next() * 5), major_award: r.next() < 0.1 ? 1 : 0 }, 12), conductFindings: 0, regard: r.next() - 0.5 });
      }
      const year = 2010 + y;
      const rules = year >= 2026 ? PRO : PRO_OLD;
      const cls = A.runElection(pool, year, rules, r, MATH);
      expect(cls.elected.length).toBeGreaterThanOrEqual(rules[A.KEY.hallClassMin] as number);
      expect(cls.elected.length).toBeLessThanOrEqual(rules[A.KEY.hallClassMax] as number);
      for (const f of cls.finalists) if (f.elected && !cls.filledToMinimum) expect(f.yesShare).toBeGreaterThanOrEqual(0.8);
      for (const id of cls.elected) Object.assign(pool.find((p) => p.personId === id)!, { elected: true });
    }
  });
  it('conduct findings lower the case; imported people carry no conduct penalty; outlook words follow the probability', () => {
    const great = coach(6, { titles: 3, wins: 250, winShare: 0.66, postseasonWins: 15 }, { treeHeadCoaches: 4 });
    const scandal = { ...great, conductFindings: 3 };
    expect(A.caseScore(scandal)).toBeLessThan(A.caseScore(great));
    expect(A.caseScore({ ...scandal, origin: 'imported' })).toBe(A.caseScore(great));
    expect(A.outlookOf(A.electionChance(great, PRO, rng(14), MATH))).toBe('near_certain');
    expect(A.outlookOf(A.electionChance(coach(7, { winShare: 0.45 }), PRO, rng(15), MATH))).toBe('no_case');
    expect([0.01, 0.2, 0.6, 0.9].map(A.outlookOf)).toEqual(['no_case', 'borderline', 'strong', 'near_certain']);
  });
});

describe('C9.4.1 coaching tree', () => {
  const staff: A.StaffSeason[] = [
    { headCoachId: 1, assistantId: 10, teamId: 1, season: 2020 }, { headCoachId: 1, assistantId: 10, teamId: 1, season: 2021 },
    { headCoachId: 1, assistantId: 11, teamId: 1, season: 2021 },
    { headCoachId: 1, assistantId: 12, teamId: 1, season: 2020 }, { headCoachId: 1, assistantId: 12, teamId: 1, season: 2021 },
  ];
  const jobs: A.LaterJob[] = [{ personId: 10, season: 2023, role: 'head_coach' }, { personId: 11, season: 2023, role: 'head_coach' }, { personId: 12, season: 2024, role: 'coordinator' }];
  it('edges need two full seasons; a shorter stint is worked-with; every edge maps to shared seasons', () => {
    const e = A.treeEdges(staff);
    expect(e.map((x) => [x.assistantId, x.kind])).toEqual([[10, 'tree'], [11, 'worked_with'], [12, 'tree']]);
    expect(A.treeHeadCoaches(1, e, jobs)).toEqual([10]);
  });
  it('standing differs by observer: one who lost to the assistants rates the tree higher', () => {
    const e = A.treeEdges(staff);
    const neutral = A.treeStanding(1, e, jobs, 2026);
    const beaten = A.treeStanding(1, e, jobs, 2026, (a) => (a === 10 ? 4 : 0));
    expect(beaten).toBeGreaterThan(neutral);
    expect(A.treeStanding(99, e, jobs, 2026)).toBe(0);
  });
});

describe('X4.2.3 calibration', () => {
  it('a short history is not yet measurable; a measured world reports every anchor', () => {
    expect(A.calibrationReport([]).every((r) => r.measured === null && r.ok === null)).toBe(true);
    const d: A.Draftee[] = Array.from({ length: 1000 }, (_, i) => ({ personId: i, games: i < 800 ? 10 : 0, elected: i < 11, rollup: { personId: i, seasons: 5, countsByBand: {}, topEventIds: [], honourCounters: { all_league_first: i < 41 ? 1 : 0, all_star: i < 105 ? 1 : 0 } } }));
    const rep = A.calibrationReport(d);
    expect(rep).toHaveLength(A.ANCHORS.length);
    expect(rep.find((r) => r.measure === 'hall_share')!.ok).toBe(true);
    expect(rep.find((r) => r.measure === 'played')!.ok).toBe(true);
    expect(rep.every((r) => r.provisional)).toBe(true);
    expect(A.historicSeasonCheck(40, 1000).ok).toBe(true);
  });
});
