// L9.4 college crises. Each is a trigger built from state another system owns (T6 leanings, T5
// standing, the G-28 case, L5.4.3 booster mood) and then run by the one engine. Levels are not tested
// in code: a crisis row lists the rule-set tags it applies under, and the engine compares them as data.
import type { WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import { crisisType, hazardValue, type CrisisCatalogue } from './catalogue.ts';
import type { GuardPerson } from './guard.ts';
import type { CrisisState, Trigger } from './engine.ts';
import type { Order } from './orders.ts';
import { param } from './params.ts';
import type { StreamFor } from './events.ts';

export const COLLEGE = { portal: 'portal_exodus', academic: 'academic_ineligibility', investigation: 'investigation', booster: 'booster_revolt' } as const;

// ---- L9.4.1 portal exodus ----

/** One player's transfer leaning from T6, as a chance he leaves in the coming window. */
export interface Leaning { readonly personId: number; readonly leave: number }

/** Expected departures as a share of the roster: the sum of each player's own chance, no team roll. */
export function expectedDepartureShare(leanings: readonly Leaning[], rosterSize: number): number {
  if (rosterSize <= 0) return 0;
  return leanings.reduce((s, l) => s + l.leave, 0) / rosterSize;
}

/** The crisis trigger when expected departures pass the catalogue share of the roster. Cause: the leaning events. */
export function portalTrigger(cat: CrisisCatalogue, teamId: number, leanings: readonly Leaning[], rosterSize: number, causeEventIds: readonly number[], date: WorldDate): Trigger | null {
  const t = crisisType(cat, COLLEGE.portal);
  if (expectedDepartureShare(leanings, rosterSize) <= hazardValue(t, 'expected_departures_share_of_roster')) return null;
  const subjects = [...leanings].sort((a, b) => b.leave - a.leave || a.personId - b.personId).map((l) => l.personId);
  return { typeId: t.id, teamId, subjectIds: subjects, causeEventIds, date };
}

/**
 * Spread the window's departures over its days (L9.4.1 smoothing, design-inspiration row 24): no day
 * carries more than the configured share of the entries, unless the window is too short to fit them.
 * Returns the day offset for each departing player, in the order given.
 */
export function announcementDays(departingIds: readonly number[], windowDays: number, teamId: number, stream: StreamFor): Map<number, number> {
  const out = new Map<number, number>();
  const n = departingIds.length;
  if (n === 0 || windowDays <= 0) return out;
  const cap = Math.max(1, Math.ceil(n * param('portal.maxShareAnnouncedPerDay')), Math.ceil(n / windowDays));
  const load = new Array<number>(windowDays).fill(0);
  for (const id of departingIds) {
    const s = stream(['crisis', 'portal_day', teamId, id]);
    let day = s.int(0, windowDays - 1);
    for (let k = 0; k < windowDays && load[day]! >= cap; k++) day = (day + 1) % windowDays;
    load[day]! += 1;
    out.set(id, day);
  }
  return out;
}

// ---- L9.4.2 academic ineligibility ----

/** A trigger for a player ruled out, or null: an imported player is always eligible (personal class). */
export function academicTrigger(teamId: number, player: GuardPerson, causeEventIds: readonly number[], date: WorldDate): Trigger | null {
  if (player.origin === 'imported' || player.minor) return null;
  return { typeId: COLLEGE.academic, teamId, subjectIds: [player.personId], causeEventIds, date };
}

// ---- L9.4.3 investigation ----

/** Exactly one investigation per major case. The crisis state remembers which cases have one. */
export interface InvestigationIndex { readonly byCase: Map<number, number> }

export function emptyInvestigationIndex(): InvestigationIndex { return { byCase: new Map() }; }

/**
 * A trigger for a major G-28 case on this program, or null when the case is minor, closed, already
 * wrapped, or names only imported people (the guard refuses it then). The case's subjects are the
 * generated parties; the head coach answers through G-28 (T9.5.1).
 */
export function investigationTrigger(
  index: InvestigationIndex, comp: compliance.ComplianceState, caseId: number, caseEventId: number, date: WorldDate,
): Trigger | null {
  if (index.byCase.has(caseId)) return null;
  const c = comp.cases.find((x) => x.id === caseId);
  if (!c || c.status !== 'open' || c.falseAccusation) return null;
  const rows = comp.log.filter((r) => c.rowIds.includes(r.id));
  if (!rows.some((r) => r.severity === 'major')) return null;
  const subjects: number[] = [];
  for (const r of rows) for (const p of [r.actor, r.orderedBy]) if (p && p.origin !== 'imported' && !subjects.includes(p.personId)) subjects.push(p.personId);
  if (subjects.length === 0) return null;
  return { typeId: COLLEGE.investigation, teamId: c.teamId, subjectIds: subjects, causeEventIds: [caseEventId], date };
}

/** Mark a case as wrapped once its crisis is queued, so a second trigger is refused. */
export function noteInvestigation(index: InvestigationIndex, caseId: number, seq: number): void { index.byCase.set(caseId, seq); }

/** The catalogue's case length in days (12 months, 1 of 3), for the clock shown on the item. */
export function investigationLengthDays(cat: CrisisCatalogue): number {
  const months = hazardValue(crisisType(cat, COLLEGE.investigation), 'case_length_months');
  return Math.round(months * compliance.weeksPerYear() * 7 / 12);
}

// ---- L9.4.4 booster revolt ----

/** True when booster mood has sat below the floor for the catalogue's number of consecutive weeks. */
export function boosterRevoltDue(cat: CrisisCatalogue, weeklyMood: readonly number[]): boolean {
  const t = crisisType(cat, COLLEGE.booster);
  const floor = hazardValue(t, 'booster_mood_floor');
  const weeks = hazardValue(t, 'weeks_below_floor');
  if (weeklyMood.length < weeks) return false;
  return weeklyMood.slice(-weeks).every((m) => m < floor);
}

/** Leader of the revolt is the subject; the mood events are the cause. */
export function boosterTrigger(cat: CrisisCatalogue, teamId: number, weeklyMood: readonly number[], leaderId: number, causeEventIds: readonly number[], date: WorldDate): Trigger | null {
  return boosterRevoltDue(cat, weeklyMood) ? { typeId: COLLEGE.booster, teamId, subjectIds: [leaderId], causeEventIds, date } : null;
}

/**
 * Giving the donors the lineup or staff change they asked for: mood rises, and everyone who knows
 * remembers "took orders from donors". The precedent is always written (L9.4.4 acceptance).
 */
export function grantBoosterDemand(state: CrisisState, crisisId: number, coachId: number, date: WorldDate): Order[] {
  const c = state.open.find((x) => x.id === crisisId && x.typeId === COLLEGE.booster);
  if (!c) throw new Error(`crisis: ${crisisId} is not an open booster revolt`);
  c.log.push({ date, kind: 'act', detail: 'granted_demand', eventId: null });
  c.actIds.push('granted_demand');
  return [
    { kind: 'booster_mood', teamId: c.teamId, delta: param('booster.grantMoodGain') },
    { kind: 'group_memory', group: 'knowers', teamId: c.teamId, aboutId: coachId, memoryClass: 'took_orders_from_donors', amount: param('booster.tookOrdersMemory'), sourceEventId: null },
    { kind: 'culture_precedent', teamId: c.teamId, crisisId: c.id, typeId: 'booster_demand_granted', actIds: ['granted_demand'] },
  ];
}

/** Time with the donors (an L8.1.1 event or a call) raises mood slowly. */
export function boosterEventMood(teamId: number, eventKey: number, stream: StreamFor): Order {
  return { kind: 'booster_mood', teamId, delta: stream(['crisis', 'booster_event', teamId, eventKey]).int(param('booster.eventMoodMin'), param('booster.eventMoodMax')) };
}
