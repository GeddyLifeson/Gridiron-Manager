// College conference standings and the champion (T3.3.1). The tiebreak chain is data per conference:
// real chains differ by conference and are Unverified (T3.3.1 facts), so the starting chain is only a
// default the content file may replace. Teams outside the competition (lower subdivision) count in
// overall records but never in conference standings.
import { Ledger } from './records.ts';
import type { GameResult, RuleValues, TeamId, TieDraw } from './types.ts';

export type CollegeStepId = 'head_to_head' | 'common_conference_opponents' | 'next_highest' | 'opponents_win_share' | 'random_draw';

/** T3.3.1 rule 2 starting chain. */
export const STARTING_CHAIN: readonly CollegeStepId[] = ['head_to_head', 'common_conference_opponents', 'next_highest', 'opponents_win_share', 'random_draw'];

export type TitleMethod = 'title_game' | 'standings';

export interface ConferenceInput {
  readonly conferenceId: number;
  readonly teamIds: readonly TeamId[];
  readonly chain: readonly CollegeStepId[];
  readonly titleMethod: TitleMethod;
}

export interface CollegeTieLogEntry { readonly step: CollegeStepId; readonly clubs: readonly TeamId[]; readonly advanced: TeamId | null; readonly removed: readonly TeamId[] }

export interface ConferenceStandings {
  readonly conferenceId: number;
  /** First to last by conference win share, ties broken by the chain. */
  readonly order: readonly TeamId[];
  /** The two teams of the title game (T3.3.1 rule 3), or null under `standings`. */
  readonly titleGame: readonly [TeamId, TeamId] | null;
  /** Champion: the title game winner when given, the top team under `standings`, else null until the game is played. */
  readonly champion: TeamId | null;
  readonly log: readonly CollegeTieLogEntry[];
}

/**
 * Conference standings for one conference. `results` are the season's games (any phase; only regular
 * games between conference members count). `titleGameWinner` is the winner of the title game once played.
 */
export function conferenceStandings(conf: ConferenceInput, results: readonly GameResult[], rules: RuleValues, draw: TieDraw, titleGameWinner: TeamId | null = null): ConferenceStandings {
  const places = conf.teamIds.map((id) => ({ id, conferenceId: conf.conferenceId, divisionId: conf.conferenceId }));
  const members = new Set(conf.teamIds);
  const regular = results.filter((g) => g.phase === 'regular');
  const confLedger = new Ledger(places, regular.filter((g) => members.has(g.teams[0]) && members.has(g.teams[1])), rules);
  // Overall records of every team met, for the opponents' win share step.
  const allIds = [...new Set(regular.flatMap((g) => [...g.teams]))];
  const overall = new Ledger(allIds.map((id) => ({ id, conferenceId: 0, divisionId: 0 })), regular, rules);
  const log: CollegeTieLogEntry[] = [];

  const groups = new Map<number, TeamId[]>();
  for (const id of conf.teamIds) { const p = confLedger.pct(id); groups.set(p, [...(groups.get(p) ?? []), id]); }
  // The ladder the "next highest" step walks: every member by conference win share, then overall win
  // share, then id. It starts from the top of the standings (the usual conference reading, assumption:
  // real chains are Unverified) and skips the tied teams themselves.
  const ladder = [...conf.teamIds].sort((a, b) => confLedger.pct(b) - confLedger.pct(a) || overall.pct(b) - overall.pct(a) || a - b);
  const order = [...groups.keys()].sort((a, b) => b - a).flatMap((k) => orderGroup(groups.get(k)!, ladder));

  function evaluate(step: CollegeStepId, clubs: readonly TeamId[], under: readonly TeamId[]): Map<TeamId, number> | null {
    const m = (f: (id: TeamId) => number) => new Map(clubs.map((id) => [id, f(id)]));
    switch (step) {
      case 'head_to_head': {
        const set = new Set(clubs);
        for (const c of clubs) if (!confLedger.gamesOf(c).some((g) => set.has(g.opp))) return null;
        return m((id) => confLedger.pctWhere(id, (g) => set.has(g.opp)));
      }
      case 'common_conference_opponents': {
        const [head, ...rest] = clubs;
        const cs = confLedger.opponents(head!);
        for (const c of rest) { const o = confLedger.opponents(c); for (const x of [...cs]) if (!o.has(x)) cs.delete(x); }
        for (const c of clubs) cs.delete(c);
        if (cs.size === 0) return null;
        return m((id) => confLedger.pctWhere(id, (g) => cs.has(g.opp)));
      }
      case 'next_highest': {
        for (const x of under) {
          if (clubs.includes(x)) continue;
          if (!clubs.every((c) => confLedger.gamesOf(c).some((g) => g.opp === x))) continue;
          const v = m((id) => confLedger.pctWhere(id, (g) => g.opp === x));
          if (new Set(v.values()).size > 1) return v;
        }
        return null;
      }
      case 'opponents_win_share':
        return m((id) => overall.combinedPct(confLedger.gamesOf(id).map((g) => g.opp)));
      case 'random_draw': {
        const drawn = draw.draw([...clubs].sort((a, b) => a - b), `conference:${conf.conferenceId}:${clubs.join(',')}`);
        return m((id) => -drawn.indexOf(id));
      }
    }
  }

  function pickBest(clubs: readonly TeamId[], under: readonly TeamId[]): TeamId {
    let group = [...clubs];
    for (let i = 0; i < conf.chain.length; i++) {
      if (group.length === 1) return group[0]!;
      const step = conf.chain[i]!;
      const v = evaluate(step, group, under);
      if (!v) continue;
      const best = Math.max(...group.map((c) => v.get(c)!));
      const top = group.filter((c) => v.get(c) === best);
      if (top.length === group.length) continue;
      if (top.length === 1) { log.push({ step, clubs: group, advanced: top[0]!, removed: [] }); return top[0]!; }
      log.push({ step, clubs: group, advanced: null, removed: group.filter((c) => !top.includes(c)) });
      group = top;
      i = -1; // restart the chain for the clubs still tied
    }
    if (group.length === 1) return group[0]!;
    // A chain without a random draw falls back to one, so every tie is broken (T3.3.1: exactly one champion).
    const drawn = draw.draw([...group].sort((a, b) => a - b), `conference:${conf.conferenceId}:${group.join(',')}`);
    log.push({ step: 'random_draw', clubs: group, advanced: drawn[0]!, removed: [] });
    return drawn[0]!;
  }

  function orderGroup(group: readonly TeamId[], under: readonly TeamId[]): TeamId[] {
    const left = [...group];
    const out: TeamId[] = [];
    while (left.length) { const b = pickBest(left, under); out.push(b); left.splice(left.indexOf(b), 1); }
    return out;
  }

  const first = order[0] ?? null, second = order[1] ?? null;
  if (conf.titleMethod === 'title_game' && first !== null && second !== null) {
    if (titleGameWinner !== null && titleGameWinner !== first && titleGameWinner !== second) throw new Error(`title game winner ${titleGameWinner} did not play in it`);
    return { conferenceId: conf.conferenceId, order, titleGame: [first, second], champion: titleGameWinner, log };
  }
  return { conferenceId: conf.conferenceId, order, titleGame: null, champion: first, log };
}
