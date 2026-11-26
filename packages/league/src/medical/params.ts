// Tuning constants of the medical module (G-33; plans/game-build-plan.md section 2). The values live
// in params.json because league source holds no number other than 0 and 1 (P1.1.2). Each row names the
// bible leaf that states it as a starting value, or says it is this module's assumption, and the test
// that constrains it.
import { ParamFile } from '@gm/schema';
import file from './params.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);

const PREFIX = 'league.medical.';
const byName = new Map(PARAMS.params.map((p) => [p.name.slice(PREFIX.length), p.value]));

/** Parameter by short name. Unknown names throw, so a typo never reads as zero. */
export function P(name: string): number {
  const v = byName.get(name);
  if (v === undefined) throw new Error(`league.medical: unknown parameter ${name}`);
  return v;
}
