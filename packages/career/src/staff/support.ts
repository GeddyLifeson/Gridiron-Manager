// Support people around the team (L4.6.1): the chaplain and chapel. The role sits outside the coaching
// limit and by default costs the club nothing. Attendance is voluntary and is never an input to playing
// time, discipline or any staff grade; the effect is a small private relief for attendees with a faith
// disposition and nothing on the field. The head coach sees a rough count only, never who said what.
// Imported real people have no disposition (X14) and are treated as neutral.
import { param } from './params.ts';

export type ChaplainAccess = 'chapel_only' | 'open';
export type ChaplainPay = 'volunteer' | 'outside_ministry' | 'payroll';
export type ChapelSlot = 'night_before' | 'game_morning' | 'none';

export interface ChaplainSetup {
  readonly holderPersonId: number | null;
  readonly access: ChaplainAccess;
  readonly pay: ChaplainPay;
  readonly salaryCents: number;
  readonly slot: ChapelSlot;
  readonly minutes: number;
  readonly headCoachAttends: boolean;
  /** Pressure acts (rule 4): coach-led team prayer, chapel placed inside required time. */
  readonly coachLedPrayer: boolean;
  readonly chapelInRequiredTime: boolean;
}

export function defaultChaplain(): ChaplainSetup {
  return { holderPersonId: null, access: 'chapel_only', pay: 'volunteer', salaryCents: 0, slot: 'night_before', minutes: 0, headCoachAttends: false, coachLedPrayer: false, chapelInRequiredTime: false };
}

/** Only a payroll chaplain costs the staff budget (L4.1.4). */
export const chaplainCost = (c: ChaplainSetup): number => (c.pay === 'payroll' && c.holderPersonId !== null ? c.salaryCents : 0);

/** A person's private disposition toward faith: -1 to 1, truth, null for imported real people. */
export interface PersonFaith { readonly personId: number; readonly disposition: number | null; readonly stressPastBreakpoint: boolean; readonly trustInChaplain: number }

export interface ChapelWeek {
  readonly attendees: readonly number[];
  /** Relief of personal strain per attendee (D12 / E8.1.1), applied by the needs engine. */
  readonly relief: ReadonlyMap<number, number>;
  /** Per-person reaction to pressure acts, never a team number (rule 4). */
  readonly pressure: ReadonlyMap<number, number>;
  /** Rough count shown to the head coach, rounded to the band. */
  readonly shownCount: number;
  /** Rule 3: a trusted chaplain says "some players are carrying something", no names. */
  readonly earlyWarning: boolean;
}

/**
 * One week of chapel. A person attends when his disposition is positive and chapel is held. Required
 * chapel time makes attendance compulsory in fact, which is a pressure act, not a bigger relief.
 */
export function chapelWeek(setup: ChaplainSetup, people: readonly PersonFaith[]): ChapelWeek {
  const held = setup.holderPersonId !== null && setup.slot !== 'none';
  const attendees = held ? people.filter((p) => (p.disposition ?? 0) > 0).map((p) => p.personId) : [];
  const relief = new Map(attendees.map((id) => [id, param('chapel.reliefPerVisit')] as const));
  const pressure = new Map<number, number>();
  if (setup.coachLedPrayer || setup.chapelInRequiredTime) {
    for (const p of people) {
      const d = p.disposition ?? 0;
      if (d !== 0) pressure.set(p.personId, Math.sign(d) * param('chapel.pressureReaction'));
    }
  }
  const b = param('chapel.countBand');
  const shownCount = Math.round(attendees.length / b) * b;
  const attending = new Set(attendees);
  const earlyWarning = held && people.some((p) => attending.has(p.personId) && p.stressPastBreakpoint && p.trustInChaplain >= param('chapel.earlyWarningTrust'));
  return { attendees, relief, pressure, shownCount, earlyWarning };
}

/**
 * Rule 1: attendance used as an input to playing time, discipline or a staff grade creates a grievance
 * event (L3, L7) and, at a school where `publicSchool` holds, a complaint to the school (L8, L9).
 */
export function attendanceMisuse(usedAsInput: boolean, publicSchool: boolean): readonly ('grievance' | 'school_complaint')[] {
  if (!usedAsInput) return [];
  return publicSchool ? ['grievance', 'school_complaint'] : ['grievance'];
}
