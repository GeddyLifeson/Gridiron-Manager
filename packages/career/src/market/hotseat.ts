// Hot seat signs (E4.4.1) and the assistant's weakened view of his head coach's seat (E4.7.1). A sign is
// a fact in the inbox or news, never a label that says "hot seat". Confidence itself is G-77's
// (front-office stakeholders); the world runner passes the values in, so this file never reads a decider
// profile beyond the traits E4.4.1 names.
import type { RandomStream } from '@gm/schema';
import { clamp, param } from './params.ts';

export const SIGNS = [
  'vote_of_confidence', 'no_extension_talk', 'forced_staff_change', 'leaks', 'owner_attends', 'plan_questions', 'agent_hears_inquiries', 'players_asked', 'removed_authority',
] as const;
export type Sign = (typeof SIGNS)[number];

export interface SeatState {
  /** Owner confidence 0 to 100 (G-77 `updateConfidence`). */
  readonly confidence: number;
  readonly mediaMood: number;
  /** General manager's view 0 to 100; null where no GM sits between decider and coach. */
  readonly gmView: number | null;
  readonly ownerInvolvement: number;
  readonly ownerCandour: number;
  /** Entering the second-to-last contract year this week. */
  readonly enteringPenultimateYear: boolean;
  /** This week holds the main review (E4.3.1). */
  readonly mainReview: boolean;
  /** The main review ended "keep with conditions". */
  readonly keptWithConditions: boolean;
}

/** E4.4.1 trigger table. Weekly signs test every week; review signs only at the main review. */
export function inBand(sign: Sign, s: SeatState): boolean {
  const c = s.confidence;
  switch (sign) {
    case 'vote_of_confidence': return c >= 30 && c <= 45 && s.mediaMood < 40 && s.ownerCandour < param('sign.candidVoteSkip');
    case 'no_extension_talk': return s.enteringPenultimateYear && c < 60;
    case 'forced_staff_change': return s.mainReview && c >= 30 && c <= 50;
    case 'leaks': return c < 45 && s.gmView !== null && s.gmView < 40;
    case 'owner_attends': return c < 50 && s.ownerInvolvement > param('sign.involvementAbove');
    case 'plan_questions': return c < 45;
    case 'agent_hears_inquiries': return c < 35;
    case 'players_asked': return c < 35;
    case 'removed_authority': return s.mainReview && s.keptWithConditions && c < 40;
  }
}

/** Signs that can only occur at a point in time (review, contract year), not on the weekly roll. */
const EVENT_SIGNS: ReadonlySet<Sign> = new Set(['no_extension_talk', 'forced_staff_change', 'removed_authority']);

/** Week index of the last time each sign fired for this coach. */
export type SignMemory = Readonly<Partial<Record<Sign, number>>>;

export interface SignRoll { readonly fired: readonly Sign[]; readonly memory: SignMemory; readonly coachHours: number }

/**
 * One week of signs. In band: the weekly chance (event signs fire with certainty when their moment comes).
 * Out of band: the off-band share of that chance, so one sign alone proves nothing. A sign fires at most
 * once per cooldown per type. One uniform per sign tested, in table order.
 */
export function rollSigns(s: SeatState, week: number, memory: SignMemory, stream: RandomStream): SignRoll {
  const fired: Sign[] = [];
  const mem: Partial<Record<Sign, number>> = { ...memory };
  for (const sign of SIGNS) {
    const last = mem[sign];
    const cooling = last !== undefined && week - last < param('sign.cooldownWeeks');
    const band = inBand(sign, s);
    let p: number;
    if (EVENT_SIGNS.has(sign)) p = band ? 1 : 0;
    else p = band ? param('sign.weeklyChance') : param('sign.weeklyChance') * param('sign.offBandShare');
    const hit = stream.uniform() < p;
    if (hit && !cooling) { fired.push(sign); mem[sign] = week; }
  }
  return { fired, memory: mem, coachHours: fired.includes('owner_attends') ? param('sign.ownerVisitHours') : 0 };
}

/** The vote of confidence is true about half the time; the statement itself does not move confidence. */
export function voteIsTrue(stream: RandomStream): boolean {
  return stream.chance(param('sign.voteTrueShare'));
}

/**
 * E4.7.1: an assistant sees his head coach's signs in weakened form, with accuracy rising with his rung:
 * a coordinator sees most, a quality control coach almost none. Chance he hears of a fired sign.
 */
export function assistantSeesChance(rung: number): number {
  const x = clamp(rung / param('assistantView.maxRung'), 0, 1);
  return x * x;
}

/** Filter a week's signs to what an assistant at `rung` hears. One uniform per sign. */
export function assistantView(fired: readonly Sign[], rung: number, stream: RandomStream): readonly Sign[] {
  const p = assistantSeesChance(rung);
  return fired.filter(() => stream.uniform() < p);
}
