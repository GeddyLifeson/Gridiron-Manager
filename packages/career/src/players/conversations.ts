// The conversation system (L1.2.1) and the talks built on it: role definition (L1.2.2), playing time (L1.2.3),
// correction and praise (L1.2.4), personal matters and the open door (L1.2.5), and who may hold which talk at
// each rung (L1.5.2). Types are data rows (conversations.json): adding one needs a row and text only.
import { mayReceiveEvent, type PersonOrigin, type WorldDate } from '@gm/schema';
import TABLE from './conversations.json' with { type: 'json' };
import { clamp, weeksBetween } from './math.ts';
import { pp } from './params.ts';
import type { HalfLifeClass, RelationshipRecord } from './record.ts';

export type Approach = 'direct' | 'supportive' | 'challenging' | 'delegate';
export type SpokenApproach = Exclude<Approach, 'delegate'>;
export type RuleSwitch = 'always' | 'contracts' | 'no_contracts';

export interface ConversationType {
  readonly base: Readonly<Record<SpokenApproach, number>>;
  readonly fit: Readonly<Record<SpokenApproach, Readonly<Record<string, number>>>>;
  readonly major: boolean;
  readonly minutes: number;
  readonly when: RuleSwitch;
  readonly rung: string;
  readonly halfLife: HalfLifeClass;
  readonly textKey: string;
  readonly leaf: string;
}

interface Table { types: Record<string, ConversationType>; rungs: string[]; promiseRung: string }
const T = TABLE as unknown as Table;

export const CONVERSATION_TYPES: Readonly<Record<string, ConversationType>> = T.types;
export const RUNGS: readonly string[] = T.rungs;

export function conversationType(id: string): ConversationType {
  const t = CONVERSATION_TYPES[id];
  if (!t) throw new Error(`career.players: unknown conversation type ${id}`);
  return t;
}

function rungIndex(rung: string): number {
  const i = RUNGS.indexOf(rung);
  if (i < 0) throw new Error(`career.players: unknown rung ${rung}`);
  return i;
}

/** True when the type is on under the level's rules (`league_rules.player_contracts`, L1.4.4, L1.5.1). */
export function typeIsOn(t: ConversationType, playerContracts: boolean): boolean {
  return t.when === 'always' || (t.when === 'contracts') === playerContracts;
}

/** Conversation types the user may hold at his rung under the level's rules (L1.5.2 table). */
export function typesOffered(rung: string, playerContracts: boolean): string[] {
  const r = rungIndex(rung);
  return Object.keys(CONVERSATION_TYPES).filter((id) => {
    const t = CONVERSATION_TYPES[id]!;
    return typeIsOn(t, playerContracts) && rungIndex(t.rung) <= r;
  }).sort();
}

/** May a coach at this rung make a promise that he can be held to (L1.5.2)? A statement beyond it is still allowed and recorded. */
export function mayPromise(rung: string): boolean {
  return rungIndex(rung) >= rungIndex(T.promiseRung);
}

/** fit(approach, player) (L1.2.1): facet weights from the row, each (facet - 50)/50, scaled and clamped. */
export function approachFit(t: ConversationType, a: SpokenApproach, facets: Readonly<Record<string, number>>): number {
  let s = 0;
  for (const [facet, w] of Object.entries(t.fit[a])) s += w * ((clamp(facets[facet] ?? 50, 0, 100) - 50) / 50);
  const span = pp('talk.fitSpan');
  return clamp(s * span, -span, span);
}

export interface ConversationInput {
  readonly typeId: string;
  readonly approach: Approach;
  readonly date: WorldDate;
  /** The player's record about the coach who speaks (the position coach's when delegated). */
  readonly playerRecord: RelationshipRecord;
  readonly facets: Readonly<Record<string, number>>;
  /** Optional reason: true when checkable and true against the film grades he can see (L1.2.1). */
  readonly reason: 'none' | 'true' | 'false';
  /** The talk happens before the decision is visible elsewhere (L1.2.1 timing bonus). */
  readonly beforeVisible: boolean;
  /** He is injured and away: by phone at 70 percent effect (L1.2.1 edge case). */
  readonly byPhone: boolean;
  /** coach_word multiplier (L1.3.2), applied to talks that carry a statement or a reason. */
  readonly statementMultiplier: number;
  /** A promise is attached (L1.3.1). */
  readonly withPromise: boolean;
  /** Youth multiplier (L1.5.1), 1 when it does not apply. */
  readonly youthScale: number;
  /** Seeded draw in [0, 1) for the decline check. */
  readonly draw: number;
}

export interface ConversationResult {
  readonly held: boolean;
  /** He declined, or brought his agent in (L1.2.1 edge case: trust under 15). */
  readonly declined: boolean;
  readonly score: number;
  readonly band: 'good' | 'neutral' | 'bad';
  /** Memory for the player's record about the speaker: event kind and strength for `applyEvent`. */
  readonly memory: { readonly kind: 'talk_good' | 'talk_neutral' | 'talk_bad'; readonly strength: number; readonly scale: number } | null;
  /** Extra memory on his record about the head coach when a major talk was handed off (-6). */
  readonly handOffMemory: { readonly kind: 'did_not_tell_me_himself' } | null;
  /** Hours the user spends (E7): none when delegated. */
  readonly userMinutes: number;
  /** Familiarity for the user: none when delegated. */
  readonly userFamiliarity: boolean;
  /** The line the player says, as a template key. */
  readonly replyKey: string;
}

/**
 * Hold one conversation (L1.2.1). score = base(type, approach) + fit + 0.2 * (trust - 50) + reason bonus +
 * timing bonus. Above +15 good, below -15 bad. Delegated talks use the position coach's record (the caller
 * passes it as `playerRecord`) with his approach `direct`, cost the user nothing and give no familiarity.
 */
export function holdConversation(i: ConversationInput): ConversationResult {
  const t = conversationType(i.typeId);
  const delegated = i.approach === 'delegate';
  const trust = i.playerRecord.trust;
  if (!delegated && trust < pp('talk.declineTrustBelow') && i.draw < (pp('talk.declineTrustBelow') - trust) / pp('talk.declineTrustBelow')) {
    return { held: false, declined: true, score: 0, band: 'neutral', memory: null, handOffMemory: null, userMinutes: 0, userFamiliarity: false, replyKey: `${t.textKey}.declined` };
  }
  const a: SpokenApproach = delegated ? 'direct' : i.approach as SpokenApproach;
  const reasonBonus = i.reason === 'true' ? pp('talk.reasonTrue') : i.reason === 'false' ? pp('talk.reasonFalse') : 0;
  const score = t.base[a] + approachFit(t, a, i.facets) + pp('talk.trustWeight') * (trust - 50) + reasonBonus + (i.beforeVisible ? pp('talk.timing') : 0);
  const band = score > pp('talk.goodAbove') ? 'good' : score < pp('talk.badBelow') ? 'bad' : 'neutral';
  const statement = i.withPromise || i.reason !== 'none';
  const scale = (i.byPhone ? pp('talk.phoneShare') : 1) * (statement ? i.statementMultiplier : 1) * i.youthScale;
  return {
    held: true,
    declined: false,
    score,
    band,
    memory: { kind: `talk_${band}`, strength: clamp(score * pp('talk.memoryScale'), -100, 100), scale },
    handOffMemory: delegated && t.major ? { kind: 'did_not_tell_me_himself' } : null,
    userMinutes: delegated ? 0 : clamp(t.minutes, pp('talk.minutesMin'), pp('talk.minutesMax')),
    userFamiliarity: !delegated,
    replyKey: `${t.textKey}.${a}.${band}`,
  };
}

// L1.2.2 role definition

export const ROLE_STEPS = ['scout_team', 'practice_squad', 'developmental', 'special_teams_core', 'situational', 'rotation', 'starter'] as const;
export type Role = (typeof ROLE_STEPS)[number];

export function roleGap(expected: Role, stated: Role): number {
  return ROLE_STEPS.indexOf(expected) - ROLE_STEPS.indexOf(stated);
}

export interface RoleTalkResult {
  readonly roleBeliefChange: number;
  /** Two or more steps below what he expects: flagged for a personal talk (L1.2.2). */
  readonly flagForPersonalTalk: boolean;
  /** Stated above the depth chart: a promise checked after two games. Stated starter: a standing implied promise. */
  readonly createsPromise: 'none' | 'above_depth_chart' | 'implied_starter';
}

/**
 * Role_belief change from a role talk (L1.2.2): equal +5; one step below -5, halved with a reason; two or
 * more below -15, halved only with a personal talk and a reason. A stated role above expectation is equal.
 */
export function roleTalk(expected: Role, stated: Role, depthChartRole: Role, withReason: boolean, personal: boolean): RoleTalkResult {
  const gap = roleGap(expected, stated);
  let change: number;
  if (gap <= 0) change = pp('role.equal');
  else if (gap === 1) change = pp('role.oneBelow') * (withReason ? 0.5 : 1);
  else change = pp('role.twoBelow') * (withReason && personal ? 0.5 : 1);
  const above = ROLE_STEPS.indexOf(stated) > ROLE_STEPS.indexOf(depthChartRole);
  return {
    roleBeliefChange: change,
    flagForPersonalTalk: gap >= pp('role.flagGapSteps'),
    createsPromise: above ? 'above_depth_chart' : stated === 'starter' ? 'implied_starter' : 'none',
  };
}

// L1.2.3 playing-time talks

export type DemotionChoice = 'tell_now' | 'position_coach' | 'say_nothing';

/** The prompt raised by a depth chart change that drops a player a role step: exactly one per drop (L1.2.3). */
export interface DemotionPrompt {
  readonly playerId: number;
  readonly fromRole: Role;
  readonly toRole: Role;
  /** A benching during a game: the talk is for the next day and skipping it costs more (L1.2.3 edge case). */
  readonly duringGame: boolean;
  /** The starter returned from injury: the stand-in still gets the prompt. */
  readonly starterReturned: boolean;
}

export function demotionPrompts(before: ReadonlyMap<number, Role>, after: ReadonlyMap<number, Role>, duringGame: boolean, returnedStarters: ReadonlySet<number> = new Set()): DemotionPrompt[] {
  const out: DemotionPrompt[] = [];
  for (const [id, toRole] of [...after.entries()].sort((x, y) => x[0] - y[0])) {
    const fromRole = before.get(id);
    if (fromRole !== undefined && ROLE_STEPS.indexOf(toRole) < ROLE_STEPS.indexOf(fromRole)) {
      out.push({ playerId: id, fromRole, toRole, duringGame, starterReturned: returnedStarters.size > 0 });
    }
  }
  return out;
}

/**
 * What skipping the talk costs when the depth chart posts (L1.2.3, L1.2.1): "found out from the depth chart"
 * (-10), or the larger sideline memory for an in-game benching. Telling him first gives +5 (L1.1.2).
 */
export function demotionMemory(p: DemotionPrompt, choice: DemotionChoice): { kind: string; strength?: number } {
  if (choice === 'say_nothing') return p.duringGame ? { kind: 'found_out_sideline', strength: pp('pt.foundOutDepthChart') * pp('pt.foundOutSidelineScale') } : { kind: 'found_out_depth_chart' };
  return { kind: 'told_before_depth_chart' };
}

// L1.2.4 correction and praise

/** Praise has diminishing value: each praise within four weeks is worth half the last (L1.2.4). */
export function praiseStrength(baseStrength: number, earlierPraiseDates: readonly WorldDate[], today: WorldDate): number {
  let n = 0;
  for (const d of earlierPraiseDates) {
    const w = weeksBetween(d, today);
    if (w >= 0 && w < pp('praise.windowWeeks')) n++;
  }
  let s = baseStrength;
  for (let k = 0; k < n; k++) s *= pp('praise.repeatShare');
  return s;
}

/** A correction is a true reason with the clip, a false reason without evidence when his grade was good (L1.2.4). */
export function correctionReason(withClip: boolean, gradeWasGood: boolean): 'true' | 'false' | 'none' {
  if (withClip) return 'true';
  return gradeWasGood ? 'false' : 'none';
}

/** Never corrected while his grades fall: a high-coachability player loses 1 respect a week (L1.2.4). */
export function neglectRespectLoss(coachability: number, gradesFalling: boolean, correctedThisWeek: boolean): number {
  if (!gradesFalling || correctedThisWeek || coachability < pp('praise.neglectCoachabilityMin')) return 0;
  return -pp('praise.neglectRespectPerWeek');
}

/** The staff's suggested list after grading: three to six players, never more than six (L1.2.4). */
export function suggestedTalks<T extends { playerId: number; priority: number }>(candidates: readonly T[]): T[] {
  return [...candidates].sort((a, b) => b.priority - a.priority || a.playerId - b.playerId).slice(0, pp('praise.suggestMax'));
}

// L1.2.5 personal matters and the open door

export interface OpenDoorState {
  /** Requests he brought that went unanswered in a row. */
  readonly unanswered: number;
}

/**
 * May this player bring a personal matter now (L1.2.5)? Never for an imported real person (L9.1.2 rule 1:
 * family and personal events of any kind are personal-class), and with zero open-door hours never once
 * two requests went unanswered.
 */
export function mayBringPersonalMatter(person: { origin: PersonOrigin }, openDoorHours: number, s: OpenDoorState): boolean {
  if (!mayReceiveEvent(person, { importedAllowed: false })) return false;
  // With the door shut nobody answers, so the unanswered count reaches the stop within two requests.
  return openDoorHours > 0 || s.unanswered < pp('personal.unansweredStop');
}

export function afterPersonalRequest(s: OpenDoorState, answered: boolean): OpenDoorState {
  return { unanswered: answered ? 0 : s.unanswered + 1 };
}

/** L1.5.1: first and second-year players weigh praise, correction and playing time 1.2 times, where players can transfer. */
export function youthScale(yearsInProgram: number, playersCanTransfer: boolean): number {
  return playersCanTransfer && yearsInProgram <= pp('youth.years') ? pp('youth.scale') : 1;
}
