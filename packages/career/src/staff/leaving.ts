// Leaving (L4.4.1, L4.4.2). Requests for the user's assistants arrive under the same rules as his own
// requests (L4.2.1 (3)); a refusal the league forbids is still a choice, marked with the rule, and writes
// one violation row through L8.2.5. Departures and firings produce memories and room effects only: no
// morale or performance bounce reads "recently fired a coach" (L4.4.2 acceptance).
import { clamp, param } from './params.ts';
import { permissionRule, type MoveKind } from './window.ts';
import type { HiringRules } from './keys.ts';
import { tieBetween, type Tie } from './network.ts';

export type RequestChoice = 'grant' | 'refuse' | 'counter';

export interface RequestOption {
  readonly choice: RequestChoice;
  /** True when choosing it breaks a league rule (the refuse of a protected request). Never disabled. */
  readonly violation: boolean;
  readonly ruleText: string | null;
}

/** The notice's choices (L4.4.1 acceptance: for a promotion the refuse choice is present and marked). */
export function requestOptions(kind: MoveKind, r: HiringRules): readonly RequestOption[] {
  const rule = permissionRule(kind, r);
  return [
    { choice: 'grant', violation: false, ruleText: null },
    { choice: 'refuse', violation: rule.needed && !rule.mayRefuse, ruleText: rule.ruleText },
    { choice: 'counter', violation: false, ruleText: null },
  ];
}

/** A memory to write (X6 rows through people.memory): holder, about whom, category, sign, strength. */
export interface MemoryDraft {
  readonly holderId: number;
  readonly aboutPersonId: number;
  readonly category: string;
  readonly sign: -1 | 0 | 1;
  readonly strength: number;
}

/** Refusing a request (allowed or not): "blocked my move" in him, witness copies to his ties on staff. */
export function refusalMemories(assistantId: number, headCoachId: number, staffIds: readonly number[], ties: ReadonlyMap<string, Tie>): readonly MemoryDraft[] {
  const s = param('leave.lateralBlockMemory');
  const out: MemoryDraft[] = [{ holderId: assistantId, aboutPersonId: headCoachId, category: 'staff.blocked_my_move', sign: -1, strength: s }];
  for (const id of staffIds) {
    if (id === assistantId || id === headCoachId) continue;
    if (tieBetween(ties, id, assistantId) > param('tie.witnessAbove')) out.push({ holderId: id, aboutPersonId: headCoachId, category: 'staff.blocked_my_move.witness', sign: -1, strength: s / 2 });
  }
  return out;
}

/** Supporting his rise (granting, recommending) writes a good memory in him (L4.4.1 last rule). */
export function supportMemory(assistantId: number, headCoachId: number): MemoryDraft {
  return { holderId: assistantId, aboutPersonId: headCoachId, category: 'staff.supported_my_move', sign: 1, strength: param('leave.lateralBlockMemory') / 2 };
}

/** One player in the departing coach's room. */
export interface RoomPlayer { readonly personId: number; readonly trustInCoach: number; readonly roleBeliefToStaff: number }

export interface DepartureEffect {
  readonly players: readonly RoomPlayer[];
  /** The room's coach_bond with the newcomer. */
  readonly coachBond: number;
}

/**
 * L4.4.1: each player trusting the departing coach above 60 loses 5 role_belief toward the staff, and the
 * room's coach_bond resets to the newcomer's starting value (his existing record with them, if any).
 */
export function departure(room: readonly RoomPlayer[], newcomerBond: number | null): DepartureEffect {
  return {
    players: room.map((p) => (p.trustInCoach > param('leave.roomTrustAbove') ? { ...p, roleBeliefToStaff: clamp(p.roleBeliefToStaff - param('leave.roleBeliefLoss'), 0, 100) } : p)),
    coachBond: newcomerBond ?? param('leave.newcomerBond'),
  };
}

/**
 * L4.4.1: promoting from within meets the advancement need of the one promoted; others in line who want
 * advancement are passed over (their need stays unmet). Returns who is passed over.
 */
export function passedOver(promotedId: number, inLine: readonly { personId: number; wantsAdvancement: boolean }[]): readonly number[] {
  return inLine.filter((p) => p.personId !== promotedId && p.wantsAdvancement).map((p) => p.personId);
}

/** What the staff had seen before a firing (L4.4.2). */
export interface FiringContext {
  /** Documented failures of the fired coach in the decision log (N3). */
  readonly documentedFailures: number;
  readonly roomTunedOut: boolean;
}

/**
 * L4.4.2: staff tied above 60 to the fired coach receive a witness memory about the head coach. Neutral
 * when the firing matched a pattern they had seen, negative when it looked like blame-shifting.
 */
export function firingMemories(firedId: number, headCoachId: number, staffIds: readonly number[], ties: ReadonlyMap<string, Tie>, ctx: FiringContext): readonly MemoryDraft[] {
  const pattern = ctx.documentedFailures > 0 || ctx.roomTunedOut;
  const out: MemoryDraft[] = [];
  for (const id of staffIds) {
    if (id === firedId || id === headCoachId) continue;
    if (tieBetween(ties, id, firedId) > param('tie.witnessAbove')) {
      out.push({ holderId: id, aboutPersonId: headCoachId, category: pattern ? 'staff.firing_understood' : 'staff.firing_blame_shift', sign: pattern ? 0 : -1, strength: param('fire.witnessMemory') });
    }
  }
  return out;
}

/** The interim takes full duties; his room's bond starts from his existing records with those players. */
export function interimBond(existingBondWithRoom: number | null): number {
  return existingBondWithRoom ?? param('leave.newcomerBond');
}
