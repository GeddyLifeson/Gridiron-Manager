// A3.1 ruling 22 (MA-52): anything that could possibly happen always has a nonzero chance, however
// tiny. Every chance a module draws or shows for a possible event passes through `possible` so it can
// never be exactly 0 (nor exactly 1, which would make the other outcome impossible).
// Exceptions stay with their owners: acts the rules forbid remain possible with detection (L8.2.5),
// and real people never receive harmful or personal events (A6). Those are decided before a chance
// exists, not by setting one to 0.
// The floor is the tuning parameter `prob.floor` (an Assumption, starting value 0.0001 per event).
import { ParamFile } from './sim/params.ts';
import file from './probability-floor.json' with { type: 'json' };

export const PROB_FLOOR_PARAMS: ParamFile = ParamFile.parse(file);

/** `prob.floor`: the smallest chance any possible event may have. */
export const PROB_FLOOR: number = PROB_FLOOR_PARAMS.params.find((p) => p.name === 'prob.floor')!.value;

/**
 * The chance of a possible event, kept inside [floor, 1 - floor]. A non-finite input (NaN from 0/0)
 * becomes the floor. Use it on every chance that is drawn or shown.
 */
export function possible(p: number, floor: number = PROB_FLOOR): number {
  if (!(p > floor)) return floor;
  const top = 1 - floor;
  return p < top ? p : top;
}

/** Lower bound only: for a value that may be exactly 1 by rule (a certain step) but must never be 0. */
export function notImpossible(p: number, floor: number = PROB_FLOOR): number {
  if (!(p > floor)) return floor;
  return p > 1 ? 1 : p;
}
