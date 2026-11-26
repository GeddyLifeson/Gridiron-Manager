// X11.1.1 cohort kinds and the order of work on a shared date. The calendar (G-12) owns the dates and
// delivers a `CohortEntered` event per cohort window after the day's exits and vacancies; this file
// names the kinds and checks the order and the one-per-season rule.
import type { PersonRole } from '@gm/schema';
import type { PopulationGroup } from '../generator/index.ts';

export const COHORT_KINDS = ['recruit_class', 'college_walk_on', 'pro_entry_pool', 'undrafted_pool', 'coach_staff_entry'] as const;
export type CohortKind = (typeof COHORT_KINDS)[number];

export function isCohortKind(s: string): s is CohortKind {
  return (COHORT_KINDS as readonly string[]).includes(s);
}

/** Who each kind is made of: role, X1.2.1 population group, and whether the person plays. */
export const KIND_MAKEUP: Readonly<Record<CohortKind, { roles: readonly PersonRole[]; group: PopulationGroup; plays: boolean; level: 'college' | 'pro' | 'both' }>> = {
  recruit_class: { roles: ['player'], group: 'recruit', plays: true, level: 'college' },
  college_walk_on: { roles: ['player'], group: 'college_player', plays: true, level: 'college' },
  pro_entry_pool: { roles: ['player'], group: 'pro_player', plays: true, level: 'pro' },
  undrafted_pool: { roles: ['player'], group: 'pro_player', plays: true, level: 'pro' },
  coach_staff_entry: { roles: ['coach'], group: 'entry_coach', plays: false, level: 'both' },
};

/** Work on one date (X11.1.1): exits first (X12.1.3), then vacancies (X8.4.2), then cohorts. */
export const SAME_DATE_STAGES = ['exit', 'vacancy', 'cohort'] as const;
export type SameDateStage = (typeof SAME_DATE_STAGES)[number];

/** Stable sort of a day's work into the X11.1.1 order. Items keep their order inside a stage. */
export function orderSameDate<T extends { stage: SameDateStage }>(items: readonly T[]): T[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => SAME_DATE_STAGES.indexOf(a.it.stage) - SAME_DATE_STAGES.indexOf(b.it.stage) || a.i - b.i)
    .map((x) => x.it);
}

/**
 * Calendar event as the calendar engine delivers it (league calendar `CalendarEvent`, type
 * `CohortEntered`). Only the fields read here.
 */
export interface CohortCalendarEvent {
  readonly type: string;
  readonly day: number;
  readonly season?: number;
  readonly level?: string;
  readonly cohort?: string;
}

/** X11.1.1 acceptance: per season, exactly one `cohort_entered` per kind. Returns the problems found. */
export function oneCohortPerSeason(entered: readonly { season: number; kind: string }[], kinds: readonly CohortKind[] = COHORT_KINDS): string[] {
  const out: string[] = [];
  const seasons = [...new Set(entered.map((e) => e.season))].sort((a, b) => a - b);
  for (const s of seasons) {
    for (const k of kinds) {
      const n = entered.filter((e) => e.season === s && e.kind === k).length;
      if (n !== 1) out.push(`season ${s}: ${n} cohort_entered rows for ${k}`);
    }
  }
  return out;
}

/** X11.1.1 acceptance: the undrafted pool forms on the day of the last draft pick. */
export function undraftedOnDraftEnd(undraftedDay: number, lastPickDay: number): boolean {
  return undraftedDay === lastPickDay;
}
