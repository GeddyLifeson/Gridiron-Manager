// K7.5.1 recruiting boards, offers and hours; K7.5.2 the transfer market, retention and the roster budget.
// This file decides for an AI program's roster builder (K7.1.2). Every mechanic and limit is the league's:
// contact periods, offers, visits and commitments are `league.recruiting` (T4), windows, entry and tampering
// are `league.college` transfer (T6), pay sheets and agreements are `league.college` pay (T7), the roster
// declaration is T5.1.1. Nothing here files an offer or reads a rule value; the caller reads limits by key.
// All inputs are the staff's own estimates (D6, T4.3.1, the T6.2.1 staff read), never a true value.
import { PROB_FLOOR } from '@gm/schema';
import type { CollegeRosterPhilosophy, GmProfile } from './profile.ts';
import type { Need, OwnNeed, TimeFrame } from './needs.ts';
import { P } from './params.ts';
import { playerWorth, walkAwayCents } from './value.ts';
import { clamp, sum, type PersonId, type PlayerView, type ValueContext } from './types.ts';

/** How the K7.2.2 value is read: a high school board leans on projection, the transfer market on the grade today. */
export type Reading = 'board' | 'market';

/** Share of the gap between today's grade and the projection that this builder counts, by reading and `developVsBuy`. */
export function projectionWeight(b: CollegeRosterPhilosophy, reading: Reading): number {
  const base = reading === 'board' ? P('college.boardProjectionWeight') : P('college.marketProjectionWeight');
  return clamp(base + P('college.developLean') * (b.developVsBuy - P('profile.collegeMid')), 0, 1);
}

/** The player as this builder reads him: the grade moved toward the projection by `projectionWeight`. */
export function readAs<V extends PlayerView>(b: CollegeRosterPhilosophy, v: V, reading: Reading): V {
  if (!v.projected) return v;
  const w = projectionWeight(b, reading);
  const mean = v.grade.mean + w * Math.max(0, v.projected.mean - v.grade.mean);
  const variance = (1 - w) * (1 - w) * v.grade.variance + w * w * v.projected.variance;
  return { ...v, grade: { mean, variance }, projected: null };
}

/**
 * The roster builder as the valuer K7.2.2 takes: `positionValues` and `timeHorizon` are his own, the rest
 * neutral. `evaluation` is the K2.1.4 error of the coach doing the grading (z); there is no recruiting
 * skill (K7.1.2 rule 3).
 */
export function valuer(b: CollegeRosterPhilosophy, evaluation = 0): GmProfile {
  return {
    personId: b.personId,
    philosophy: { draftVsVeteran: 0, positionValues: b.positionValues, ageCurveBelief: {}, riskOnTraits: 0, pickValueCurve: 0, capStyle: 0, timeHorizon: b.timeHorizon },
    behavior: { evaluation, negotiation: 0, marketRead: 0 },
    coachVoiceWeight: 1,
    memory: { dealsWith: {}, playersPassedOn: [] },
  };
}

// ---------- K7.5.1 the board ----------

/** A prospect or transfer as one staff sees him. */
export interface Recruit extends PlayerView {
  readonly region: string;
  /** The staff's own estimate of the chance he signs here, 0 to 1 (T4.4 staff read). */
  readonly signChance: number;
  /** Committed to another program now (T4.5.2). */
  readonly committedElsewhere: boolean;
  /** From a two-year college or a lower division (T6.3.2). */
  readonly lowerSource: boolean;
}

/** Open places and the room's size by position, from the class plan (T4.8.1) and the T5 eligibility clock. */
export interface Places { readonly open: number; readonly target: number }

/** K7.5.1 rule 1 need term: places opening by position (graduating and leaving players) against the room's size. */
export function placeNeeds(b: CollegeRosterPhilosophy, places: Readonly<Record<string, Places>>): OwnNeed[] {
  return Object.keys(places).sort().map((position) => {
    const p = places[position]!;
    const need = p.target <= 0 ? 0 : clamp((p.open / p.target) * (b.positionValues[position] ?? 1), 0, 1);
    const frame: TimeFrame = need >= P('needs.nowThreshold') ? 'now' : 'this_offseason';
    return { position, need, frame };
  });
}

/** K7.1.2 `highSchoolVsTransfer`: of the open places, how many he holds for high school signees and how many for transfers. */
export function placeSplit(b: CollegeRosterPhilosophy, open: number): { readonly highSchool: number; readonly transfer: number } {
  const highSchool = Math.round(Math.max(0, open) * clamp(b.highSchoolVsTransfer, 0, 1));
  return { highSchool, transfer: Math.max(0, open) - highSchool };
}

export interface RecruitRow { readonly personId: PersonId; readonly score: number; readonly signChance: number }

/**
 * K7.5.1 rule 1: board score = K7.2.2 value with projection weighted heavily, a need term by opening
 * positions, and `regionalFocus` on the program's home areas. Best first.
 */
export function recruitBoard(b: CollegeRosterPhilosophy, pool: readonly Recruit[], needs: readonly (Need | OwnNeed)[], homeRegions: ReadonlySet<string>, ctx: ValueContext, evaluation = 0): RecruitRow[] {
  const gm = valuer(b, evaluation);
  const need = (position: string) => needs.find((n) => n.position === position)?.need ?? 0;
  return pool.map((v) => {
    const home = homeRegions.has(v.region) ? 1 + P('college.regionBonus') * b.regionalFocus : 1;
    return { personId: v.personId, signChance: v.signChance, score: playerWorth(gm, readAs(b, v, 'board'), ctx).value * (1 + P('college.needWeight') * need(v.position)) * home };
  }).sort((x, y) => y.score - x.score || x.personId - y.personId);
}

/**
 * K7.5.1 rule 2: offers = open places times a multiple. `perSignee` is content data for the program's tier
 * (8 to 9 at power programs, 2 of 3; other tiers carry the no-data flag in content). Programs that lose more
 * head-to-head battles offer more, inside the 3 to 20 spread the leaf gives.
 */
export function offersWanted(openPlaces: number, perSignee: number, headToHeadLossShare: number): number {
  const half = P('college.evenBattleShare');
  const multiple = clamp(perSignee * (1 + P('college.offerLossSpread') * (clamp(headToHeadLossShare, 0, 1) - half) / half), P('college.offerMultipleMin'), P('college.offerMultipleMax'));
  return Math.max(0, Math.round(Math.max(0, openPlaces) * multiple));
}

/**
 * K7.5.1 rule 2, second sentence: of his offers, the ones he would take a commitment on today. The rest
 * are offers "the school would not accept a commitment on" (T4.4.5 decides what happens when one is tried).
 */
export function committable(board: readonly RecruitRow[], openPlaces: number): PersonId[] {
  return board.slice(0, Math.max(0, Math.round(openPlaces * P('college.committablePerPlace')))).map((r) => r.personId);
}

/**
 * K7.5.1 rule 3: one staff member's recruiting hours go to prospects by board score times the estimated
 * chance to sign. `capPerProspect` is what the contact rules allow for the period (read by key by the
 * caller); hours over a cap flow to the next prospects. Whole hours; the remainder goes to the best first.
 */
export function hoursSplit(hours: number, rows: readonly RecruitRow[], capPerProspect: number): Map<PersonId, number> {
  const out = new Map<PersonId, number>();
  const live = rows.map((r) => ({ id: r.personId, w: Math.max(0, r.score) * clamp(r.signChance, 0, 1) })).filter((r) => r.w > 0).sort((a, b) => b.w - a.w || a.id - b.id);
  let left = Math.max(0, Math.floor(hours));
  let open = live;
  while (left > 0 && open.length > 0) {
    const total = sum(open.map((r) => r.w));
    const before = left;
    const next: typeof open = [];
    for (const r of open) {
      const room = capPerProspect - (out.get(r.id) ?? 0);
      const give = Math.min(room, Math.floor(before * (r.w / total)), left);
      if (give > 0) { out.set(r.id, (out.get(r.id) ?? 0) + give); left -= give; }
      if ((out.get(r.id) ?? 0) < capPerProspect) next.push(r);
    }
    if (left === before) {
      // Shares all rounded to nothing: hand out single hours, best first.
      for (const r of next) { if (left === 0) break; out.set(r.id, (out.get(r.id) ?? 0) + 1); left -= 1; }
    }
    open = next.filter((r) => (out.get(r.id) ?? 0) < capPerProspect);
  }
  return out;
}

/**
 * K7.5.1 rule 5: keep recruiting a prospect committed elsewhere while the estimated chance is above the
 * floor. Below it the staff still might (MA-52: nothing possible has zero chance): `u` is a uniform draw
 * from the program's stream for this prospect and week.
 */
export function keepsRecruiting(signChance: number, u: number): boolean {
  return signChance >= P('college.flipFloor') || u < PROB_FLOOR;
}

// ---------- K7.5.2 retention, transfers, the budget, the limit ----------

export interface OwnPlayer {
  readonly view: PlayerView;
  /** The staff's read of his chance to leave in the coming window, 0 to 1 (T6.2.1 `staffRead`). */
  readonly leaveRisk: number;
  /** What it would take to keep him, as the staff estimates it, cents a year (T7 market value, his agent's word). */
  readonly askCents: number;
}

export interface RetentionOffer { readonly personId: PersonId; readonly offerCents: number; readonly priority: number }

/**
 * K7.5.2: before each window, rank own players by surplus times the risk of leaving and assign the retention
 * budget from the top. He never offers more than the player is worth to him for the coming season.
 */
export function retentionPlan(b: CollegeRosterPhilosophy, players: readonly OwnPlayer[], budgetCents: number, ctx: ValueContext): RetentionOffer[] {
  const gm = valuer(b);
  const ranked = players.map((p) => ({ p, priority: Math.max(0, playerWorth(gm, readAs(b, p.view, 'market'), ctx).surplus) * clamp(p.leaveRisk, 0, 1) }))
    .filter((x) => x.priority > 0).sort((x, y) => y.priority - x.priority || x.p.view.personId - y.p.view.personId);
  const out: RetentionOffer[] = [];
  let left = Math.max(0, budgetCents);
  for (const { p, priority } of ranked) {
    const offer = Math.min(p.askCents, walkAwayCents(gm, readAs(b, p.view, 'market'), ctx, 1), left);
    if (offer <= 0) continue;
    out.push({ personId: p.view.personId, offerCents: offer, priority });
    left -= offer;
  }
  return out;
}

/**
 * K7.5.2: transfer targets by need and surplus, with more weight on the current grade than the K7.5.1
 * board. Two-year college and lower-division players are a source by `highSchoolVsTransfer` and need (T6.3.2).
 * Contact with a player who has not entered is tampering (T6.4.1) and is raised in `violations.ts`.
 */
export function transferTargets(b: CollegeRosterPhilosophy, pool: readonly Recruit[], needs: readonly (Need | OwnNeed)[], ctx: ValueContext, evaluation = 0): RecruitRow[] {
  const gm = valuer(b, evaluation);
  const need = (position: string) => needs.find((n) => n.position === position)?.need ?? 0;
  return pool.map((v) => {
    const n = need(v.position);
    const source = v.lowerSource ? 1 + P('college.lowerSourceWeight') * (1 - b.highSchoolVsTransfer) * n : 1;
    return { personId: v.personId, signChance: v.signChance, score: Math.max(0, playerWorth(gm, readAs(b, v, 'market'), ctx).surplus) * (1 + P('college.needWeight') * n) * source };
  }).filter((r) => r.score > 0).sort((x, y) => y.score - x.score || x.personId - y.personId);
}

/**
 * K7.5.2: the pay budget split (T7.3.1) by the roster builder's record. Each player's share mixes two
 * shapes by `payShape`: near 0 the money spreads through the two-deep (share by the square root of his
 * value to this builder), near 1 a few stars are paid heavily (share by the cube). His value carries
 * `positionValues`. Sums to the budget or less.
 */
export function budgetSplit(b: CollegeRosterPhilosophy, roster: readonly PlayerView[], budgetCents: number, ctx: ValueContext): { readonly byPlayer: Map<PersonId, number>; readonly byPosition: Record<string, number> } {
  const gm = valuer(b);
  const shape = clamp(b.payShape, 0, 1);
  const rows = [...roster].sort((x, y) => x.personId - y.personId).map((v) => {
    const value = Math.max(0, playerWorth(gm, readAs(b, v, 'market'), ctx).value);
    return { v, spread: Math.sqrt(value), stars: value * value * value };
  });
  const spreadTotal = sum(rows.map((x) => x.spread)), starsTotal = sum(rows.map((x) => x.stars));
  const byPlayer = new Map<PersonId, number>();
  const byPosition: Record<string, number> = {};
  for (const x of rows) {
    const share = spreadTotal === 0 || starsTotal === 0 ? 0 : (1 - shape) * (x.spread / spreadTotal) + shape * (x.stars / starsTotal);
    const cents = Math.floor(Math.max(0, budgetCents) * share);
    byPlayer.set(x.v.personId, cents);
    byPosition[x.v.position] = (byPosition[x.v.position] ?? 0) + cents;
  }
  return { byPlayer, byPosition };
}

/**
 * K7.5.2 with T7.3.2: agreement terms follow `lockIn`. Near 0 one-year agreements, near 1 the longest term
 * the rules allow (`maxYears`, read by key) with a buyout as a share of a year's pay.
 */
export function agreementTerms(b: CollegeRosterPhilosophy, maxYears: number): { readonly years: number; readonly buyoutShare: number } {
  const lock = clamp(b.lockIn, 0, 1);
  const years = 1 + Math.round(lock * Math.max(0, maxYears - 1));
  return { years, buyoutShare: years > 1 ? lock * P('college.buyoutShareMax') : 0 };
}

/**
 * K7.5.2 with T5.1.2: to reach the roster limit he cuts, or asks to leave, from the bottom of his board.
 * Returns the players to go, worst first. Whether each leaves, and what a pushed-out player says, is T5.1.2's.
 */
export function trimToLimit(b: CollegeRosterPhilosophy, roster: readonly PlayerView[], limit: number, ctx: ValueContext): PersonId[] {
  const gm = valuer(b);
  const over = roster.length - limit;
  return over <= 0 ? [] : roster.map((v) => ({ id: v.personId, s: playerWorth(gm, readAs(b, v, 'market'), ctx).surplus })).sort((x, y) => x.s - y.s || x.id - y.id).slice(0, over).map((x) => x.id);
}
