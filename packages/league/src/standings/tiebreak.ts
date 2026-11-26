// Tiebreakers (C3.2.1 to C3.2.3, C3.5.1 interconference list). Each step is a named function; each list
// is the published order (research/audit-r-schedule-tiebreak-playoffs.md 3a to 3f). "Only one club
// advances in any step" (3e item 1): a step that puts one club alone on top advances it; a step that
// leaves several on top removes the rest and restarts as C3.2.3 says; a step that separates nobody
// passes the same clubs to the next step.
import { CONTINUE_ON_THREE, KEY, num, str } from './params.ts';
import type { ClubGame, Ledger } from './records.ts';
import { games } from './records.ts';
import type { RuleValues, TeamId, TieDraw } from './types.ts';

/** Step ids. Tests name each step by these. */
export type StepId =
  | 'head_to_head' | 'head_to_head_sweep' | 'one_per_division'
  | 'division_pct' | 'common_pct' | 'common_pct_min' | 'conference_pct'
  | 'strength_of_victory' | 'strength_of_schedule'
  | 'conference_points_rank' | 'league_points_rank'
  | 'common_net_points' | 'conference_net_points' | 'net_points' | 'net_touchdowns'
  | 'coin_toss';

/** Which family of lists applies: clubs of one conference (C3.2.1 to C3.2.3) or of the whole league (C3.5.1). */
export type TieFamily = 'conference' | 'league';

export type ListId = 'division' | 'wildcard_two' | 'wildcard_multi' | 'interconference';

/** One line of the tie explanation (C3.2.3 "lists each round"). */
export interface TieLogEntry {
  readonly list: ListId;
  /** 1-based step number in the published list. */
  readonly stepNumber: number;
  readonly step: StepId;
  readonly clubs: readonly TeamId[];
  readonly advanced: TeamId | null;
  readonly removed: readonly TeamId[];
}

interface StepDef {
  readonly id: StepId;
  /** Steps whose values come from points or touchdowns (or chance): unknowable for hypothetical games (C3.3.2 edge case). */
  readonly pointsBased: boolean;
  /** Higher is better. null: the step does not apply to these clubs. */
  readonly evaluate: (t: Tiebreaker, clubs: readonly TeamId[]) => Map<TeamId, number> | null;
}

function mapOf(clubs: readonly TeamId[], f: (id: TeamId) => number): Map<TeamId, number> {
  return new Map(clubs.map((id) => [id, f(id)]));
}

/** Opponents every club in the group played, the group itself left out. */
function commonOpponents(l: Ledger, clubs: readonly TeamId[]): Set<TeamId> {
  const [first, ...rest] = clubs;
  if (first === undefined) return new Set();
  const out = l.opponents(first);
  for (const c of rest) { const o = l.opponents(c); for (const x of [...out]) if (!o.has(x)) out.delete(x); }
  for (const c of clubs) out.delete(c);
  return out;
}

/**
 * Combined ranking (3e item 5): rank in points scored (most is 1) plus rank in points allowed (fewest is
 * 1), lowest sum wins. Tied clubs each get the rank they would hold alone (two tied for first both get
 * 1, the next gets 3). Returns the negated sum so higher is better.
 */
function combinedRanking(t: Tiebreaker, pool: readonly TeamId[], clubs: readonly TeamId[]): Map<TeamId, number> {
  const pts = new Map(pool.map((id) => [id, t.ledger.points(id)]));
  for (const id of pool) if (pts.get(id)!.hyp) t.noteHypothetical();
  const rankBy = (id: TeamId, f: (p: { pf: number; pa: number }) => number): number => {
    const mine = f(pts.get(id)!);
    let better = 0;
    for (const o of pool) if (f(pts.get(o)!) > mine) better++;
    return better + 1;
  };
  return mapOf(clubs, (id) => -(rankBy(id, (p) => p.pf) + rankBy(id, (p) => -p.pa)));
}

function netPoints(t: Tiebreaker, clubs: readonly TeamId[], keep: (id: TeamId) => (g: ClubGame) => boolean): Map<TeamId, number> {
  return mapOf(clubs, (id) => {
    const p = t.ledger.points(id, keep(id));
    if (p.hyp) t.noteHypothetical();
    return p.pf - p.pa;
  });
}

const STEP: Record<StepId, StepDef> = {
  head_to_head: {
    id: 'head_to_head', pointsBased: false,
    evaluate: (t, clubs) => {
      const set = new Set(clubs);
      const keep = (g: ClubGame) => set.has(g.opp);
      for (const c of clubs) if (games(t.ledger.recordWhere(c, keep)) === 0) return null;
      return mapOf(clubs, (id) => t.ledger.pctWhere(id, keep));
    },
  },
  head_to_head_sweep: {
    id: 'head_to_head_sweep', pointsBased: false,
    evaluate: (t, clubs) => {
      for (const c of clubs) {
        const others = clubs.filter((o) => o !== c);
        const vs = others.map((o) => t.ledger.recordWhere(c, (g) => g.opp === o));
        if (vs.every((r) => games(r) > 0 && r.l === 0 && r.t === 0)) return mapOf(clubs, (id) => (id === c ? 1 : 0));
        if (vs.every((r) => games(r) > 0 && r.w === 0 && r.t === 0)) return mapOf(clubs, (id) => (id === c ? -1 : 0));
      }
      return null;
    },
  },
  one_per_division: { id: 'one_per_division', pointsBased: false, evaluate: () => null },
  division_pct: {
    id: 'division_pct', pointsBased: false,
    evaluate: (t, clubs) => mapOf(clubs, (id) => t.ledger.pctWhere(id, (g) => t.ledger.places.has(g.opp) && t.ledger.sameDivision(id, g.opp))),
  },
  conference_pct: {
    id: 'conference_pct', pointsBased: false,
    evaluate: (t, clubs) => mapOf(clubs, (id) => t.ledger.pctWhere(id, (g) => t.ledger.places.has(g.opp) && t.ledger.sameConference(id, g.opp))),
  },
  common_pct: {
    id: 'common_pct', pointsBased: false,
    evaluate: (t, clubs) => {
      const common = commonOpponents(t.ledger, clubs);
      if (common.size === 0) return null;
      return mapOf(clubs, (id) => t.ledger.pctWhere(id, (g) => common.has(g.opp)));
    },
  },
  common_pct_min: {
    id: 'common_pct_min', pointsBased: false,
    evaluate: (t, clubs) => {
      const common = commonOpponents(t.ledger, clubs);
      const min = num(t.rules, KEY.commonGamesMin);
      for (const c of clubs) if (games(t.ledger.recordWhere(c, (g) => common.has(g.opp))) < min) return null;
      return mapOf(clubs, (id) => t.ledger.pctWhere(id, (g) => common.has(g.opp)));
    },
  },
  strength_of_victory: { id: 'strength_of_victory', pointsBased: false, evaluate: (t, clubs) => mapOf(clubs, (id) => t.ledger.strengthOfVictory(id)) },
  strength_of_schedule: { id: 'strength_of_schedule', pointsBased: false, evaluate: (t, clubs) => mapOf(clubs, (id) => t.ledger.strengthOfSchedule(id)) },
  conference_points_rank: {
    id: 'conference_points_rank', pointsBased: true,
    evaluate: (t, clubs) => {
      const conf = t.ledger.place(clubs[0]!).conferenceId;
      return combinedRanking(t, t.ledger.clubs.filter((c) => t.ledger.place(c).conferenceId === conf), clubs);
    },
  },
  league_points_rank: { id: 'league_points_rank', pointsBased: true, evaluate: (t, clubs) => combinedRanking(t, t.ledger.clubs, clubs) },
  common_net_points: {
    id: 'common_net_points', pointsBased: true,
    evaluate: (t, clubs) => {
      const common = commonOpponents(t.ledger, clubs);
      if (common.size === 0) return null;
      return netPoints(t, clubs, () => (g) => common.has(g.opp));
    },
  },
  conference_net_points: {
    id: 'conference_net_points', pointsBased: true,
    evaluate: (t, clubs) => netPoints(t, clubs, (id) => (g) => t.ledger.places.has(g.opp) && t.ledger.sameConference(id, g.opp)),
  },
  net_points: { id: 'net_points', pointsBased: true, evaluate: (t, clubs) => netPoints(t, clubs, () => () => true) },
  net_touchdowns: {
    id: 'net_touchdowns', pointsBased: true,
    evaluate: (t, clubs) => mapOf(clubs, (id) => { const n = t.ledger.netTouchdowns(id); if (n.hyp) t.noteHypothetical(); return n.net; }),
  },
  coin_toss: {
    id: 'coin_toss', pointsBased: true,
    evaluate: (t, clubs) => {
      if (t.ledger.hasHypothetical) t.noteHypothetical();
      const order = t.draw.draw([...clubs].sort((a, b) => a - b), `tiebreak:${clubs.join(',')}`);
      return mapOf(clubs, (id) => -order.indexOf(id));
    },
  },
};

/** The published lists, in order (research 3a, 3c, 3d, 3f(B)(i)). */
export const LISTS: Record<ListId, readonly StepId[]> = {
  division: ['head_to_head', 'division_pct', 'common_pct', 'conference_pct', 'strength_of_victory', 'strength_of_schedule',
    'conference_points_rank', 'league_points_rank', 'common_net_points', 'net_points', 'net_touchdowns', 'coin_toss'],
  wildcard_two: ['head_to_head', 'conference_pct', 'common_pct_min', 'strength_of_victory', 'strength_of_schedule',
    'conference_points_rank', 'league_points_rank', 'conference_net_points', 'net_points', 'net_touchdowns', 'coin_toss'],
  wildcard_multi: ['one_per_division', 'head_to_head_sweep', 'conference_pct', 'common_pct_min', 'strength_of_victory', 'strength_of_schedule',
    'conference_points_rank', 'league_points_rank', 'conference_net_points', 'net_points', 'net_touchdowns', 'coin_toss'],
  interconference: ['head_to_head', 'common_pct_min', 'strength_of_victory', 'league_points_rank', 'net_points', 'net_touchdowns', 'coin_toss'],
};

const SWEEP_INDEX = LISTS.wildcard_multi.indexOf('head_to_head_sweep');
/** Club counts that name the two-club and three-club formats (research 3b, 3d). Procedure shape, not a football number. */
const PAIR = 1 + 1;
const TRIO = PAIR + 1;

export interface TiebreakerOptions {
  /** Club to its place within its division (0 is first), fixed before wild-card ties are broken (research 3d step 1 note). */
  readonly divisionOrder?: ReadonlyMap<TeamId, number>;
}

export class Tiebreaker {
  readonly log: TieLogEntry[] = [];
  private hypotheticalUsed = false;
  private currentStepPointsBased = false;

  constructor(readonly ledger: Ledger, readonly rules: RuleValues, readonly draw: TieDraw, readonly options: TiebreakerOptions = {}) {}

  /** True once a points-based step or coin toss read a made-up game (C3.3.2): the order is then not certain. */
  get uncertain(): boolean { return this.hypotheticalUsed; }
  noteHypothetical(): void { if (this.currentStepPointsBased) this.hypotheticalUsed = true; }

  /** The best club among tied clubs, by the list the family and the clubs' places call for. */
  pickBest(clubs: readonly TeamId[], family: TieFamily): TeamId {
    if (clubs.length === 0) throw new Error('no clubs to break a tie between');
    if (clubs.length === 1) return clubs[0]!;
    const l = this.ledger;
    const first = clubs[0]!;
    if (clubs.every((c) => l.sameDivision(first, c))) return this.runList('division', 0, clubs, family);
    if (family === 'conference' || clubs.every((c) => l.sameConference(first, c))) {
      return clubs.length === PAIR ? this.runList('wildcard_two', 0, clubs, 'conference') : this.wildcardMulti(clubs);
    }
    // Interconference (C3.5.1): one club per conference first, by that conference's procedure.
    const reduced = this.reduceBy(clubs, (c) => l.place(c).conferenceId, (sub) => this.pickBest(sub, 'conference'), 'interconference');
    return reduced.length === 1 ? reduced[0]! : this.runList('interconference', 0, reduced, family);
  }

  /** Every club in order, best first, by repeated picks: the next spot always restarts with all clubs left (C3.2.3 rule 4). */
  orderTied(clubs: readonly TeamId[], family: TieFamily): TeamId[] {
    const left = [...clubs];
    const out: TeamId[] = [];
    while (left.length) {
      const best = this.pickBest(left, family);
      out.push(best);
      left.splice(left.indexOf(best), 1);
    }
    return out;
  }

  /** Clubs ordered by winning percentage, every tie broken (C3.1.3, C3.3.1). */
  orderByPct(clubs: readonly TeamId[], family: TieFamily): TeamId[] {
    const groups = new Map<number, TeamId[]>();
    for (const c of clubs) { const p = this.ledger.pct(c); groups.set(p, [...(groups.get(p) ?? []), c]); }
    return [...groups.keys()].sort((a, b) => b - a).flatMap((p) => this.orderTied(groups.get(p)!, family));
  }

  private wildcardMulti(clubs: readonly TeamId[]): TeamId {
    const l = this.ledger;
    const order = this.options.divisionOrder;
    const reduced = this.reduceBy(clubs, (c) => l.place(c).divisionId, (sub) => {
      if (order && sub.every((c) => order.has(c))) return [...sub].sort((a, b) => order.get(a)! - order.get(b)!)[0]!;
      return this.pickBest(sub, 'conference');
    }, 'wildcard_multi');
    if (reduced.length === 1) return reduced[0]!;
    if (reduced.length === PAIR) return this.runList('wildcard_two', 0, reduced, 'conference');
    return this.runList('wildcard_multi', SWEEP_INDEX, reduced, 'conference');
  }

  /** Step 1 of the multi-club wild-card list (and its interconference twin): keep the best club of each group. */
  private reduceBy(clubs: readonly TeamId[], groupOf: (c: TeamId) => number, best: (sub: TeamId[]) => TeamId, list: ListId): TeamId[] {
    const groups = new Map<number, TeamId[]>();
    for (const c of clubs) groups.set(groupOf(c), [...(groups.get(groupOf(c)) ?? []), c]);
    const keep = [...groups.values()].map((sub) => (sub.length === 1 ? sub[0]! : best(sub)));
    const removed = clubs.filter((c) => !keep.includes(c));
    if (removed.length) this.log.push({ list, stepNumber: 1, step: 'one_per_division', clubs: [...clubs], advanced: null, removed });
    return clubs.filter((c) => keep.includes(c));
  }

  private runList(list: ListId, start: number, clubs: readonly TeamId[], family: TieFamily): TeamId {
    const steps = LISTS[list];
    let group = [...clubs];
    for (let i = start; i < steps.length; i++) {
      if (group.length === 1) return group[0]!;
      const def = STEP[steps[i]!];
      this.currentStepPointsBased = def.pointsBased;
      const values = def.evaluate(this, group);
      this.currentStepPointsBased = false;
      if (!values) continue;
      const best = Math.max(...group.map((c) => values.get(c)!));
      const top = group.filter((c) => values.get(c) === best);
      if (top.length === group.length) continue;
      const removed = group.filter((c) => !top.includes(c));
      if (top.length === 1) {
        this.log.push({ list, stepNumber: i + 1, step: def.id, clubs: group, advanced: top[0]!, removed: [] });
        return top[0]!;
      }
      this.log.push({ list, stepNumber: i + 1, step: def.id, clubs: group, advanced: null, removed });
      // C3.2.3 restarts inside a pass.
      if (top.length === PAIR) return this.pickBest(top, family);
      if (top.length === TRIO && str(this.rules, KEY.restarts) !== CONTINUE_ON_THREE) {
        if (list === 'division') return this.runList('division', 0, top, family);
        if (list === 'wildcard_multi') return this.runList('wildcard_multi', SWEEP_INDEX, top, family);
        return this.runList(list, 0, top, family);
      }
      group = top;
    }
    throw new Error(`tiebreak list ${list} ended without a winner`);
  }
}

/** The step that decided a two-club tie, for the hover text of C3.2.1 ("wins tie on division record"). */
export function decidingStep(log: readonly TieLogEntry[], winner: TeamId): TieLogEntry | null {
  for (let i = log.length - 1; i >= 0; i--) if (log[i]!.advanced === winner) return log[i]!;
  return null;
}
