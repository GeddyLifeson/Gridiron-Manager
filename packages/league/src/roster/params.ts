// Tuning constants of the roster module (plans/game-build-plan.md section 2). The values live in
// params.json because league source holds no number other than 0 and 1 (P1.1.2). Each row names the
// bible leaf that states it as a starting value, or says it is this module's assumption.
import { ParamFile } from '@gm/schema';
import file from './params.json' with { type: 'json' };
import units from './units.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);

const byName = new Map(PARAMS.params.map((p) => [p.name, p.value]));
function param(name: string): number {
  const v = byName.get(`league.roster.${name}`);
  if (v === undefined) throw new Error(`league.roster: unknown parameter ${name}`);
  return v;
}

export const P = {
  emergencyQbElevationCountsPerGame: param('emergencyQbElevationCountsPerGame'),
  markerInjuryReviewDaysBeforeGame: param('markerInjuryReviewDaysBeforeGame'),
  markerTryoutDaysBeforeGame: param('markerTryoutDaysBeforeGame'),
  markerProtectionDaysBeforeGame: param('markerProtectionDaysBeforeGame'),
  markerLastTransactionDaysBeforeGame: param('markerLastTransactionDaysBeforeGame'),
  markerRevertDaysAfterGame: param('markerRevertDaysAfterGame'),
  markerAmberHours: param('markerAmberHours'),
  markerRedHours: param('markerRedHours'),
  normalWeekDays: param('normalWeekDays'),
  designationCountedAtWindowOpen: param('designationCountedAtWindowOpen') === 1,
} as const;

export const HOURS_PER_DAY: number = units.hoursPerDay;
export const MINUTES_PER_HOUR: number = units.minutesPerHour;
