// G-76 hookup to G-57 (`league.personnel`): real personnel output goes through `gm/personnel.ts` and back.
// The personnel module is imported by path until the integrator adds its barrel line to `@gm/league`.
import { describe, expect, it } from 'vitest';
import {
  P, asksFromMemo, blendBoardNeeds, claimFromWire, coachRankFromBoard, cutdown, cutdownBoard, cutdownInputFrom, fillGapFromReady, hideList,
  highGuarantee, medianGm, needsFromBoard, onTheClock, readyViews, squadTargets, type BoardRow, type CutBoard, type GmProfile, type PlayerView,
} from '../../src/gm/index.ts';
import { GROUPS, POSITIONS, ctx, player } from './fixtures.ts';
import { PRO, league, ok } from './league-fixtures.ts';
import { roster } from '@gm/league';

// `league.personnel` (G-57, PR 119) is not in the `@gm/league` barrel yet, and a test may not import another
// package's files. These tests read it from the package entry point and run as soon as the barrel line
// lands (requested from the integrator). They passed against PR 119's code by direct import on 2026-11-26.
/* eslint-disable @typescript-eslint/no-explicit-any */
const personnel: any = ((await import('@gm/league')) as Record<string, unknown>).personnel;
const real = describe.skipIf(!personnel);
const { buildReadyList, chanceGone, checkBoard, claimRisk, cutdownTransaction, needsBoard, practiceSquadTargets, staffBoard } = personnel ?? {};
const g = (mean: number, variance = 25) => ({ mean, variance });
const CB_PROFILE = { job: 'CB', weights: { speed: 2, press: 1, ball: 1 }, minimums: { speed: 50 }, familyDefault: false };
const pplayer = (personId: number, jobs: string[], level: number) => ({
  personId, age: 25, jobs, grades: Object.fromEntries(['speed', 'press', 'ball', 'accuracy'].map((a) => [a, g(level)])), jobKnowledge: Object.fromEntries(jobs.map((j) => [j, 80])),
  contractYearsLeft: 3, eligibilityLeft: null, unavailable: false, realPerson: false,
});

const gm = (over: Partial<GmProfile['philosophy']> = {}): GmProfile => { const m = medianGm(1, POSITIONS, GROUPS, 'gm_final'); return { ...m, philosophy: { ...m.philosophy, ...over } }; };
const positionOf = (job: string) => (job === 'S' ? 'CB' : job);

real('K7.2.1 needs from the M1.4.1 board (real league.personnel)', () => {
  const rows = (cbLevel: number) => needsBoard({
    players: [pplayer(1, ['CB'], cbLevel), pplayer(2, ['CB'], 62), pplayer(3, ['QB'], 80), pplayer(4, ['QB'], 70)],
    profiles: { CB: CB_PROFILE, QB: { job: 'QB', weights: { accuracy: 1 }, minimums: {}, familyDefault: false } },
    priority: { tiers: { CB: 'replaceable', QB: 'premium' } }, targetCounts: { CB: 3, QB: 2 },
  });
  it('a weaker starter raises the need, and the head coach tier weights do not enter', () => {
    const strong = needsFromBoard(gm(), rows(78), positionOf).find((n) => n.position === 'CB')!;
    const weak = needsFromBoard(gm(), rows(50), positionOf).find((n) => n.position === 'CB')!;
    expect(weak.need).toBeGreaterThan(strong.need);
    // The coach calls CB replaceable; a general manager who values CB still sees the larger need there.
    const own = needsFromBoard(gm({ positionValues: { ...gm().philosophy.positionValues, CB: 1.5 } }), rows(78), positionOf);
    expect(strong.need).toBeGreaterThan(0);
    expect(strong.need).toBeLessThan(1);
    expect(own.find((n) => n.position === 'CB')!.need).toBeGreaterThan(strong.need);
    for (const n of own) { expect(n.need).toBeGreaterThanOrEqual(0); expect(n.need).toBeLessThanOrEqual(1); }
  });
  it('the memo becomes asks, one per position, and the blend follows the voice weight', () => {
    expect(asksFromMemo(['S', 'CB', 'QB'], positionOf)).toEqual([{ position: 'CB', rank: 1 }, { position: 'QB', rank: 2 }]);
    const deaf = blendBoardNeeds(gm(), rows(78), ['QB'], positionOf, 0);
    const led = blendBoardNeeds(gm(), rows(78), ['QB'], positionOf, 1);
    expect(led.find((n) => n.position === 'QB')!.need).toBeGreaterThan(deaf.find((n) => n.position === 'QB')!.need);
    expect(led[0]!.position).toBe('QB');
  });
});

real('K7.3.1 ready list, wire and practice squad (real league.personnel)', () => {
  const cand = (personId: number, job: string, mean: number, over: Record<string, unknown> = {}) => ({
    personId, job, grade: g(mean), age: 27, lastClubId: null, availability: 'street', systemKnowledge: 1, weeksUnsigned: 0, otherJobs: [],
    lastWorkoutDay: null, eligible: true, ...over,
  });
  it('signs the best ready name he can afford; a name who may not sign never reaches him', () => {
    const cols = buildReadyList({ pool: [cand(11, 'CB', 70), cand(12, 'CB', 80, { eligible: false }), cand(13, 'CB', 60)], jobs: ['CB'], quarterbackJobs: [], specialistJobs: [], today: 100 });
    const cost = (id: number) => [id === 11 ? 200_000_000 : 100_000_000];
    expect(readyViews(cols, positionOf, cost).map((v) => v.personId).sort()).toEqual([11, 13]);
    expect(fillGapFromReady(gm(), 'CB', cols, positionOf, cost, 150_000_000, ctx())?.personId).toBe(13);
    expect(fillGapFromReady(gm(), 'CB', cols, positionOf, cost, 250_000_000, ctx())?.personId).toBe(11);
    expect(fillGapFromReady(gm(), 'QB', cols, positionOf, cost, 250_000_000, ctx())).toBeNull();
  });
  it('a claim the cap check rejects is never filed; otherwise the K7 rule decides', () => {
    const mine = [player('CB', 60), player('CB', 55), player('CB', 50)];
    const item = (ok: boolean) => ({ personId: 900, job: 'CB', grade: g(85), capCheck: { ok, reason: '' }, injured: false });
    const waived = player('CB', 85);
    expect(claimFromWire(gm(), mine, waived, item(false), true, ctx())).toMatchObject({ claim: false, blockedBy: 'cap' });
    const yes = claimFromWire(gm(), mine, waived, item(true), true, ctx());
    expect(yes.claim).toBe(true);
    expect(yes.dropId).toBe(mine[2]!.personId);
  });
  it('practice squad asks come only from the legal target list', () => {
    const sp = (personId: number, mean: number, over: Record<string, unknown> = {}) => ({ personId, clubId: 2, job: 'CB', grade: g(mean), protectedThisWeek: false, nextOpponentRestricted: false, pathRank: 3, agentSaid: null, ...over });
    const pool = [sp(21, 70), sp(22, 90, { protectedThisWeek: true }), sp(23, 65)];
    const targets = practiceSquadTargets(pool, { CB: 50 }, 2, 3, 1);
    const views: PlayerView[] = pool.map((p: { personId: number; grade: { mean: number } }) => ({ ...player('CB', p.grade.mean), personId: p.personId }));
    expect(squadTargets(gm(), targets, views, 5, ctx())).toEqual([21, 23]);
  });
  it('the draft clock reads the chance a player is gone from the clubs ahead', () => {
    const board: BoardRow[] = [{ personId: 1, score: 2, value: 2, rank: 1 }, { personId: 2, score: 1, value: 1, rank: 2 }];
    const input = { board, offers: [], consensusRank: new Map([[1, 99]]), onClock: false, picksUntilMine: 5 };
    expect(onTheClock(input).kind).toBe('pick');
    const needy = chanceGone(Array.from({ length: 8 }, (_, i) => ({ clubId: i, publicNeed: 1 })));
    expect(onTheClock({ ...input, chanceGone: new Map([[1, needy]]) }).kind).toBe(needy >= P('draft.goneChance') ? 'seek_trade_up' : 'pick');
    expect(onTheClock({ ...input, chanceGone: new Map([[1, 0]]) }).kind).toBe('pick');
  });
});

real('K7.4.5 cutdown through the M6.4.1 board and the roster engine (real league.personnel)', () => {
  it('his keep and cut lists pass checkBoard and file as one cutdown transaction', () => {
    const s = league(2, 60, 9);
    const squad: PlayerView[] = Array.from({ length: 60 }, (_, i) => ({ ...player(i < 9 ? 'OT' : 'CB', 80 - i * 0.6), personId: 1001 + i }));
    const players = squad.map((v, i) => ({ personId: v.personId, row: v.position, grade: v.grade, starter: i < 2, highGuarantee: false, claimRisk: 'low', injured: false }));
    const template = { OT: 9, CB: 44 };
    const coachBoard = staffBoard(players, template, s.players, PRO);
    const g1 = gm();
    const input = cutdownInputFrom({ roster: squad, limit: PRO.seasonLimit, minByPosition: { OT: 8, CB: 10 }, draftedRound: new Map(), deadCentsByYear: new Map(), rounds: 7 }, coachBoard, new Map(squad.map((v) => [v.personId, v.grade.mean])));
    expect(coachRankFromBoard(coachBoard, new Map()).size).toBe(60);
    const result = cutdown(g1, input, ctx());
    expect(result.keep.length).toBe(PRO.seasonLimit);
    const wanted = squad.filter((v) => result.cut.includes(v.personId)).slice(0, 3);
    const risk = (id: number) => claimRisk(squad.find((v) => v.personId === id)!.grade, 40, 20, 32, 1).score;
    const hidden = hideList(g1, wanted, risk, ctx());
    const board: CutBoard = cutdownBoard(result, { starters: new Set([1001, 1002]), highGuarantee: new Set(), practiceSquad: new Set(wanted.map((v) => v.personId).filter((id) => !hidden.includes(id))) });
    expect(board['1001']).toBe('locks');
    const check = checkBoard(board, players, template, s.players, PRO);
    expect(check.errors).toEqual([]);
    expect(check.total).toBe(PRO.seasonLimit);
    const after = ok(roster.applyTransaction(s, cutdownTransaction(1, board, []), PRO));
    const released = new Set(Object.keys(board).filter((id) => board[id] !== 'locks' && board[id] !== 'likely' && board[id] !== 'bubble').map(Number));
    const left = after.clubs.find((c) => c.clubId === 1)!.entries.map((e) => e.personId);
    expect(left.length).toBe(PRO.seasonLimit);
    expect(left.some((id) => released.has(id))).toBe(false);
  });
});

describe('the hookup on plain inputs (runs without league.personnel)', () => {
  const row = (job: string, starterGap: number, depthGap = 0, shortfall = 0, futureFlags: unknown[] = []) => ({ job, starterGap, depthGap, shortfall, futureFlags });
  it('needs: gaps, depth at half weight, count shortfall and future flags, by his own position values', () => {
    const need = (r: ReturnType<typeof row>, g0 = gm()) => needsFromBoard(g0, [r], positionOf)[0]!;
    expect(need(row('CB', 0)).need).toBe(0);
    expect(need(row('CB', 6)).need).toBeGreaterThan(need(row('CB', 3)).need);
    expect(need(row('CB', 0, 6)).need).toBeCloseTo(need(row('CB', 6)).need * P('needs.depthGapWeight') / 1, 6);
    expect(need(row('CB', 0, 0, 1)).need).toBeGreaterThan(0);
    expect(need(row('CB', 0, 0, 0, [{}])).frame).toBe('this_offseason');
    expect(need(row('CB', 3), gm({ positionValues: { ...gm().philosophy.positionValues, CB: 1.5 } })).need).toBeGreaterThan(need(row('CB', 3)).need);
    // Two jobs at one position: the neediest job is the position's need.
    expect(needsFromBoard(gm(), [row('S', 6), row('CB', 2)], positionOf)).toHaveLength(1);
    expect(needsFromBoard(gm(), [row('S', 6), row('CB', 2)], positionOf)[0]!.need).toBe(need(row('CB', 6)).need);
    expect(asksFromMemo(['S', 'CB', 'QB'], positionOf)).toEqual([{ position: 'CB', rank: 1 }, { position: 'QB', rank: 2 }]);
    const led = blendBoardNeeds(gm(), [row('CB', 3), row('QB', 1)], ['QB'], positionOf, 1);
    expect(led[0]!.position).toBe('QB');
  });
  it('ready list, wire, practice squad and the draft clock', () => {
    const cols = [{ job: 'CB', names: [{ personId: 11, job: 'CB', grade: { mean: 70, variance: 25 }, age: 27 }, { personId: 13, job: 'CB', grade: { mean: 60, variance: 25 }, age: 27 }] }];
    const cost = (id: number) => [id === 11 ? 200_000_000 : 100_000_000];
    expect(readyViews(cols, positionOf, cost).map((v) => v.personId)).toEqual([11, 13]);
    expect(fillGapFromReady(gm(), 'CB', cols, positionOf, cost, 150_000_000, ctx())?.personId).toBe(13);
    const mine = [player('CB', 60), player('CB', 55), player('CB', 50)], waived = player('CB', 85);
    expect(claimFromWire(gm(), mine, waived, { capCheck: { ok: false }, injured: false }, true, ctx())).toMatchObject({ claim: false, blockedBy: 'cap' });
    expect(claimFromWire(gm(), mine, waived, { capCheck: { ok: true }, injured: false }, true, ctx())).toMatchObject({ claim: true, dropId: mine[2]!.personId });
    const views = [player('CB', 70), player('CB', 90), player('CB', 65)];
    expect(squadTargets(gm(), [{ personId: views[0]!.personId }, { personId: views[2]!.personId }], views, 5, ctx())).toEqual([views[0]!.personId, views[2]!.personId]);
    const board: BoardRow[] = [{ personId: 1, score: 2, value: 2, rank: 1 }, { personId: 2, score: 1, value: 1, rank: 2 }];
    const input = { board, offers: [], consensusRank: new Map([[1, 99]]), onClock: false, picksUntilMine: 5 };
    expect(onTheClock(input).kind).toBe('pick');
    expect(onTheClock({ ...input, chanceGone: new Map([[1, 0.9]]) }).kind).toBe('seek_trade_up');
    expect(onTheClock({ ...input, consensusRank: new Map([[1, 2]]), chanceGone: new Map([[1, 0.1]]) }).kind).toBe('pick');
  });
  it('the cutdown board: locks, bubble, practice squad and release; the roster engine files it', () => {
    const s = league(2, 60, 9);
    const squad: PlayerView[] = Array.from({ length: 60 }, (_, i) => ({ ...player(i < 9 ? 'OT' : 'CB', 80 - i * 0.6), personId: 1001 + i }));
    const coachBoard: CutBoard = Object.fromEntries(squad.map((v, i) => [String(v.personId), i < 50 ? 'likely' : 'release']));
    const rank = coachRankFromBoard(coachBoard, new Map(squad.map((v) => [v.personId, v.grade.mean])));
    expect(rank.get(1001)).toBe(1);
    expect(rank.get(1060)).toBe(60);
    const result = cutdown(gm(), cutdownInputFrom({ roster: squad, limit: PRO.seasonLimit, minByPosition: { OT: 8, CB: 10 }, draftedRound: new Map(), deadCentsByYear: new Map(), rounds: 7 }, coachBoard, new Map()), ctx());
    const wanted = squad.filter((v) => result.cut.includes(v.personId)).slice(0, 3);
    expect(hideList(gm(), wanted, () => 0, ctx())).toEqual([]);
    const board = cutdownBoard(result, { starters: new Set([1001]), highGuarantee: new Set([1002]), practiceSquad: new Set(wanted.map((v) => v.personId)) });
    const count = (c: string) => Object.values(board).filter((x) => x === c).length;
    expect(board['1001']).toBe('locks');
    expect(board['1002']).toBe('locks');
    expect(count('locks') + count('likely') + count('bubble')).toBe(PRO.seasonLimit);
    expect(count('bubble')).toBeLessThanOrEqual(P('roster.bubbleSize'));
    expect(count('practice_squad')).toBe(3);
    expect(count('release')).toBe(60 - PRO.seasonLimit - 3);
    // The same move list `personnel.cutdownTransaction` builds, filed through the roster engine (C5.7.1).
    const moves = Object.keys(board).filter((id) => board[id] === 'release' || board[id] === 'practice_squad').map(Number).sort((a, b) => a - b).map((personId) => ({ type: 'release' as const, clubId: 1, personId }));
    const after = ok(roster.applyTransaction(s, { type: 'cutdown', clubId: 1, moves }, PRO));
    expect(after.clubs.find((c) => c.clubId === 1)!.entries.length).toBe(PRO.seasonLimit);
  });
  it('marks a contract whose release costs too much cap', () => {
    const v = player('RB', 50, { costCentsByYear: [900_000_000, 900_000_000] });
    expect(highGuarantee(gm(), v, [850_000_000, 850_000_000], ctx())).toBe(true);
    // Cutting him would save far more than he is worth: no mark, however large the dead money.
    expect(highGuarantee(gm(), v, [500_000_000], ctx())).toBe(false);
    expect(highGuarantee(gm(), v, [50_000_000], ctx())).toBe(false);
    expect(highGuarantee(gm(), v, [], ctx())).toBe(false);
  });
});
