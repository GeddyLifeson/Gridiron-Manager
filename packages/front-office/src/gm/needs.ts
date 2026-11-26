// K7.2.1 team needs and the coach's voice. The general manager builds his own list from his own grades, then
// blends the head coach's asks at `coachVoiceWeight`. Asks are logged, and how a pushed player turns out
// moves L5.2.4 trust (this module reports the direction; L5 owns the trust record).
import type { GmProfile } from './profile.ts';
import { P } from './params.ts';
import { expectedGrade } from './value.ts';
import { clamp, sum, type PersonId, type PlayerView, type ValueContext } from './types.ts';

export type TimeFrame = 'now' | 'this_offseason' | 'next_year';
export interface Need { readonly position: string; readonly need: number; readonly gmNeed: number; readonly coachNeed: number | null; readonly frame: TimeFrame }

/** One ask by the head coach (the user through M1, M3.6.2 and M5, or K3.7.1 for an AI coach), best first. */
export interface CoachAsk { readonly position: string; readonly rank: number; readonly personId?: PersonId }

export interface NeedsInput {
  readonly roster: readonly PlayerView[];
  /** Positions of the head coach's system (K2.1.2), with the league baseline grade of a starter there as public estimates give it. */
  readonly baselineIss: Readonly<Record<string, number>>;
  /** Players whose contracts expire after this season (C6). */
  readonly expiring: ReadonlySet<PersonId>;
  /** Players who cannot play now (H5). */
  readonly unavailable: ReadonlySet<PersonId>;
}

function quality(gm: GmProfile, players: readonly PlayerView[], position: string, ctx: ValueContext): number {
  const w = ctx.table.slotWeights(position);
  const grades = players.map((v) => expectedGrade(gm, v, ctx, 0)).sort((a, b) => b - a);
  const total = sum(w);
  return total === 0 ? ctx.table.replacementIss(position) : sum(w.map((x, i) => x * (grades[i] ?? ctx.table.replacementIss(position)))) / total;
}

/** Rule 1: the general manager's own need by position, 0 to 1, with its time frame. */
export function gmNeeds(gm: GmProfile, input: NeedsInput, ctx: ValueContext): { position: string; need: number; frame: TimeFrame }[] {
  return Object.keys(input.baselineIss).sort().map((position) => {
    const here = input.roster.filter((v) => v.position === position);
    const playing = here.filter((v) => !input.unavailable.has(v.personId));
    const staying = here.filter((v) => !input.expiring.has(v.personId));
    const base = input.baselineIss[position]!;
    const pv = gm.philosophy.positionValues[position] ?? 1;
    const gap = (players: readonly PlayerView[]) => clamp(((base - quality(gm, players, position, ctx)) / P('needs.issScale')) * pv, 0, 1);
    const now = gap(playing);
    const later = clamp(gap(staying) * (1 + P('needs.expiryTerm')), 0, 1);
    const frame: TimeFrame = now >= P('needs.nowThreshold') ? 'now' : later > now ? 'this_offseason' : 'next_year';
    return { position, need: Math.max(now, later), frame };
  });
}

/** Rule 3: an ask is worth less the lower it ranks, and asks beyond the first five count at half weight. */
export function askWeight(rank: number): number {
  const w = Math.max(0, 1 - (rank - 1) * P('needs.rankStep'));
  return rank > P('needs.fullWeightAsks') ? w * P('needs.extraAskFactor') : w;
}

/** Rule 2 (rule 5 at college: pass `w` 1): need = (1 - w) x gmNeed + w x coachNeed for positions the coach listed. */
export function blendNeeds(gm: GmProfile, input: NeedsInput, asks: readonly CoachAsk[], ctx: ValueContext, w: number = gm.coachVoiceWeight): Need[] {
  const coach = new Map<string, number>();
  for (const a of [...asks].sort((x, y) => x.rank - y.rank)) if (!coach.has(a.position)) coach.set(a.position, askWeight(a.rank));
  return gmNeeds(gm, input, ctx)
    .map((n) => {
      const c = coach.get(n.position);
      return { position: n.position, gmNeed: n.need, coachNeed: c ?? null, need: c === undefined ? (1 - w) * n.need : (1 - w) * n.need + w * c, frame: n.frame };
    })
    .sort((a, b) => b.need - a.need || (a.position < b.position ? -1 : 1));
}

/** Rule 4: a logged ask the front office acted on. */
export interface LoggedAsk { readonly ask: CoachAsk; readonly actedOn: boolean; readonly season: number }

/**
 * Rule 4: when a player the coach pushed for succeeds or fails, trust moves. `outcome` is -1 to 1 by the
 * general manager's own later grade of the player against what was paid. Asks not acted on move nothing.
 */
export function trustMove(log: LoggedAsk, outcome: number): number {
  return log.actedOn ? P('needs.trustStep') * clamp(outcome, -1, 1) * askWeight(log.ask.rank) : 0;
}

export const needAt = (needs: readonly Need[], position: string): number => needs.find((n) => n.position === position)?.need ?? 0;
