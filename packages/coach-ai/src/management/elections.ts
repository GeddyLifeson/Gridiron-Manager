// K5.7: penalty options, the coin toss and overtime elections, and resting starters. Option values come
// from the caller, which holds the rule engine's legal option list (B8) and the model built for the
// active rule set; this module only chooses. Tendency offsets do not apply to tosses (K5.7.2).
import type { Draws } from '../profile/draws.ts';
import { PTS } from './method.ts';
import { param } from './params.ts';
import type { CoachInputs } from './types.ts';

export interface ValuedOption {
  readonly optionId: string;
  /** Staff's estimated win probability of the resulting state (0 to 1). */
  readonly wp: number;
  /** Expected points of the resulting state, for a coach who does not think in clock terms (K5.7.1). */
  readonly ep: number;
}

export interface Election { readonly optionId: string; readonly best: string; readonly floor: boolean }

function sorted<T extends { optionId: string }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.optionId < b.optionId ? -1 : a.optionId > b.optionId ? 1 : 0));
}

/** The best option, then the A3 ruling 22 floor: every other legal option keeps a chance. One draw. */
function elect(options: readonly { optionId: string }[], best: string, draws: Draws): Election {
  const u = draws.uniform(), floorP = param('prob.floor');
  const others = options.map((o) => o.optionId).filter((id) => id !== best);
  if (others.length > 0 && u < floorP * others.length) return { optionId: others[Math.floor(u / floorP)]!, best, floor: true };
  return { optionId: best, best, floor: false };
}

function top(options: readonly ValuedOption[], value: (o: ValuedOption) => number): ValuedOption {
  let best = options[0]!;
  for (const o of options) if (value(o) > value(best)) best = o;
  return best;
}

/** K5.7.1: the option with the best estimated value. A coach at clockManagement z below -1 reads expected points only. */
export function penaltyChoice(options: readonly ValuedOption[], coach: CoachInputs, draws: Draws): Election {
  const list = sorted(options);
  if (list.length === 0) throw new Error('penalty choice: no option');
  const epOnly = coach.behavior.clockManagement < param('penalty.epOnlyMaxZ');
  return elect(list, top(list, (o) => (epOnly ? o.ep : o.wp)).optionId, draws);
}

/** Runoff options (I5.7.2) are valued the same way and always in win probability: they are clock decisions. */
export function runoffChoice(options: readonly ValuedOption[], coach: CoachInputs, draws: Draws): Election {
  return penaltyChoice(options, { ...coach, behavior: { ...coach.behavior, clockManagement: coach.behavior.clockManagement < param('penalty.epOnlyMaxZ') ? param('penalty.epOnlyMaxZ') : coach.behavior.clockManagement } }, draws);
}

export interface TossInput {
  /** Legal toss options with the model's value for this matchup and weather (K5.7.2). */
  readonly options: readonly ValuedOption[];
  /** Option id of deferring, when the rule set offers it. */
  readonly deferId: string | null;
  /** Wind speed in mph and the option id that puts it at his back in the fourth quarter, when goals are on offer. */
  readonly wind?: { readonly mph: number; readonly backInFourthId: string } | null;
}

/** K5.7.2 opening toss: defer unless the model says otherwise by more than the edge; pick the end by wind. */
export function tossChoice(i: TossInput, draws: Draws): Election {
  const list = sorted(i.options);
  if (list.length === 0) throw new Error('toss: no option');
  const has = (id: string | null | undefined) => id != null && list.some((o) => o.optionId === id);
  const model = top(list, (o) => o.wp);
  let best = model.optionId;
  if (has(i.deferId)) {
    const defer = list.find((o) => o.optionId === i.deferId)!;
    if ((model.wp - defer.wp) * PTS <= param('toss.deferEdgePts')) best = defer.optionId;
  } else if (i.wind && has(i.wind.backInFourthId) && i.wind.mph > param('toss.windMph') && list.every((o) => o.optionId === i.wind!.backInFourthId || (model.wp - o.wp) * PTS <= param('toss.deferEdgePts'))) {
    // Only goals (or equal-valued privileges) are on offer: take the wind.
    best = i.wind.backInFourthId;
  }
  return elect(list, best, draws);
}

/** K5.7.2 overtime: the election with the higher model value under the level's format. */
export function overtimeChoice(options: readonly ValuedOption[], draws: Draws): Election {
  const list = sorted(options);
  if (list.length === 0) throw new Error('overtime choice: no option');
  return elect(list, top(list, (o) => o.wp).optionId, draws);
}

/** Heads or tails: nothing to estimate. One draw. */
export function tossCall(optionIds: readonly string[], draws: Draws): string {
  const ids = [...optionIds].sort();
  return ids[Math.min(ids.length - 1, Math.floor(draws.uniform() * ids.length))]!;
}

// ---------------------------------------------------------------- K5.7.3 resting starters

/** Win probability above which he pulls the quarterback and named starters (and its mirror below). */
export function restThreshold(starterRestBias: number): number {
  const t = param('rest.wpBase') - starterRestBias * param('rest.perZ');
  return t < param('rest.wpMin') ? param('rest.wpMin') : t > param('rest.wpMax') ? param('rest.wpMax') : t;
}

export interface RestInput {
  /** Staff's estimated win probability now. */
  readonly wp: number;
  readonly starterRestBias: number;
  /** Starters are already out of this game. */
  readonly pulled: boolean;
  /** The owner or athletic director's goals forbid resting (K8.1.1). */
  readonly forbidden: boolean;
}

/** In game: pull above the threshold or below its mirror; bring them back inside the 5% to 95% band. One draw. */
export function restInGame(i: RestInput, draws: Draws): { pull: boolean; bringBack: boolean; floor: boolean } {
  const u = draws.uniform(), t = restThreshold(i.starterRestBias);
  if (i.pulled) {
    const back = i.wp > param('rest.returnLow') && i.wp < param('rest.returnHigh');
    return { pull: false, bringBack: back, floor: false };
  }
  const pull = !i.forbidden && (i.wp >= t || i.wp <= 1 - t);
  // A3 ruling 22: a coach may sit his starters in any game he is allowed to.
  if (!pull && !i.forbidden && u < param('prob.floor')) return { pull: true, bringBack: false, floor: true };
  return { pull, bringBack: false, floor: false };
}

/**
 * Season: rest when the game cannot change seeding by the tiebreak engine (C3) and his bias draw says so.
 * A game that can change seeding is never rested (acceptance): that is his own rule, so no floor applies.
 */
export function restForSeason(i: { canChangeSeeding: boolean; starterRestBias: number; forbidden: boolean }, draws: Draws): boolean {
  const u = draws.uniform();
  if (i.canChangeSeeding || i.forbidden) return false;
  const p = param('rest.seasonBase') + i.starterRestBias * param('rest.seasonPerZ'), floorP = param('prob.floor');
  return u < (p < floorP ? floorP : p > 1 - floorP ? 1 - floorP : p);
}
