// Tuning constants of the depth chart module (G-56; plans/game-build-plan.md section 2). The values live
// in params.json because league source holds no number other than 0 and 1 (P1.1.2). Each row names the
// bible leaf that states it as a starting value, or says it is this module's assumption, and the test
// that constrains it. Real-world rows (snap shares, game-day minimums) carry their fact status.
import { ParamFile } from '@gm/schema';
import file from './params.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);

const PREFIX = 'league.depth.';
const byName = new Map(PARAMS.params.map((p) => [p.name.slice(PREFIX.length), p.value]));

/** Parameter by short name. Unknown names throw, so a typo never reads as zero. */
export function P(name: string): number {
  const v = byName.get(name);
  if (v === undefined) throw new Error(`league.depth: unknown parameter ${name}`);
  return v;
}

/** True when the parameter exists (used for per-rank share rows, which end at different ranks per group). */
export function hasP(name: string): boolean {
  return byName.has(name);
}
