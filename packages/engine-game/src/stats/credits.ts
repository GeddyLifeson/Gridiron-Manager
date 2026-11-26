// Per-play credit rows (D14.1.1): (player, statistic id, value, play id). A pure function of one play
// record. The rule for each statistic is written in words in catalogue.ts; this file implements them.
import { Contract } from '@gm/engine-core';
import { fieldGoalBand } from './params.ts';
import { catalogueRow } from './catalogue.ts';
import { readPlay, enforcedPenalties, type PlayFacts, type StatsDeps } from './facts.ts';

type StatCredit = Contract.StatCredit;
type StatId = Contract.StatId;
type Side = Contract.Side;

function unique(ids: readonly number[]): number[] {
  const out: number[] = [];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

export function creditsFromFacts(f: PlayFacts, deps: StatsDeps): StatCredit[] {
  const { record, offense, defense } = f;
  const out: StatCredit[] = [];
  const add = (side: Side, playerId: number | null, statId: StatId, value: number, splitKey: string | null = null) => {
    if (value === 0) return;
    out.push({ gameId: record.gameId, playIndex: record.index, side, playerId, statId, value, splitKey });
  };
  const sideOr = (playerId: number | null, fallback: Side): Side => (playerId === null ? fallback : f.sideOf(playerId) ?? fallback);

  // Participation: a live play counts as a snap even when a penalty wipes it out (D14.1.1 edge case).
  if (f.live) {
    for (const p of record.calls.snapping.players) add(offense, p.playerId, f.specialTeams ? 'snaps_special_teams' : 'snaps_offense', 1);
    for (const p of record.calls.opposing.players) add(defense, p.playerId, f.specialTeams ? 'snaps_special_teams' : 'snaps_defense', 1);
  }

  // Penalties: only enforced ones. They stand on a play that does not count (D14.1.1 edge case).
  for (const p of enforcedPenalties(record)) {
    add(p.side, p.playerId, 'penalties', 1, p.foulId);
    add(p.side, p.playerId, 'penalty_yards', p.yards, p.foulId);
  }

  if (!f.counts) return out;

  if (!f.isTry) {
    const air = f.airYards ?? 0;
    switch (f.base) {
      case 'completion': {
        const td = f.offenseTouchdown ? 1 : 0, fd = f.firstDownEarned ? 1 : 0;
        add(offense, f.passerId, 'pass_attempts', 1);
        add(offense, f.passerId, 'pass_completions', 1);
        add(offense, f.passerId, 'pass_yards', f.yards);
        add(offense, f.passerId, 'pass_air_yards', air);
        add(offense, f.passerId, 'pass_yards_after_catch', f.yards - air);
        add(offense, f.passerId, 'pass_touchdowns', td);
        add(offense, f.passerId, 'pass_first_downs', fd);
        add(offense, f.receiverId, 'targets', 1);
        add(offense, f.receiverId, 'receptions', 1);
        add(offense, f.receiverId, 'receiving_yards', f.yards);
        add(offense, f.receiverId, 'receiving_air_yards', air);
        add(offense, f.receiverId, 'receiving_yards_after_catch', f.yards - air);
        add(offense, f.receiverId, 'receiving_touchdowns', td);
        add(offense, f.receiverId, 'receiving_first_downs', fd);
        break;
      }
      case 'incompletion':
      case 'interception': {
        add(offense, f.passerId, 'pass_attempts', 1);
        if (f.targetId !== null) {
          add(offense, f.passerId, 'pass_air_yards', air);
          add(offense, f.targetId, 'targets', 1);
          add(offense, f.targetId, 'receiving_air_yards', air);
        }
        if (f.base === 'interception') {
          add(offense, f.passerId, 'pass_interceptions', 1);
          add(defense, f.interceptorId, 'interceptions', 1);
          add(defense, f.interceptorId, 'passes_defended', 1);
          add(defense, f.interceptorId, 'interception_return_yards', f.interceptionReturnYards);
        } else if (f.breakupById !== null) {
          add(sideOr(f.breakupById, defense), f.breakupById, 'passes_defended', 1);
        }
        break;
      }
      case 'spike':
        add(offense, f.passerId, 'pass_attempts', 1);
        break;
      case 'sack': {
        const lost = -f.yards;
        add(offense, f.passerId, 'sacks_taken', 1);
        add(offense, f.passerId, 'sack_yards_lost', lost);
        const share = f.sackerIds.length > 1 ? deps.params.num('stats.sack.sharedValue') : 1;
        if (f.sackerIds.length === 0) {
          add(defense, null, 'sacks', 1);
          add(defense, null, 'sack_yards', lost);
        }
        for (const id of f.sackerIds) {
          add(sideOr(id, defense), id, 'sacks', share);
          add(sideOr(id, defense), id, 'sack_yards', lost * share);
        }
        break;
      }
      case 'run':
      case 'kneel':
        add(offense, f.carrierId, 'rush_carries', 1);
        add(offense, f.carrierId, 'rush_yards', f.yards);
        add(offense, f.carrierId, 'rush_touchdowns', f.offenseTouchdown ? 1 : 0);
        add(offense, f.carrierId, 'rush_first_downs', f.firstDownEarned ? 1 : 0);
        break;
      case 'none':
        break;
    }

    for (const fu of f.fumbles) {
      if (!fu.credited) continue;
      if (fu.muff) add(fu.side, fu.playerId, 'muffs', 1);
      else if (fu.side === offense && f.kick === null) {
        const kind = f.base === 'sack' && fu.playerId === f.passerId ? 'sack' : f.base === 'completion' && fu.playerId === f.receiverId ? 'receiving' : 'rush';
        const ids: Record<typeof kind, [StatId, StatId]> = {
          sack: ['sack_fumbles', 'sack_fumbles_lost'], receiving: ['receiving_fumbles', 'receiving_fumbles_lost'], rush: ['rush_fumbles', 'rush_fumbles_lost'],
        };
        add(offense, fu.playerId, ids[kind][0], 1);
        if (fu.lost) add(offense, fu.playerId, ids[kind][1], 1);
      }
      const otherTeam = Contract.otherSide(fu.side);
      if (fu.forcedById !== null && !fu.muff) add(sideOr(fu.forcedById, otherTeam), fu.forcedById, 'forced_fumbles', 1);
      if (fu.lost && fu.recoveredById !== null) add(sideOr(fu.recoveredById, otherTeam), fu.recoveredById, 'fumble_recoveries', 1);
    }

    const maxTacklers = deps.params.num('stats.tackle.maxCredited');
    f.madeTackles.forEach((t, n) => {
      const ids = unique(t.tacklerIds).slice(0, maxTacklers);
      const tacklingSide = Contract.otherSide(f.sideOf(t.carrierId) ?? offense);
      for (const id of ids) add(sideOr(id, tacklingSide), id, ids.length === 1 ? 'tackles_solo' : 'tackles_assisted', 1);
      const isLast = n === f.madeTackles.length - 1;
      const first = ids[0];
      if (isLast && first !== undefined && f.kick === null && (f.base === 'run' || f.base === 'completion') && f.yards < 0 && record.final.resultType !== 'fumble_lost') {
        add(sideOr(first, tacklingSide), first, 'tackles_for_loss', 1);
      }
    });

    for (const id of f.hitterIds) add(sideOr(id, defense), id, 'quarterback_hits', 1);

    const score = record.final.score;
    if (score && score.type === 'safety') {
      const tackler = f.madeTackles[f.madeTackles.length - 1]?.tacklerIds[0] ?? null;
      add(score.side, tackler !== null && f.sideOf(tackler) === score.side ? tackler : null, 'safeties', 1);
    }
    if (score && score.type === 'touchdown' && score.side === defense && f.kick === null) {
      add(defense, score.scorerId, 'defensive_touchdowns', 1);
    }
  } else if (f.twoPointGood) {
    if (f.base === 'completion') {
      add(offense, f.passerId, 'pass_two_point_conversions', 1);
      add(offense, f.receiverId, 'receiving_two_point_conversions', 1);
    } else {
      add(offense, f.carrierId, 'rush_two_point_conversions', 1);
    }
  }

  const pk = f.placeKick;
  if (pk && pk.kind === 'try_kick') {
    add(offense, pk.kickerId, 'extra_points_attempted', 1);
    add(offense, pk.kickerId, 'extra_points_made', pk.good ? 1 : 0);
  } else if (pk && pk.distanceYd !== null) {
    const band = fieldGoalBand(pk.distanceYd);
    add(offense, pk.kickerId, 'field_goals_attempted', 1, band);
    add(offense, pk.kickerId, 'field_goals_made', pk.good ? 1 : 0, band);
    if (pk.good) add(offense, pk.kickerId, 'field_goal_longest', pk.distanceYd);
    add(offense, pk.kickerId, 'field_goals_blocked', pk.blocked ? 1 : 0);
  }

  if (f.kickoff) {
    add(offense, f.kickoff.kickerId, 'kickoffs', 1);
    add(offense, f.kickoff.kickerId, 'kickoff_touchbacks', f.kickoff.touchback ? 1 : 0);
  }

  if (f.punt) {
    const p = f.punt;
    add(offense, p.punterId, 'punts', 1);
    add(offense, p.punterId, 'punt_gross_yards', p.gross);
    add(offense, p.punterId, 'punt_net_yards', p.net);
    add(offense, p.punterId, 'punts_inside_20', p.inside ? 1 : 0);
    add(offense, p.punterId, 'punt_touchbacks', p.touchback ? 1 : 0);
    add(offense, p.punterId, 'punts_blocked', p.blocked ? 1 : 0);
    add(offense, p.punterId, 'punt_longest', p.gross);
    add(offense, p.punterId, 'punt_hang_time', p.hangTimeS);
  }

  const r = f.kickReturn;
  if (r) {
    const onPunt = f.kick !== null && f.kick.kickKind === 'punt';
    if (r.fairCatch) add(defense, r.returnerId, 'fair_catches', 1);
    if (r.returned) {
      add(defense, r.returnerId, onPunt ? 'punt_returns' : 'kickoff_returns', 1);
      add(defense, r.returnerId, onPunt ? 'punt_return_yards' : 'kickoff_return_yards', r.yards);
      add(defense, r.returnerId, onPunt ? 'punt_return_touchdowns' : 'kickoff_return_touchdowns', r.touchdown ? 1 : 0);
    }
  }

  return out;
}

export function credits(record: Contract.PlayRecord, deps: StatsDeps): StatCredit[] {
  return creditsFromFacts(readPlay(record, deps), deps);
}

/** One stat line: totals by statistic id, and the same totals broken out by split key where rows carry one. */
export interface StatLine {
  readonly side: Side;
  /** Null for a team line. */
  readonly playerId: number | null;
  readonly totals: Readonly<Record<string, number>>;
  readonly splits: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface BoxScore {
  /** One line per credited player, ordered by side then player id. */
  readonly players: readonly StatLine[];
  /** Team lines indexed by side: every credit of the side, player or team. */
  readonly teams: readonly [StatLine, StatLine];
}

function combine(statId: string, current: number | undefined, value: number): number {
  if (current === undefined) return value;
  return catalogueRow(statId).aggregate === 'max' ? Math.max(current, value) : current + value;
}

function lineOf(side: Side, playerId: number | null, rows: readonly StatCredit[]): StatLine {
  const totals: Record<string, number> = {};
  const splits: Record<string, Record<string, number>> = {};
  for (const c of rows) {
    totals[c.statId] = combine(c.statId, totals[c.statId], c.value);
    if (c.splitKey !== null) {
      const s = (splits[c.statId] ??= {});
      s[c.splitKey] = combine(c.statId, s[c.splitKey], c.value);
    }
  }
  return { side, playerId, totals, splits };
}

/** The box score is a query over credit rows and nothing else (P3.1.1). */
export function boxScore(rows: readonly StatCredit[]): BoxScore {
  const byPlayer = new Map<string, StatCredit[]>();
  for (const c of rows) {
    if (c.playerId === null) continue;
    const key = `${c.side}:${c.playerId}`;
    const list = byPlayer.get(key);
    if (list) list.push(c); else byPlayer.set(key, [c]);
  }
  const players = [...byPlayer.values()]
    .map((list) => lineOf(list[0]!.side, list[0]!.playerId, list))
    .sort((a, b) => a.side - b.side || (a.playerId ?? 0) - (b.playerId ?? 0));
  const team = (side: Side) => lineOf(side, null, rows.filter((c) => c.side === side));
  return { players, teams: [team(0), team(1)] };
}

/** The plays behind a number (D14.1.1: click a statistic, get its plays). Play indexes in order, each once. */
export function playsBehind(rows: readonly StatCredit[], q: { side: Side; playerId: number | null; statId: string; splitKey?: string }): number[] {
  const out: number[] = [];
  for (const c of rows) {
    if (c.side !== q.side || c.statId !== q.statId) continue;
    if (q.playerId !== null && c.playerId !== q.playerId) continue;
    if (q.splitKey !== undefined && c.splitKey !== q.splitKey) continue;
    if (!out.includes(c.playIndex)) out.push(c.playIndex);
  }
  return out;
}
