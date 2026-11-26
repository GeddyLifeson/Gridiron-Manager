// Records and standings tables (C3.1.1, C3.1.2). A `Ledger` indexes one season's regular-season results
// by club, and every tiebreak step reads its records from it.
import type { GameRecord } from '@gm/schema';
import { KEY, num, param } from './params.ts';
import type { ClubPlace, GameResult, RuleValues, StandingsRow, Streak, TeamId, WLT } from './types.ts';

export const EMPTY: WLT = { w: 0, l: 0, t: 0 };

/** A game seen from one club. */
export interface ClubGame {
  readonly game: GameResult;
  readonly opp: TeamId;
  readonly pf: number;
  readonly pa: number;
  readonly tdFor: number;
  readonly tdAgainst: number;
  readonly home: boolean;
  readonly result: 'W' | 'L' | 'T';
}

export function games(r: WLT): number { return r.w + r.l + r.t; }

export function add(r: WLT, result: 'W' | 'L' | 'T'): WLT {
  return result === 'W' ? { ...r, w: r.w + 1 } : result === 'L' ? { ...r, l: r.l + 1 } : { ...r, t: r.t + 1 };
}

export function sum(a: WLT, b: WLT): WLT { return { w: a.w + b.w, l: a.l + b.l, t: a.t + b.t }; }

/** Winning percentage (C3.1.1): (W + v T) / (W + L + T), v = `standings.tie_win_value`. Zero games gives 0. */
export function pctOf(r: WLT, tieWinValue: number): number {
  const g = games(r);
  return g === 0 ? 0 : (r.w + tieWinValue * r.t) / g;
}

/** Adapter from the world contract's game row. Touchdowns come from the play record (the row lacks them). */
export function resultFromGameRecord(g: GameRecord, touchdowns: readonly [number, number], forfeit: boolean): GameResult | null {
  if (g.status !== 'final' || !g.finalScore) return null;
  return {
    gameId: g.id, week: g.week, phase: g.phase, teams: g.teamIds, points: g.finalScore,
    touchdowns, overtime: false, forfeit, neutralSite: g.neutralSite,
  };
}

export class Ledger {
  readonly tieWinValue: number;
  readonly places: ReadonlyMap<TeamId, ClubPlace>;
  readonly clubs: readonly TeamId[];
  private readonly byClub = new Map<TeamId, ClubGame[]>();
  readonly hasHypothetical: boolean;

  /** `results` may hold any phase; only regular-season games count (C3.1.1 edge case). */
  constructor(places: readonly ClubPlace[], results: readonly GameResult[], rules: RuleValues) {
    this.tieWinValue = num(rules, KEY.tieWinValue);
    this.places = new Map(places.map((p) => [p.id, p]));
    this.clubs = places.map((p) => p.id);
    for (const id of this.clubs) this.byClub.set(id, []);
    let hyp = false;
    const sorted = [...results].filter((g) => g.phase === 'regular').sort((a, b) => a.week - b.week || a.gameId - b.gameId);
    for (const g of sorted) {
      if (g.hypothetical) hyp = true;
      for (const side of [0, 1] as const) {
        const other = side === 0 ? 1 : 0;
        const list = this.byClub.get(g.teams[side]);
        if (!list) continue;
        const pf = g.points[side], pa = g.points[other];
        list.push({
          game: g, opp: g.teams[other], pf, pa, tdFor: g.touchdowns[side], tdAgainst: g.touchdowns[other],
          home: side === 0 && !g.neutralSite, result: pf > pa ? 'W' : pf < pa ? 'L' : 'T',
        });
      }
    }
    this.hasHypothetical = hyp;
  }

  gamesOf(id: TeamId): readonly ClubGame[] { return this.byClub.get(id) ?? []; }

  place(id: TeamId): ClubPlace {
    const p = this.places.get(id);
    if (!p) throw new Error(`club ${id} is not in the league`);
    return p;
  }

  sameDivision(a: TeamId, b: TeamId): boolean { return this.place(a).divisionId === this.place(b).divisionId; }
  sameConference(a: TeamId, b: TeamId): boolean { return this.place(a).conferenceId === this.place(b).conferenceId; }

  recordWhere(id: TeamId, keep: (g: ClubGame) => boolean): WLT {
    let r = EMPTY;
    for (const g of this.gamesOf(id)) if (keep(g)) r = add(r, g.result);
    return r;
  }

  record(id: TeamId): WLT { return this.recordWhere(id, () => true); }
  pct(id: TeamId): number { return pctOf(this.record(id), this.tieWinValue); }
  pctWhere(id: TeamId, keep: (g: ClubGame) => boolean): number { return pctOf(this.recordWhere(id, keep), this.tieWinValue); }

  opponents(id: TeamId): Set<TeamId> { return new Set(this.gamesOf(id).map((g) => g.opp)); }

  /** Aggregate percentage of a list of clubs, each entry counted once (C3.1.2: per win or per game). */
  combinedPct(ids: readonly TeamId[]): number {
    let r = EMPTY;
    for (const o of ids) r = sum(r, this.record(o));
    return pctOf(r, this.tieWinValue);
  }

  /** Strength of victory (C3.1.2): beaten opponents, once per win. 0 with no wins (edge case). */
  strengthOfVictory(id: TeamId): number {
    return this.combinedPct(this.gamesOf(id).filter((g) => g.result === 'W').map((g) => g.opp));
  }

  /** Strength of schedule (C3.1.2): every opponent, once per game. */
  strengthOfSchedule(id: TeamId): number {
    return this.combinedPct(this.gamesOf(id).map((g) => g.opp));
  }

  /** Points scored and allowed with forfeit points left out (Rule 11-1-1), optionally only for some games. */
  points(id: TeamId, keep: (g: ClubGame) => boolean = () => true): { pf: number; pa: number; hyp: boolean } {
    let pf = 0, pa = 0, hyp = false;
    for (const g of this.gamesOf(id)) {
      if (!keep(g) || g.game.forfeit) continue;
      pf += g.pf; pa += g.pa;
      if (g.game.hypothetical) hyp = true;
    }
    return { pf, pa, hyp };
  }

  netTouchdowns(id: TeamId): { net: number; hyp: boolean } {
    let net = 0, hyp = false;
    for (const g of this.gamesOf(id)) { net += g.tdFor - g.tdAgainst; if (g.game.hypothetical) hyp = true; }
    return { net, hyp };
  }
}

function streakOf(list: readonly ClubGame[]): Streak {
  const last = list[list.length - 1];
  if (!last) return { kind: null, length: 0 };
  let n = 0;
  for (let i = list.length - 1; i >= 0 && list[i]!.result === last.result; i--) n++;
  return { kind: last.result, length: n };
}

/** Games in the "last five" column (C3.1.2). */
const LAST_FIVE = param('standings.display.lastGames');

/** Standings rows for every club (C3.1.2), in the league's club order. */
export function standingsRows(ledger: Ledger): StandingsRow[] {
  return ledger.clubs.map((id) => {
    const list = ledger.gamesOf(id);
    const record = ledger.record(id);
    let pf = 0, pa = 0;
    for (const g of list) { pf += g.pf; pa += g.pa; }
    let lastFive = EMPTY;
    for (const g of list.slice(-LAST_FIVE)) lastFive = add(lastFive, g.result);
    return {
      teamId: id,
      record,
      pct: pctOf(record, ledger.tieWinValue),
      pointsFor: pf,
      pointsAgainst: pa,
      netPoints: pf - pa,
      home: ledger.recordWhere(id, (g) => g.home),
      road: ledger.recordWhere(id, (g) => !g.home && !g.game.neutralSite),
      division: ledger.recordWhere(id, (g) => ledger.places.has(g.opp) && ledger.sameDivision(id, g.opp)),
      conference: ledger.recordWhere(id, (g) => ledger.places.has(g.opp) && ledger.sameConference(id, g.opp)),
      streak: streakOf(list),
      lastFive,
      strengthOfVictory: ledger.strengthOfVictory(id),
      strengthOfSchedule: ledger.strengthOfSchedule(id),
    };
  });
}
