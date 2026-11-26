// Cutdown (M6.4): the roster-building board, the cutdown meetings, releasing players, and the claims and
// practice squad the day after. The board files through the one transaction engine (G-15, C5.7.1): this
// module proposes and validates, the roster engine decides what is legal.
import { practiceSquadGroup, practiceSquadGroupCaps } from '../roster/eligibility.ts';
import { applyTransaction } from '../roster/engine.ts';
import type { RosterRules } from '../roster/keys.ts';
import type { LeagueRosters, PlayerFacts, Transaction, TxResult } from '../roster/types.ts';
import { bandHalf } from './board.ts';
import { P } from './params.ts';
import type { RiskLevel } from './wire.ts';
import type { Graded } from './types.ts';

export const COLUMNS = ['locks', 'likely', 'bubble', 'practice_squad', 'release'] as const;
export type Column = (typeof COLUMNS)[number];

export interface CutdownPlayer {
  readonly personId: number;
  /** Template row (M1.3.1). */
  readonly row: string;
  readonly grade: Graded;
  readonly starter: boolean;
  /** A contract whose release costs too much cap: K7 marks it (M6.4.1 inputs). */
  readonly highGuarantee: boolean;
  readonly claimRisk: RiskLevel;
  readonly injured: boolean;
}

export type Board = Readonly<Record<string, Column>>;

/** The line between kept and cut at a row: midway between the template-count-th and the next best grade. */
export function cutLines(players: readonly CutdownPlayer[], template: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of Object.keys(template).sort()) {
    const g = players.filter((p) => p.row === row).map((p) => p.grade.mean).sort((a, b) => b - a);
    const n = template[row] ?? 0;
    const inside = g[n - 1], outside = g[n];
    out[row] = inside === undefined ? Number.NEGATIVE_INFINITY : outside === undefined ? Number.NEGATIVE_INFINITY : outside + (inside - outside) * P.cutLineInsideShare;
  }
  return out;
}

/**
 * The staff draft board (M6.4.1 starting procedure, Assumption): starters and high-guarantee contracts to
 * Locks; a band entirely above the row's cut line to Likely; a band over the line to Bubble; practice
 * squad eligible bubble players with low claim risk to Practice squad target; the rest to Release.
 */
export function staffBoard(players: readonly CutdownPlayer[], template: Readonly<Record<string, number>>, facts: Readonly<Record<string, PlayerFacts>>, rules: RosterRules): Board {
  const lines = cutLines(players, template);
  const board: Record<string, Column> = {};
  for (const p of [...players].sort((a, b) => a.personId - b.personId)) {
    const line = lines[p.row] ?? Number.NEGATIVE_INFINITY;
    const half = bandHalf(p.grade);
    const f = facts[String(p.personId)];
    let col: Column;
    if (p.starter || p.highGuarantee) col = 'locks';
    else if (p.grade.mean - half > line) col = 'likely';
    else if (p.grade.mean + half >= line) col = f && practiceSquadGroup(f, rules) !== null && p.claimRisk === 'low' ? 'practice_squad' : 'bubble';
    else col = 'release';
    board[String(p.personId)] = col;
  }
  return board;
}

const kept = (c: Column) => c === 'locks' || c === 'likely' || c === 'bubble';

export interface BoardCheck {
  readonly total: number;
  readonly limit: number;
  readonly byRow: Readonly<Record<string, { readonly count: number; readonly target: number }>>;
  readonly linemen: number;
  /** How many can dress with these linemen (C5.2.1: the short-line limit when fewer than required). */
  readonly canDress: number | null;
  readonly practiceSquad: { readonly count: number; readonly limit: number; readonly ineligible: readonly number[] };
  readonly errors: readonly string[];
}

/**
 * Counters and blocks (M6.4.1): the board cannot be submitted over the season limit or with an ineligible
 * practice squad target (a seventh group-C player is ineligible). Linemen check from the roster rules.
 */
export function checkBoard(board: Board, players: readonly CutdownPlayer[], template: Readonly<Record<string, number>>, facts: Readonly<Record<string, PlayerFacts>>, rules: RosterRules): BoardCheck {
  const errors: string[] = [];
  const keptIds = Object.entries(board).filter(([, c]) => kept(c)).map(([id]) => id);
  const byRow: Record<string, { count: number; target: number }> = {};
  for (const row of Object.keys(template).sort()) byRow[row] = { count: 0, target: template[row] ?? 0 };
  for (const p of players) if (keptIds.includes(String(p.personId))) byRow[p.row] = { count: (byRow[p.row]?.count ?? 0) + 1, target: template[p.row] ?? 0 };
  const total = keptIds.length;
  if (total > rules.seasonLimit) errors.push(`${total} kept, limit ${rules.seasonLimit}`);
  const linemen = keptIds.filter((id) => facts[id]?.offensiveLineman).length;
  const gd = rules.gameDay;
  const canDress = gd ? (linemen >= gd.minLinemen ? gd.activeLimit : gd.activeLimitShortLine) : null;
  const ps = Object.entries(board).filter(([, c]) => c === 'practice_squad').map(([id]) => Number(id)).sort((a, b) => a - b);
  const caps = practiceSquadGroupCaps(rules);
  const limit = rules.practiceSquad ? rules.practiceSquad.size : 0;
  const ineligible: number[] = [];
  let b = 0, c = 0, regular = 0;
  for (const id of ps) {
    const f = facts[String(id)];
    const g = f ? practiceSquadGroup(f, rules) : null;
    if (!f || g === null) { ineligible.push(id); continue; }
    if (f.internationalPathway) continue;
    if (g === 'B' && ++b > caps.B) { ineligible.push(id); continue; }
    if (g === 'C' && ++c > caps.C) { ineligible.push(id); continue; }
    regular++;
  }
  if (regular > limit) errors.push(`${regular} practice squad targets, limit ${limit}`);
  if (ineligible.length) errors.push(`ineligible practice squad targets: ${ineligible.join(', ')}`);
  return { total, limit: rules.seasonLimit, byRow, linemen, canDress, practiceSquad: { count: ps.length, limit, ineligible }, errors };
}

export interface ReserveAssignment { readonly personId: number; readonly list: 'reserve_injured' | 'reserve_pup' | 'reserve_nfi'; readonly designateToReturn?: boolean }

/** The cutdown transaction (C5.6.1): releases for every player not kept, reserve placements, filed together. */
export function cutdownTransaction(clubId: number, board: Board, reserve: readonly ReserveAssignment[]): Transaction {
  const onReserve = new Set(reserve.map((r) => r.personId));
  const moves: Transaction[] = [
    ...reserve.map((r) => ({ type: 'place_reserve' as const, clubId, personId: r.personId, list: r.list, ...(r.designateToReturn ? { designateToReturn: true } : {}) })),
    ...Object.entries(board).filter(([id, c]) => !kept(c) && !onReserve.has(Number(id))).map(([id]) => ({ type: 'release' as const, clubId, personId: Number(id) })).sort((a, b) => a.personId - b.personId),
  ];
  return { type: 'cutdown', clubId, moves };
}

/**
 * Submits the board (M6.4.1): the board is checked first, then filed through the roster engine. Who submits
 * follows roster say (L5.2.1): with it the user's board goes in and the GM's objections are logged; without
 * it the GM's board goes in and the user's differing calls are logged as disagreements (L5).
 */
export function submitBoard(state: LeagueRosters, rules: RosterRules, clubId: number, userBoard: Board, gmBoard: Board, rosterSay: boolean, players: readonly CutdownPlayer[], template: Readonly<Record<string, number>>, reserve: readonly ReserveAssignment[] = []): { result: TxResult | null; errors: readonly string[]; disagreements: readonly number[] } {
  const board = rosterSay ? userBoard : gmBoard;
  const disagreements = Object.keys({ ...userBoard, ...gmBoard }).filter((id) => kept(userBoard[id] ?? 'release') !== kept(gmBoard[id] ?? 'release')).map(Number).sort((a, b) => a - b);
  const check = checkBoard(board, players, template, state.players, rules);
  if (check.errors.length) return { result: null, errors: check.errors, disagreements };
  return { result: applyTransaction(state, cutdownTransaction(clubId, board, reserve), rules), errors: [], disagreements };
}

// ---------- M6.4.2 cutdown meetings ----------

/** An assistant's "own" player (rule 4): one he recruited or drafted, or has coached two or more years. A coach new to camp has none. */
export function ownPlayer(broughtIn: boolean, yearsCoached: number): boolean {
  return broughtIn || yearsCoached >= P.ownPlayerYears;
}

/**
 * The grade an assistant states in the meeting: the department's estimate plus his own read error (the
 * world draws it from his hidden accuracy, D6.4.3) plus a hidden lift of a starting 0.2 standard deviations
 * of the grade scale for his own players (K6). The head coach sees only the stated grade.
 */
export function assistantGrade(estimate: number, own: boolean, gradeScaleSd: number, readError: number): number {
  return estimate + readError + (own ? P.ownPlayerBiasSd * gradeScaleSd : 0);
}

/** Hours each meeting costs the head coach and every coach present (rule 2: starting 3 per side, 1.5 special teams). */
export function meetingHours(side: 'offense' | 'defense' | 'special_teams'): number {
  return side === 'special_teams' ? P.meetingHoursSpecialTeams : P.meetingHoursSide;
}

/** Bubble players with no recorded staff opinion before the deadline (acceptance: each must have one). */
export function opinionsMissing(bubble: readonly number[], opinions: readonly { personId: number }[]): number[] {
  const have = new Set(opinions.map((o) => o.personId));
  return bubble.filter((id) => !have.has(id)).sort((a, b) => a - b);
}

/** Trust change with an assistant when the head coach overrules him (rule: a little, returned if results prove the head coach right). */
export function overruleTrust(outcome: 'pending' | 'head_coach_right' | 'assistant_right'): number {
  return outcome === 'head_coach_right' ? 0 : -P.overruleTrustCost;
}

// ---------- M6.4.3 releasing players ----------

export type Delivery = 'in_person' | 'staff' | 'message';

/** Head coach minutes per talk (rule 2: starting 10 in person, 20 for five or more years at the club; none through staff). */
export function talkMinutes(d: Delivery, yearsAtClub: number): number {
  if (d !== 'in_person') return 0;
  return yearsAtClub >= P.longServiceYears ? P.talkMinutesLongService : P.talkMinutes;
}

/**
 * Chance an invited player accepts the practice squad (rule 3): a starting 0.75 with no active-roster offer
 * elsewhere, times 1.1 if told in person with honest odds, 0.9 by message. A claimed player never gets here.
 */
export function practiceSquadAcceptance(d: Delivery, honestOdds: boolean, activeOfferElsewhere: boolean): number {
  if (activeOfferElsewhere) return 0;
  const m = d === 'in_person' && honestOdds ? P.psAcceptInPerson : d === 'message' ? P.psAcceptMessage : 1;
  return Math.min(1, P.psAcceptBase * m);
}

/** Reputation among players from the day (rule): a small gain per in-person talk, larger for long service; none in person costs trust. */
export function releaseDayReputation(talks: readonly { delivery: Delivery; yearsAtClub: number }[]): { reputation: number; lockerRoomTrust: number } {
  let rep = 0;
  for (const t of talks) if (t.delivery === 'in_person') rep += t.yearsAtClub >= P.longServiceYears ? P.repPerTalkLongService : P.repPerTalk;
  const none = talks.length > 0 && talks.every((t) => t.delivery !== 'in_person');
  return { reputation: rep, lockerRoomTrust: none ? -P.noTalksTrustCost : 0 };
}

// ---------- M6.4.4 claims, the day after ----------

/**
 * A claim with the player who leaves the 53 for it (M6.4.4: each claim names one). Refused here when the
 * club is at the limit and names nobody; the roster engine then judges the pair atomically (C5.7.1).
 */
export function claimWithRelease(clubId: number, claimId: number, releaseId: number | null, keptCount: number, rules: RosterRules): Transaction | { refused: string } {
  if (releaseId === null && keptCount >= rules.seasonLimit) return { refused: 'a claim at the limit must name a player to release (C5.5.1)' };
  return { type: 'claim', clubId, personId: claimId, ...(releaseId !== null ? { linked: [{ type: 'release' as const, clubId, personId: releaseId }] } : {}) };
}
