// K4.1.2 thinking time and K4.5.2 tempo. The AI caller spends real seconds: an AI call is never
// produced in zero simulated time, and the play clock runs for him as it does for the user.
import { clamp, type Draws } from '../profile/draws.ts';
import { param } from './params.ts';
import type { Tempo } from './types.ts';

export interface CallTimeInputs {
  readonly path: 'mix' | 'script' | 'queued';
  readonly tempo: Tempo;
  readonly candidates: number;
  readonly personnelChange: boolean;
  /** The previous play moved the state to a box the caller had not looked at in advance. */
  readonly surprised: boolean;
  readonly zCallFit: number;
}

/** `callTime = base + complexity + surprise + noise`, in seconds after the previous play ends. One normal draw. */
export function callTime(inp: CallTimeInputs, draws: Draws): number {
  const noise = draws.normal() * param('time.noiseSdS');
  const base = inp.tempo !== 'huddle' ? param('time.tempoBaseS') : inp.path === 'mix' ? param('time.baseS') : param('time.queuedBaseS');
  let complexity = 0, surprise = 0;
  if (inp.path === 'mix' && inp.tempo === 'huddle') {
    const max = param('time.complexityMaxS');
    const change = inp.personnelChange ? param('time.personnelChangeS') : 0;
    const count = (max - param('time.personnelChangeS')) * clamp((inp.candidates - 2) / (param('time.complexityFullAtCalls') - 2), 0, 1);
    complexity = clamp(change + count, 0, max);
    if (inp.surprised) surprise = clamp(param('time.surpriseMeanS') - param('time.surprisePerZ') * inp.zCallFit, 0, param('time.surpriseMaxS'));
  }
  return Math.max(param('time.minS'), base + complexity + surprise + noise);
}

export interface TempoInputs {
  /** `system.tempoBase.noHuddleShare`. */
  readonly noHuddleShare: number;
  readonly lastGainYd: number | null;
  /** The defense is in a personnel group the offense's matrix rates as favourable. */
  readonly defenseFavourable: boolean;
  readonly keepClockRunning: boolean;
  readonly saveClock: boolean;
  /** A substitution is in progress: the offense cannot go fast (J5.1.2). This is a rule, so it is a hard stop. */
  readonly substitutionInProgress: boolean;
}

/** The chance of going without a huddle on this snap (K4.5.2). */
export function noHuddleChance(inp: TempoInputs): number {
  if (inp.substitutionInProgress) return 0;
  if (inp.saveClock) return 1;
  if (inp.keepClockRunning) return param('tempo.runClockShare');
  let p = inp.noHuddleShare;
  if (inp.lastGainYd !== null && inp.lastGainYd >= param('tempo.explosiveYd')) p *= param('tempo.afterExplosive');
  if (inp.defenseFavourable) p *= param('tempo.favourablePersonnel');
  return clamp(p, 0, param('tempo.maxShare'));
}

/** One uniform draw. A forced hurry is `hurry_up`; a chosen fast snap is `no_huddle`. */
export function chooseTempo(inp: TempoInputs, draws: Draws): Tempo {
  const u = draws.uniform();
  if (inp.saveClock && !inp.substitutionInProgress) return 'hurry_up';
  return u < noHuddleChance(inp) ? 'no_huddle' : 'huddle';
}
