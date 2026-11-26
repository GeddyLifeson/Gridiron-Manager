// Tuning constants of coach AI play calling (G-58, bible K4). Every value is a starting value stated in
// a K4 leaf (basis 'bible'; the leaf itself marks them Assumption) or a named Assumption added here.
// No real-world fact is typed in this file: the one measured table (pass rate by score and quarter)
// is pass-lean.json with its research citation and status.
// coach-ai may not import @gm/schema (P1.2.1), so the row shape is declared structurally; it matches
// schema TuningParam and ParamFile field for field.
export interface CallingParamRow {
  name: string; value: number; min: number; max: number; unit: string; belongsTo: string;
  basis: 'bible' | 'assumption'; leaf: string; constrainedBy: string; status: 'starting';
}
export const RULE_KEYS: readonly never[] = [];

const MODULE = 'coachAi.calling';
const rows: CallingParamRow[] = [];
function add(basis: 'bible' | 'assumption', name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): void {
  rows.push({ name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting' });
}
const bible = (n: string, v: number, lo: number, hi: number, u: string, leaf: string, c: string) => add('bible', n, v, lo, hi, u, leaf, c);
const assume = (n: string, v: number, lo: number, hi: number, u: string, leaf: string, c: string) => add('assumption', n, v, lo, hi, u, leaf, c);

// K4.1.1 the call request.
bible('bucket.minCandidates', 2, 1, 6, 'count', 'K4.1.1', 'Rule 4: fewer than 2 candidates adds base calls');
bible('bucket.baseTopCalls', 3, 1, 8, 'count', 'K4.1.1', 'Rule 4: the base box top 3 calls');
// K4.1.2 thinking time.
bible('time.baseS', 6, 1, 15, 's', 'K4.1.2', 'Rule 1 base');
bible('time.complexityMaxS', 4, 0, 10, 's', 'K4.1.2', 'Rule 1: complexity 0 to 4 s');
assume('time.personnelChangeS', 2, 0, 4, 's', 'K4.1.2', 'Part of the 0 to 4 s complexity given to a personnel change');
assume('time.complexityFullAtCalls', 12, 3, 30, 'count', 'K4.1.2', 'Candidate count at which the count part of complexity is full (K4.3.1 limit of 12)');
bible('time.surpriseMaxS', 5, 0, 10, 's', 'K4.1.2', 'Rule 1: surprise 0 to 5 s');
assume('time.surpriseMeanS', 2.5, 0, 5, 's', 'K4.1.2', 'Surprise for a caller with callFit z = 0');
assume('time.surprisePerZ', 1.25, 0, 3, 's', 'K4.1.2', 'A better caller recovers faster from an unexpected box');
bible('time.noiseSdS', 1.5, 0, 5, 's', 'K4.1.2', 'Rule 1 noise');
bible('time.queuedBaseS', 3, 0.5, 10, 's', 'K4.1.2', 'Rule 2');
bible('time.tempoBaseS', 2, 0.5, 10, 's', 'K4.1.2', 'Rule 3');
assume('time.minS', 1, 0.1, 3, 's', 'K4.1.2', 'Acceptance: a call is never produced in zero simulated time');
// K4.2.1 starting belief.
bible('belief.shrinkPlays', 12, 1, 50, 'count', 'K4.2.1', 'Rule 1 shrink weight');
bible('belief.n0Base', 7.5, 3, 12, 'count', 'K4.2.1', 'Rule 2');
bible('belief.n0PerZ', 1.5, 0, 4, 'count', 'K4.2.1', 'Rule 2');
bible('belief.n0Min', 3, 1, 12, 'count', 'K4.2.1', 'Rule 2');
bible('belief.n0Max', 12, 3, 30, 'count', 'K4.2.1', 'Rule 2');
bible('belief.unseenFloor', 0.03, 0.001, 0.2, 'ratio', 'K4.2.1', 'Rule 4');
// K4.2.2 updating.
bible('belief.neighbourAdd', 0.5, 0, 1, 'count', 'K4.2.2', 'Rule 1');
bible('belief.mislabelMin', 0.05, 0, 0.5, 'ratio', 'K4.2.2', 'Rule 3: 5% to 20% by the booth coach');
bible('belief.mislabelMax', 0.2, 0, 0.5, 'ratio', 'K4.2.2', 'Rule 3');
assume('belief.mislabelPerZ', 0.025, 0, 0.1, 'ratio', 'K4.2.2', 'Evaluation z from +3 to -3 spans the 5% to 20% range');
bible('belief.hurtWeight', 1.5, 1, 3, 'count', 'K4.2.2', 'Rule 4');
bible('belief.probeWeight', 1.5, 1, 3, 'count', 'K4.5.1', 'Scripted probes update belief at 1.5');
bible('belief.callerChangeFactor', 0.5, 0, 1, 'ratio', 'K4.2.2', 'Edge case: counts are halved once');
// K4.3.1 stored mixes.
bible('mix.degenerateFloor', 0.05, 0, 0.2, 'ratio', 'K4.3.1', 'Edge case: 5% for every other planned candidate');
bible('mix.maxCandidates', 12, 2, 30, 'count', 'K4.3.1', 'Rule 1 starting limit');
bible('mix.maxLooks', 8, 2, 20, 'count', 'K4.3.1', 'Rule 1 starting limit');
assume('mix.possibleFloor', 0.0005, 0.000001, 0.01, 'ratio', 'K4.3.6', 'A3 ruling 22: a legal, available call never has a chance of exactly zero');
// K4.3.2 tilt.
bible('tilt.rhoPerZ', 0.1, 0, 1, 'ratio', 'K4.3.2', 'Rule 2');
bible('tilt.temperature', 0.15, 0.01, 2, 'points', 'K4.3.2', 'Rule 3');
bible('tilt.temperatureZ', 0.35, 0, 1, 'ratio', 'K4.3.2', 'Rule 3');
bible('tilt.tauMax', 0.6, 0, 1, 'ratio', 'K4.3.2', 'Rule 4');
assume('tilt.clockBoxScale', 0.03, 0.001, 1, 'ratio', 'K4.3.1', 'Rule 4: clock boxes hold win probability, so the temperature is scaled from expected points to win probability');
// K4.3.3 self-scout.
bible('selfScout.limit', 0.6, 0.3, 1, 'ratio', 'K4.3.3', 'Rule 2 predictability limit');
bible('selfScout.kappa', 4, 0, 20, 'ratio', 'K4.3.3', 'Rule 2');
bible('selfScout.kappaClampMax', 2.5, 1, 5, 'ratio', 'K4.3.3', 'Rule 2');
// K4.3.4 sequencing.
bible('sequence.multiplier', 1.5, 1, 4, 'ratio', 'K4.3.4', 'Rule 1');
bible('sequence.baseCallsNeeded', 2, 1, 6, 'count', 'K4.3.4', 'Rule 1');
bible('sequence.lastsSnaps', 3, 1, 10, 'count', 'K4.3.4', 'Rule 2');
// K4.3.5 readiness.
bible('readiness.power', 2, 1, 4, 'ratio', 'K4.3.5', 'Rule 1');
bible('readiness.cut', 0.4, 0, 1, 'ratio', 'K4.3.5', 'Rule 2');
assume('readiness.belowCutFactor', 0.02, 0, 1, 'ratio', 'K4.3.5', 'A3 ruling 22: an unready call is almost dropped, never forbidden');
// K4.3.7 habits and lean.
bible('lean.eta', 0.5, 0, 1, 'ratio', 'K4.3.7', 'Rule 2');
bible('lean.rateMin', 0.02, 0.001, 0.2, 'ratio', 'K4.3.7', 'Edge case clamp');
bible('lean.rateMax', 0.98, 0.8, 0.999, 'ratio', 'K4.3.7', 'Edge case clamp');
assume('lean.tendencyPerZ', 0.25, 0, 1, 'ratio', 'K4.3.7', 'Rule 3: deficitUrgency and leadProtection scale the table lean');
assume('lean.tendencyScaleMin', 0.25, 0, 1, 'ratio', 'K4.3.7', 'Lower bound of the scale');
assume('lean.tendencyScaleMax', 2, 1, 4, 'ratio', 'K4.3.7', 'Upper bound of the scale');
assume('lean.defenseFactor', 0.5, 0, 1, 'ratio', 'K4.3.7', 'Rule 4: the defense leans less than the offense it faces');
// K4.4.1 defense.
bible('defense.tempoMenuCalls', 4, 1, 12, 'count', 'K4.4.1', 'Rule 5');
// K4.5.1 script.
bible('script.minCalls', 8, 0, 30, 'count', 'K4.5.1', 'Script length 8 to 15 by preparation');
bible('script.maxCalls', 15, 0, 40, 'count', 'K4.5.1', 'Script length 8 to 15 by preparation');
assume('script.departShare', 0.03, 0, 0.5, 'ratio', 'K4.5.1', 'A3 ruling 22: a caller can leave his script on any snap');
// K4.5.2 tempo.
bible('tempo.afterExplosive', 2, 1, 5, 'ratio', 'K4.5.2', 'After a gain of 15 or more yards');
bible('tempo.explosiveYd', 15, 5, 40, 'yd', 'K4.5.2', 'Gain that counts');
bible('tempo.favourablePersonnel', 1.5, 1, 5, 'ratio', 'K4.5.2', 'Defense in a grouping the matrix likes');
assume('tempo.runClockShare', 0.001, 0, 0.05, 'ratio', 'K4.5.2', 'A3 ruling 22: K4.5.2 says 0 when the clock should run; kept just above zero');
assume('tempo.maxShare', 0.98, 0.5, 1, 'ratio', 'K4.5.2', 'Cap after multipliers');
// K4.5.3 adjustments.
bible('adjust.findMin', 0.4, 0, 1, 'ratio', 'K4.5.3', 'Rule 1: 40% to 90%');
bible('adjust.findMax', 0.9, 0, 1, 'ratio', 'K4.5.3', 'Rule 1');
assume('adjust.findSpanZ', 3, 1, 5, 'ratio', 'K4.5.3', 'Mean of adjustment and booth evaluation z from -3 to +3 spans 40% to 90%');
bible('adjust.seriesChanges', 1, 0, 4, 'count', 'K4.5.3', 'Rule 2');
bible('adjust.halftimeMin', 2, 0, 6, 'count', 'K4.5.3', 'Rule 2');
bible('adjust.halftimeMax', 4, 0, 8, 'count', 'K4.5.3', 'Rule 2');
assume('adjust.offPlanErrorFactor', 1.5, 1, 4, 'ratio', 'K4.5.3', 'Rule 3: changes not in the weekly plan carry a higher error rate (read by I8.1.4)');
// K4.6.1 special teams.
assume('special.temperature', 0.02, 0.001, 0.5, 'ratio', 'K4.6.1', 'Softmax temperature over estimated win-probability gain');

export const PARAMS = { module: MODULE, version: 'g58.1', params: rows } as const;

export function param(name: string): number {
  const r = rows.find((x) => x.name === `${MODULE}.${name}`);
  if (!r) throw new Error(`unknown parameter ${MODULE}.${name}`);
  return r.value;
}
