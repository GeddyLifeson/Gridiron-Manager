// K5.6.1: the error list. Real coaches mismanage clocks in a few recognisable ways; an AI coach makes
// those mistakes at a rate set by his hidden clockManagement, never by a setting.
import type { Draws } from '../profile/draws.ts';
import { ERROR_LIST, param, type ErrorId } from './params.ts';
import type { MgmtMath } from './types.ts';

/** Rule 2 and rule 4: base × exp(-0.6 z), capped at 3 × base, cut by 40% when the advisor is heard. */
export function errorChance(id: ErrorId, clockManagementZ: number, advisorHeard: boolean, math: MgmtMath): number {
  const base = ERROR_LIST[id];
  const raw = base * math.exp(-param('error.zSlope') * clockManagementZ);
  const capped = raw > param('error.capFactor') * base ? param('error.capFactor') * base : raw;
  return advisorHeard ? capped * (1 - param('error.advisorCut')) : capped;
}

export interface ErrorContext {
  readonly clockManagementZ: number;
  readonly advisor: boolean;
  readonly analyticsTrust: number;
  /** False in a test build (acceptance: with the list disabled no decision differs from the sound one). */
  readonly enabled: boolean;
  readonly draws: Draws;
  readonly math: MgmtMath;
}

/**
 * Draws one error for one trigger (rule 3: at most one per decision; the caller asks once). Always takes
 * two draws, so a disabled list leaves the stream where an enabled one would.
 */
export function errorHappens(id: ErrorId, c: ErrorContext): boolean {
  const uTrust = c.draws.uniform(), u = c.draws.uniform();
  if (!c.enabled) return false;
  return u < errorChance(id, c.clockManagementZ, c.advisor && uTrust < c.analyticsTrust, c.math);
}
