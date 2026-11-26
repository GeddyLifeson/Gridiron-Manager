// Hazards (L9.1.1 "Caused, not rolled"). Only the two outside classes (L9.2.1 off-field incident,
// L9.2.8 family emergency) are drawn with no cause, on generated adults only. The team illness draw
// (L9.2.9) makes its own cause event (`outbreak.draw`). Hazing (L9.2.6) runs on a culture cause the
// caller holds. Every rate is a catalogue value with a fact row (G-32); nothing here is a real number.
//
// No hazard input carries a win-loss record, a streak or a "team in trouble" flag: the input types
// below have no such field, so pity and punishment cannot be wired in (L9.1.1 acceptance).
import type { WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import { crisisType, hazardValue, type CrisisCatalogue, type CrisisType } from './catalogue.ts';
import { eligibleSubjects, type GuardPerson } from './guard.ts';
import { param } from './params.ts';
import type { StreamFor } from './events.ts';
import type { Trigger } from './engine.ts';

/** A person as the outside draws read them. */
export interface HazardPerson extends GuardPerson {
  /** X5 stress on the catalogue's scale (the off-field row multiplies by 1 + stress / divisor). */
  readonly stress: number;
  /** D5 off-field risk relative to the league mean; 1 is the mean. */
  readonly offFieldRisk: number;
}

export const OUTSIDE = { offField: 'off_field_incident', family: 'family_emergency', illness: 'team_illness', hazing: 'hazing' } as const;

/**
 * L9.2.1 weekly chance for one person. The yearly rate is spread evenly over the weeks of the year
 * (rate / weeks, which is the first-order term and avoids platform powers, P1.1.1), then scaled by
 * D5 risk and by stress as the catalogue row says.
 */
export function offFieldWeekly(t: CrisisType, p: Pick<HazardPerson, 'stress' | 'offFieldRisk'>): number {
  const yearly = hazardValue(t, 'yearly_arrest_rate');
  return Math.min(1, (yearly / compliance.weeksPerYear()) * p.offFieldRisk * (1 + p.stress / hazardValue(t, 'stress_divisor')));
}

/** L9.2.8 flat weekly chance for a person with a family object. */
export function familyWeekly(t: CrisisType): number { return hazardValue(t, 'base_weekly'); }

/** L9.2.6 weekly chance per person, given the room's hazing tolerance (culture cause) and the setting. */
export function hazingWeekly(t: CrisisType, input: { readonly tolerance: number; readonly inCamp: boolean; readonly publishedBan: boolean }): number {
  const base = hazardValue(t, input.inCamp ? 'base_weekly_camp' : 'base_weekly_season');
  const ban = input.publishedBan ? hazardValue(t, 'published_ban_factor') : 1;
  return Math.min(1, base * (1 + input.tolerance / hazardValue(t, 'culture_divisor')) * ban);
}

/** L9.2.9 weekly chance of an outbreak for a team: the season chance spread over the season's weeks. */
export function illnessWeekly(t: CrisisType): number { return hazardValue(t, 'outbreak_per_season') / param('illness.seasonWeeks'); }

/** Severity for an off-field outcome class (minor, serious, grave) drawn by the catalogue's class shares. */
export function offFieldSeverity(t: CrisisType, u: number, pickInt: (lo: number, hi: number) => number): number {
  const classes = t.severity.classes;
  let acc = 0;
  let id = classes.length > 0 ? classes[classes.length - 1]!.id : 'minor';
  for (const c of classes) { acc += c.share; if (u < acc) { id = c.id; break; } }
  if (id === 'grave') return param('severity.grave');
  if (id === 'serious') return pickInt(param('severity.seriousMin'), param('severity.seriousMax'));
  return pickInt(t.severity.range.min, param('severity.minorMax'));
}

/**
 * The weekly outside draws for one team: off-field incidents and family emergencies on eligible
 * people (the guard picks: imported people and minors are never candidates). One stream per person and
 * week, so adding a person never shifts another's draw.
 */
export function drawOutsideTriggers(
  cat: CrisisCatalogue, teamId: number, people: readonly HazardPerson[], date: WorldDate, stream: StreamFor,
): Trigger[] {
  const out: Trigger[] = [];
  const day = compliance.dayNumber(date);
  const off = crisisType(cat, OUTSIDE.offField);
  for (const p of eligibleSubjects(off.guard, people)) {
    const s = stream(['crisis', 'off_field', teamId, p.personId, day]);
    if (s.chance(offFieldWeekly(off, p))) {
      const severity = offFieldSeverity(off, s.uniform(), (lo, hi) => s.int(lo, hi));
      out.push({ typeId: off.id, teamId, subjectIds: [p.personId], causeEventIds: [], date, severity });
    }
  }
  const fam = crisisType(cat, OUTSIDE.family);
  for (const p of eligibleSubjects(fam.guard, people, fam.subjects.requiresFamilyObject)) {
    const s = stream(['crisis', 'family', teamId, p.personId, day]);
    if (s.chance(familyWeekly(fam))) out.push({ typeId: fam.id, teamId, subjectIds: [p.personId], causeEventIds: [], date, severity: s.int(fam.severity.range.min, fam.severity.range.max) });
  }
  return out;
}

/** L9.2.9: does an outbreak start this week. The caller logs the `outbreak.draw` event and passes its id as the cause. */
export function drawOutbreak(cat: CrisisCatalogue, teamId: number, date: WorldDate, stream: StreamFor): boolean {
  return stream(['crisis', 'outbreak', teamId, compliance.dayNumber(date)]).chance(illnessWeekly(crisisType(cat, OUTSIDE.illness)));
}
