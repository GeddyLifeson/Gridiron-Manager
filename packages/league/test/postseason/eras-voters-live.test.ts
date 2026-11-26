// Postseason eras (B12, C3.3.1, T3.5.1), poll voter panels (T3.4.1 rule 2) and the weekly live picture
// (C3.1 to C3.3, T3.3 to T3.6). Era values come from packages/league/data/postseason-eras.json and cite
// facts/postseason-eras.json (or facts/college.json); the fixtures below are FIXTURE values, not facts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FactFile, computeStatus, type FactRow } from '@gm/schema';
import {
  POSTSEASON_ERAS, eraFor, eraEnd, rulesForSeason, eraOffered, formatFromRules, createBracket, selectCollegeField,
  createPanel, panelPoll, livePicture, ERA_RULE_KEYS, type Voter, type PollState,
} from '../../src/postseason/index.ts';
import { RuleKeyManifest } from '@gm/schema';
import type { GameResult, RuleValues, TeamId } from '../../src/standings/index.ts';
import { Games, PRO_RULES, lcg, proLeague, seededDraw } from '../standings/fixture.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8'));
const rows: FactRow[] = ['postseason-eras', 'college', 'league'].flatMap((f) => FactFile.parse(read(`facts/${f}.json`)).rows);
const byId = new Map(rows.map((r) => [r.id, r]));
const statusOf = (id: string) => byId.get(id)?.status ?? null;
const ruleFile = (p: string): RuleValues => Object.fromEntries((read(p).values as { key: string; value: number | string | boolean }[]).map((v) => [v.key, v.value]));
const PRO_2026 = ruleFile('packages/rules-data/data/league/proleague_2026.json');
const COLLEGE_2026 = { ...ruleFile('packages/rules-data/data/league/collegeleague_2026.json'), 'ranking.lower_division_wins_credited': 0 };
const seq = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

describe('era data and fact rows (Q6)', () => {
  it('the era key manifest is a valid contract shape', () => {
    expect(RuleKeyManifest.safeParse(ERA_RULE_KEYS).success).toBe(true);
  });
  it('every postseason fact row stores the status its sources compute', () => {
    const own = FactFile.parse(read('facts/postseason-eras.json')).rows;
    expect(own.length).toBeGreaterThan(20);
    for (const r of own) expect(r.status, r.id).toBe(computeStatus(r));
  });
  it('every era value cites an existing row of its level, with the same value when the row has one', () => {
    for (const e of POSTSEASON_ERAS) for (const v of e.values) {
      const row = byId.get(v.factId);
      expect(row, `${e.id} ${v.key} ${v.factId}`).toBeDefined();
      expect([e.level, 'both']).toContain(row!.level);
      if (row!.value !== undefined) expect(row!.value, `${e.id} ${v.key}`).toBe(v.value);
    }
  });
  it('era ids are unique and each level starts once per year', () => {
    expect(new Set(POSTSEASON_ERAS.map((e) => e.id)).size).toBe(POSTSEASON_ERAS.length);
    expect(new Set(POSTSEASON_ERAS.map((e) => `${e.level}:${e.from}`)).size).toBe(POSTSEASON_ERAS.length);
  });
  it('prints which eras may be offered as a starting year and what each other era is short of', () => {
    const report = POSTSEASON_ERAS.map((e) => ({ id: e.id, ...eraOffered(e, statusOf) }));
    for (const r of report) console.log(`era ${r.id}: ${r.offered ? 'offered' : `not offered (${r.short.map((s) => `${s.key} ${s.factId} ${s.status}`).join('; ')})`}`);
    const offered = report.filter((r) => r.offered).map((r) => r.id);
    expect(offered).toEqual(expect.arrayContaining(['pro_2020', 'college_2024', 'college_2025', 'college_2026']));
    expect(offered).not.toContain('college_1998'); // the BCS standings are an assumption (committee ranking stands in)
  });
});

describe('B12 era lookup', () => {
  it('finds the era in force and its last season', () => {
    expect(eraFor('college', 1997)).toBeNull();
    expect(eraFor('college', 1998)!.id).toBe('college_1998');
    expect(eraFor('college', 2013)!.id).toBe('college_1998');
    expect(eraFor('college', 2014)!.id).toBe('college_2014');
    expect(eraFor('college', 2024)!.id).toBe('college_2024');
    expect(eraFor('college', 2031)!.id).toBe('college_2027');
    expect(eraFor('pro', 1989)).toBeNull();
    expect(eraFor('pro', 2019)!.id).toBe('pro_1990');
    expect(eraEnd(eraFor('pro', 1990)!)).toBe(2019);
    expect(eraEnd(eraFor('pro', 2026)!)).toBeNull();
    expect(rulesForSeason(PRO_2026, 'pro', 1985)).toBeNull();
  });
  it('every era laid over the 2026 file gives a legal bracket of the right size', () => {
    const want: Record<string, [number, number]> = {
      pro_1990: [6, 2], pro_2020: [7, 1], college_1998: [2, 0], college_2014: [4, 0], college_2024: [12, 4], college_2025: [12, 4], college_2026: [12, 4], college_2027: [24, 8],
    };
    for (const e of POSTSEASON_ERAS) {
      const rules = rulesForSeason(e.level === 'pro' ? PRO_2026 : COLLEGE_2026, e.level, e.from)!;
      const f = formatFromRules(rules);
      expect([f.fieldSize, f.byes], e.id).toEqual(want[e.id]);
      const b = createBracket(f, [{ groupId: 0, seeds: seq(1, f.fieldSize) }]);
      expect(b.games.length).toBeGreaterThan(0);
    }
  });
  it('BCS: one game between the top two of the ranking, at a neutral site', () => {
    const rules = rulesForSeason(COLLEGE_2026, 'college', 2005)!;
    const field = selectCollegeField({ ranking: seq(1, 30), conferences: [{ conferenceId: 1, power: true, champion: 9, teamIds: [9, 10] }], independents: [] }, rules);
    expect(field.seeds).toEqual([1, 2]);
    const b = createBracket(formatFromRules(rules), [{ groupId: 0, seeds: field.seeds }]);
    expect(b.games).toHaveLength(1);
    expect(b.games[0]!.host).toBeNull();
  });
});

describe('T3.5.1 2024 and 2025 fields', () => {
  // Teams ranked by id. Champions: 3, 6, 15, 20 (conferences 1-4), 30 and 31 (5, 6). Team 1, 2, 4, 5 are not champions.
  const confs = [
    { conferenceId: 1, power: true, champion: 3, teamIds: [1, 3] },
    { conferenceId: 2, power: true, champion: 6, teamIds: [2, 6] },
    { conferenceId: 3, power: true, champion: 15, teamIds: [4, 15] },
    { conferenceId: 4, power: true, champion: 20, teamIds: [5, 20] },
    { conferenceId: 5, power: false, champion: 30, teamIds: [13, 30] },
    { conferenceId: 6, power: false, champion: 31, teamIds: [31, 32] },
  ];
  it('2024: five highest-ranked champions in; byes to the four highest-ranked champions; the rest by ranking', () => {
    const rules = rulesForSeason(COLLEGE_2026, 'college', 2024)!;
    const f = selectCollegeField({ ranking: seq(1, 40), conferences: confs, independents: [] }, rules);
    expect(f.seeds).toHaveLength(12);
    expect([3, 6, 15, 20, 30].every((t) => f.reason.get(t) === 'champion')).toBe(true);
    expect(f.reason.get(31)).toBeUndefined();
    expect(f.seeds.slice(0, 4)).toEqual([3, 6, 15, 20]);
    expect(f.seeds.slice(4)).toEqual([1, 2, 4, 5, 7, 8, 9, 30]);
  });
  it('2025: same five automatic places, straight seeding by ranking', () => {
    const rules = rulesForSeason(COLLEGE_2026, 'college', 2025)!;
    const f = selectCollegeField({ ranking: seq(1, 40), conferences: confs, independents: [] }, rules);
    expect(f.seeds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 20, 30]);
  });
  it('2026 is unchanged by the era layer (no era keys, same field as the base file)', () => {
    const a = selectCollegeField({ ranking: seq(1, 40), conferences: confs, independents: [] }, COLLEGE_2026);
    const b = selectCollegeField({ ranking: seq(1, 40), conferences: confs, independents: [] }, rulesForSeason(COLLEGE_2026, 'college', 2026)!);
    expect(b.seeds).toEqual(a.seeds);
  });
});

// --- voters ---------------------------------------------------------------------------------------

function round(teams: readonly TeamId[], week: number, winnerFirst = true): GameResult[] {
  const out: GameResult[] = [];
  for (let i = 0; i + 1 < teams.length; i += 2) {
    const pts: [number, number] = winnerFirst ? [28, 14] : [14, 28];
    out.push({ gameId: week * 100 + i, week, phase: 'regular', teams: [teams[i]!, teams[i + 1]!], points: pts, touchdowns: [4, 2], overtime: false, forfeit: false, neutralSite: false });
  }
  return out;
}

const voter = (id: number, over: Partial<Voter> = {}): Voter => ({
  voterId: id, kind: 'media', homeConferenceId: null, stickiness: 0, preseasonWeeks: 6, lossReaction: 0, marginEye: 0, brandEye: 0, homeLean: 0, carelessness: 0, ...over,
});

describe('T3.4.1 poll voter panels', () => {
  const teams = seq(1, 40);
  const conferenceOf = new Map(teams.map((t) => [t, t <= 20 ? 1 : 2]));
  const preseason = new Map(teams.map((t) => [t, 100 - t]));
  const base = { teamIds: teams, champions: [], prestige: new Map<TeamId, number>(), conferenceOf, previous: null };

  it('a panel is drawn once per seed, inside the parameter ranges, and is reproducible', () => {
    const a = createPanel({ kind: 'coach', size: 30, homeConferences: [1, 2], firstId: 1 }, lcg(7));
    const b = createPanel({ kind: 'coach', size: 30, homeConferences: [1, 2], firstId: 1 }, lcg(7));
    expect(a).toEqual(b);
    for (const v of a) {
      expect(v.stickiness).toBeGreaterThanOrEqual(0.45);
      expect(v.stickiness).toBeLessThanOrEqual(0.75);
      expect([1, 2]).toContain(v.homeConferenceId);
    }
  });
  it('ballots score 25 down to 1; points and first-place votes add up', () => {
    const voters = seq(1, 10).map((i) => voter(i));
    const p = panelPoll({ ...base, results: round(teams, 1), week: 1, preseason, voters }, COLLEGE_2026, lcg(3));
    const total = [...p.points.values()].reduce((s, x) => s + x, 0);
    expect(total).toBe(10 * (25 * 26) / 2);
    expect([...p.firstPlaceVotes.values()].reduce((s, x) => s + x, 0)).toBe(10);
    expect(p.order.slice(0, 25)).toHaveLength(25);
  });
  it('the preseason view rules week 0 and fades once results come in', () => {
    const voters = [voter(1, { preseasonWeeks: 4 })];
    const w0 = panelPoll({ ...base, results: [], week: 0, preseason, voters }, COLLEGE_2026, null);
    expect(w0.order.slice(0, 3)).toEqual([1, 2, 3]);
    // Week 8: even teams beat odd teams all season; preseason order no longer matters.
    const games = [1, 2, 3, 4].flatMap((w) => round(teams.map((t) => (t % 2 ? t + 1 : t - 1)), w));
    const w8 = panelPoll({ ...base, results: games, week: 8, preseason, voters }, COLLEGE_2026, null);
    expect(w8.order.slice(0, 20).every((t) => t % 2 === 0)).toBe(true);
  });
  it('a sticky voter keeps a beaten team higher than a voter who reacts to the loss', () => {
    const games1 = round(teams, 1); // odd teams win week 1
    const voters = [voter(1, { stickiness: 0.8, lossReaction: 0 }), voter(2, { stickiness: 0, lossReaction: 0.3 })];
    const p1 = panelPoll({ ...base, results: games1, week: 1, preseason, voters }, COLLEGE_2026, null);
    // Week 2: team 1 loses to team 40.
    const g2: GameResult[] = [{ gameId: 999, week: 2, phase: 'regular', teams: [1, 40], points: [10, 31], touchdowns: [1, 4], overtime: false, forfeit: false, neutralSite: false }];
    const p2 = panelPoll({ ...base, results: [...games1, ...g2], week: 2, preseason, voters, previous: p1.state }, COLLEGE_2026, null);
    const place = (id: number) => p2.state.ballots[String(id)]!.indexOf(1);
    const sticky = place(1), reactive = place(2);
    expect(reactive === -1 || reactive > sticky).toBe(true);
  });
  it('a voter leaning to a home conference ranks its teams higher than a neutral voter does', () => {
    const games = round(teams, 1);
    const leaner = voter(1, { homeConferenceId: 2, homeLean: 0.3 });
    const p = panelPoll({ ...base, results: games, week: 3, preseason, voters: [leaner, voter(2)] }, COLLEGE_2026, null);
    const conf2 = (b: readonly TeamId[]) => b.filter((t) => conferenceOf.get(t) === 2).length;
    expect(conf2(p.state.ballots['1']!)).toBeGreaterThan(conf2(p.state.ballots['2']!));
  });
  it('the seat casts its own coaches ballot in place of one voter', () => {
    const voters = [voter(1, { kind: 'coach' }), voter(2, { kind: 'coach' })];
    const mine = [40, 39, 38];
    const p = panelPoll({ ...base, results: round(teams, 1), week: 1, preseason, voters, seatBallot: { voterId: 2, ballot: mine } }, COLLEGE_2026, null);
    expect(p.state.ballots['2']).toEqual(mine);
    expect(p.firstPlaceVotes.get(40)).toBe(1);
  });
  it('with noise off the poll is a pure function of results', () => {
    const voters = createPanel({ kind: 'media', size: 12, homeConferences: [1, 2], firstId: 1 }, lcg(11));
    const input = { ...base, results: round(teams, 1), week: 1, preseason, voters };
    expect(panelPoll(input, COLLEGE_2026, null).order).toEqual(panelPoll(input, COLLEGE_2026, null).order);
  });
});

// --- live picture ---------------------------------------------------------------------------------

describe('weekly live picture', () => {
  const uniform = (label: string) => lcg([...label].reduce((s, c) => s * 31 + c.charCodeAt(0), 7));
  it('pro: tiebroken table, clinch flags for every club, odds only with a win model', () => {
    const places = proLeague();
    const g = new Games();
    for (let w = 1; w <= 3; w++) for (let i = 1; i <= 31; i += 2) g.add(i, i + 1, 24, 17, { week: w });
    const remaining = seq(1, 16).map((i) => ({ gameId: 500 + i, week: 4, teams: [2 * i - 1, 2 * i] as const, neutralSite: false }));
    const rules = { ...PRO_RULES, ...PRO_2026 };
    const a = livePicture({ rules, results: g.list, remaining, draw: seededDraw(1), uniform, pro: { places, allowTies: false, clinchNodeBudget: 64 } });
    expect(a.pro!.table.conferences).toHaveLength(2);
    expect(a.pro!.clinch).toHaveLength(32);
    expect(a.pro!.odds).toEqual([]);
    expect(a.college).toBeUndefined();
    const model = { winProbability: () => 0.5, tieProbability: () => 0 };
    const b = livePicture({ rules, results: g.list, remaining, draw: seededDraw(1), uniform, pro: { places, allowTies: false, clinchNodeBudget: 64, winModel: model, oddsSimulations: 50 } });
    expect(b.pro!.odds).toHaveLength(32);
  });
  it('college: polls every week, the committee and the projected field from its first week, bowls once the regular season is over', () => {
    const teams = seq(1, 48);
    const conferences = seq(0, 8).map((c) => ({ conferenceId: c + 1, power: c < 4, teamIds: teams.slice(c * 6, c * 6 + 6), titleMethod: 'standings' as const }));
    const panels = {
      media: createPanel({ kind: 'media', size: 8, homeConferences: [1, 2, 3, 4], firstId: 1 }, lcg(1)),
      coach: createPanel({ kind: 'coach', size: 8, homeConferences: [1, 2, 3, 4, 5], firstId: 101 }, lcg(2)),
    };
    const preseason = new Map(teams.map((t) => [t, -t]));
    const results = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((w) => round(w % 2 ? teams : [...teams].reverse(), w));
    const bowls = seq(1, 10).map((i) => ({ bowlId: i, order: i, slots: [null, null] as const }));
    const college = (week: number, state: { media: PollState | null; coach: PollState | null }, done: boolean) => ({
      teamIds: teams, conferences, independents: [], week, preseason, prestige: new Map<TeamId, number>(), panels, pollState: state, ...(done ? { bowls } : {}),
    });
    const early = livePicture({ rules: COLLEGE_2026, results: results.filter((g) => g.week <= 3), remaining: [{ gameId: 1, week: 4, teams: [1, 2], neutralSite: false }], draw: seededDraw(2), uniform, college: college(3, { media: null, coach: null }, false) });
    expect(early.college!.poll.order.length).toBeGreaterThanOrEqual(25);
    expect(early.college!.coachesPoll.order.length).toBeGreaterThanOrEqual(25);
    expect(early.college!.ranking).toBeNull();
    expect(early.college!.projectedField).toBeNull();
    expect(early.pollState!.media.week).toBe(3);
    const late = livePicture({ rules: COLLEGE_2026, results, remaining: [], draw: seededDraw(2), uniform, college: college(10, early.pollState!, true) });
    expect(late.college!.ranking!.order).toHaveLength(48);
    expect(late.college!.projectedField!.seeds).toHaveLength(12);
    expect(late.college!.bowls!.games.length).toBeGreaterThan(0);
    expect(late.college!.conferences).toHaveLength(8);
    // Same inputs, same picture (J13 determinism).
    const again = livePicture({ rules: COLLEGE_2026, results, remaining: [], draw: seededDraw(2), uniform, college: college(10, early.pollState!, true) });
    expect(again.college!.poll.order).toEqual(late.college!.poll.order);
  });
});
