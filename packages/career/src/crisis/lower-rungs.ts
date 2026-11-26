// L9.5 lower rungs: the boss is fired (L9.5.1) and something you witnessed (L9.5.2).
import type { WorldDate } from '@gm/schema';
import { guardCheck, type GuardPerson } from './guard.ts';
import { CRISIS_EVENT, draft, type EventSink } from './events.ts';
import type { Trigger } from './engine.ts';
import type { Order } from './orders.ts';
import { param } from './params.ts';

// ---- L9.5.1 the boss is fired ----

/**
 * A boss-fired or boss-resigned event always opens this crisis for a lower-rung user (acceptance).
 * The type is a priority type in the engine queue, so it opens on the first week with room.
 */
export function bossFiredTrigger(userId: number, teamId: number, firingEventId: number, date: WorldDate): Trigger {
  return { typeId: 'boss_fired', teamId, subjectIds: [userId], causeEventIds: [firingEventId], date };
}

/** An interim stint: results go to his record as facts; the stint never promotes him by itself (E2 decides). */
export interface InterimStint {
  readonly personId: number;
  readonly teamId: number;
  readonly from: WorldDate;
  readonly to: WorldDate;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
}

export interface InterimRecord extends InterimStint { readonly automaticPromotion: false }

export function interimRecord(stint: InterimStint): InterimRecord { return { ...stint, automaticPromotion: false }; }

// ---- L9.5.2 something you witnessed ----

export type WitnessedKind = 'player_matter' | 'boss_violation' | 'staff_violation' | 'hazing';

export interface WitnessedMatter {
  readonly key: string;
  readonly kind: WitnessedKind;
  readonly teamId: number;
  readonly actorId: number;
  readonly victimId: number | null;
  readonly grave: boolean;
  /** How sure he is, 0 to 1. Shown in words. */
  readonly confidence: number;
  /** The G-28 violation row if the act is in the log (the logs can show who knew). */
  readonly logRowId: number | null;
  readonly bossId: number;
  /** Truth record: did it happen as he saw it. Hidden from him. */
  readonly happened: boolean;
}

export interface WitnessedItem extends WitnessedMatter {
  readonly userId: number;
  readonly eventId: number;
  readonly date: WorldDate;
  /** The screen states the reporting duty when the rule data has one. */
  readonly mustReport: boolean;
}

/**
 * Create the private item only the user sees. Personal class: an imported actor or victim, or a minor,
 * means the item is not created (L9.5.2 acceptance: no witnessed violation has an imported actor).
 */
export function witnessedItem(
  userId: number, matter: WitnessedMatter, people: { readonly actor: GuardPerson; readonly victim: GuardPerson | null },
  date: WorldDate, mustReport: boolean, sink: EventSink, tier: 1 | 2 | 3, source: 'sim' | 'history_run' | 'user',
): WitnessedItem | null {
  const g = guardCheck('witnessed', 'personal', [
    { person: people.actor, role: 'actor' },
    ...(people.victim ? [{ person: people.victim, role: 'victim' as const }] : []),
  ]);
  if (!g.ok) return null;
  const eventId = sink.append(draft(CRISIS_EVENT.witnessed, { date, competitionId: null, teamId: matter.teamId, tier, source },
    [{ personId: userId, role: 'witness' }], [{ kind: 'person', id: matter.actorId }],
    { matter: matter.kind, confidence: matter.confidence }, { kind: 'people', personIds: [userId] }, null));
  return { ...matter, userId, eventId, date, mustReport };
}

export type WitnessChoice = 'silent' | 'raise_with_person' | 'tell_boss' | 'over_head' | 'outside';

export interface WitnessOutcome {
  readonly orders: Order[];
  /** A report event reaches its recipient (he acted as a channel, L9.1.3). */
  readonly reported: boolean;
  /** He becomes a party in any later case on it if it surfaces (silence about a logged boss violation). */
  readonly partyIfSurfaces: boolean;
  /** Reporting over the boss's head protects him in any later finding. */
  readonly protectedInFinding: boolean;
  /** A dated fact on his history (L8.5.1), read by later employers by their own profiles. */
  readonly historyFact: string;
}

/**
 * Resolve his choice. The boss's taste for messengers is hidden truth data the caller reads
 * (`bossValuesBeingTold`); nothing is shown to the user as a number.
 */
export function resolveWitness(item: WitnessedItem, choice: WitnessChoice, bossValuesBeingTold: boolean): WitnessOutcome {
  const orders: Order[] = [];
  const reports = choice === 'tell_boss' || choice === 'over_head' || choice === 'outside';
  const bossInvolved = item.kind === 'boss_violation';
  let partyIfSurfaces = false;
  let protectedInFinding = false;
  if (bossInvolved) {
    if (choice === 'silent' || choice === 'tell_boss') partyIfSurfaces = item.logRowId !== null;
    if (choice === 'raise_with_person') orders.push({ kind: 'standing_with_boss', personId: item.userId, bossId: item.bossId, delta: param('witness.refuseOrderStanding') });
    if (choice === 'over_head' || choice === 'outside') {
      protectedInFinding = true;
      orders.push({ kind: 'standing_with_boss', personId: item.userId, bossId: item.bossId, delta: param('witness.overHeadStanding') });
    }
  } else if (choice === 'tell_boss' && bossValuesBeingTold) {
    orders.push({ kind: 'standing_with_boss', personId: item.userId, bossId: item.bossId, delta: param('witness.tellBossStanding') });
  } else if (item.kind === 'staff_violation' && choice === 'silent') {
    partyIfSurfaces = item.logRowId !== null && item.mustReport;
  }
  if (reports && item.happened && item.victimId !== null) {
    orders.push({ kind: 'memory', holderId: item.victimId, aboutId: item.userId, memoryClass: item.grave ? 'spoke_up_touchstone' : 'spoke_up', amount: param('witness.victimMemory'), halfLifeWeeks: null, sourceEventId: item.eventId });
  }
  if (reports && !item.happened) {
    orders.push({ kind: 'memory', holderId: item.actorId, aboutId: item.userId, memoryClass: 'falsely_reported', amount: param('witness.wrongAccusedMemory'), halfLifeWeeks: null, sourceEventId: item.eventId });
    const recipient = choice === 'tell_boss' ? item.bossId : null;
    if (recipient !== null) orders.push({ kind: 'memory', holderId: recipient, aboutId: item.userId, memoryClass: 'reported_wrongly', amount: param('witness.wrongRecipientMemory'), halfLifeWeeks: null, sourceEventId: item.eventId });
  }
  return { orders, reported: reports, partyIfSurfaces, protectedInFinding, historyFact: `witnessed:${item.kind}:${choice}` };
}
