// Fatigue and substitution (WP-18): the rule keys this module reads and its tuning constants.
// Two sources only (plans/engine-build-plan.md section 2, D-09). A rule value is read from the rule set
// by key. Every other number is a named parameter here. `basis: 'bible'` means the leaf prints the number
// as a starting value; those leaves themselves mark every D10 constant "Assumption (design tuning)", so no
// parameter in this file is a measured fact. `basis: 'assumption'` means this module's author chose it.
import type { Contract } from '@gm/engine-core';

export const BENCH_MODULE = 'engine-game.bench';
export const BENCH_VERSION = 'bench 1';

export const RULE_KEYS: Contract.RuleKeyManifest = [
  { key: 'substitution.max_players', type: 'number', unit: 'count', meaning: 'Players a team may field; the automatic lineup never exceeds it (Q1.2.2)', ownerLeaf: 'B2', readBy: [BENCH_MODULE] },
  { key: 'substitution.match_window', type: 'boolean', meaning: 'After the offense substitutes, the defense may match before the snap', ownerLeaf: 'B13.13.1', readBy: [BENCH_MODULE] },
  { key: 'injury.sit_downs', type: 'number', unit: 'count', meaning: 'Downs an injured player sits out after an injury stoppage', ownerLeaf: 'B13.13.1', readBy: [BENCH_MODULE] },
];

type Row = Omit<Contract.TuningParam, 'belongsTo' | 'status'>;
const D10 = 'D10 acceptance tests in packages/engine-game/test/bench';
const rows: Row[] = [
  // D10.1.1 short-term recovery: tau = base x (offset - conditioning / divisor) x heat factor
  { name: 'bench.shortTerm.tauBaseS', value: 35, min: 20, max: 60, unit: 's', basis: 'bible', leaf: 'D10.1.1', constrainedBy: `D10.6.1 reference snap shares; ${D10} "recovery fractions"` },
  { name: 'bench.shortTerm.tauOffset', value: 1.3, min: 1, max: 1.6, unit: 'ratio', basis: 'bible', leaf: 'D10.1.1', constrainedBy: `${D10} "recovery fractions"` },
  { name: 'bench.shortTerm.tauConditioningDivisor', value: 333, min: 200, max: 500, unit: 'iss', basis: 'bible', leaf: 'D10.1.1', constrainedBy: `${D10} "conditioning speeds recovery"` },
  // D10.1.1 long-term part. The leaf says it "falls slowly with total work" and gives no rate.
  { name: 'bench.longTerm.costShare', value: 0.1, min: 0.02, max: 0.3, unit: 'ratio', basis: 'assumption', leaf: 'D10.1.1', constrainedBy: `D10.6.1 reference snap shares; ${D10} "long drive"` },
  { name: 'bench.longTerm.benchRecoveryPerMin', value: 0.03, min: 0.01, max: 0.1, unit: 'ratio', basis: 'bible', leaf: 'D10.1.1', constrainedBy: `${D10} "bench recovery"` },
  { name: 'bench.longTerm.halftimeRecovery', value: 0.25, min: 0.1, max: 0.5, unit: 'ratio', basis: 'bible', leaf: 'D10.1.1', constrainedBy: `${D10} "halftime"` },
  // D10.5.1 heat, altitude, travel
  { name: 'bench.heat.thresholdF', value: 80, min: 70, max: 90, unit: 'deg_f', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `J15 home win band; ${D10} "heat"` },
  { name: 'bench.heat.recoveryLossPerDegF', value: 0.02, min: 0, max: 0.05, unit: 'ratio', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `J15 home win band; ${D10} "heat"` },
  { name: 'bench.heat.costGainPerDegF', value: 0.015, min: 0, max: 0.05, unit: 'ratio', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `J15 home win band; ${D10} "heat"` },
  { name: 'bench.heat.acclimatisedScale', value: 0.5, min: 0, max: 1, unit: 'ratio', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "heat"` },
  { name: 'bench.heat.acclimatisationDays', value: 10, min: 5, max: 21, unit: 'count', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "heat"` },
  { name: 'bench.altitude.thresholdFt', value: 4000, min: 3000, max: 6000, unit: 'ft', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `J15 home win band; ${D10} "altitude"` },
  { name: 'bench.altitude.stepFt', value: 400, min: 200, max: 1000, unit: 'ft', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "altitude"` },
  { name: 'bench.altitude.recoveryLossPerStep', value: 0.01, min: 0, max: 0.03, unit: 'ratio', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "altitude"` },
  { name: 'bench.altitude.adaptDays', value: 3, min: 1, max: 14, unit: 'count', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "altitude"` },
  { name: 'bench.altitude.adaptedScale', value: 0.5, min: 0, max: 1, unit: 'ratio', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "altitude"` },
  { name: 'bench.environment.recoveryFloor', value: 0.5, min: 0.2, max: 0.9, unit: 'ratio', basis: 'assumption', leaf: 'D10.5.1', constrainedBy: `${D10} "environment floor"` },
  { name: 'bench.travel.loadPerZone', value: 3, min: 0, max: 10, unit: 'load', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "travel"` },
  { name: 'bench.travel.earlyBodyClockHour', value: 10, min: 8, max: 13, unit: 'h', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "travel"` },
  { name: 'bench.travel.earlyBodyClockCut', value: 0.02, min: 0, max: 0.1, unit: 'ratio', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "travel"` },
  { name: 'bench.travel.returnRecoverySlow', value: 0.1, min: 0, max: 0.3, unit: 'ratio', basis: 'bible', leaf: 'D10.5.1', constrainedBy: `${D10} "travel"` },
  // D10.6.1 substitution floors chosen in words by the user
  { name: 'bench.floor.freshLegs', value: 0.65, min: 0.4, max: 0.9, unit: 'ratio', basis: 'bible', leaf: 'D10.6.1', constrainedBy: `D10.6.1 reference snap shares; ${D10} "floors"` },
  { name: 'bench.floor.normal', value: 0.55, min: 0.3, max: 0.8, unit: 'ratio', basis: 'bible', leaf: 'D10.6.1', constrainedBy: `D10.6.1 reference snap shares; ${D10} "floors"` },
  { name: 'bench.floor.rideHim', value: 0.45, min: 0.2, max: 0.7, unit: 'ratio', basis: 'bible', leaf: 'D10.6.1', constrainedBy: `D10.6.1 reference snap shares; ${D10} "floors"` },
  // D10.6.1 "his own read of a player's freshness (with error)": the size of the error is not given.
  { name: 'bench.read.errorSdPoorStaff', value: 0.1, min: 0, max: 0.3, unit: 'ratio', basis: 'assumption', leaf: 'D10.6.1', constrainedBy: `${D10} "staff read"` },
  { name: 'bench.read.errorSdBestStaff', value: 0.03, min: 0, max: 0.2, unit: 'ratio', basis: 'assumption', leaf: 'D10.6.1', constrainedBy: `${D10} "staff read"` },
  // D10.2.1 conditioning
  { name: 'bench.conditioning.weeklyRate', value: 0.25, min: 0.1, max: 0.5, unit: 'ratio', basis: 'bible', leaf: 'D10.2.1', constrainedBy: `${D10} "conditioning"` },
  { name: 'bench.conditioning.idleWeeklyLoss', value: 0.06, min: 0.02, max: 0.15, unit: 'ratio', basis: 'bible', leaf: 'D10.2.1', constrainedBy: `${D10} "conditioning"` },
  { name: 'bench.conditioning.floor', value: 55, min: 40, max: 70, unit: 'iss', basis: 'bible', leaf: 'D10.2.1', constrainedBy: `${D10} "conditioning"` },
  // "Full training brings a player from 60 to 90 in about 5 weeks" with rate 0.25 implies a target near 99.
  { name: 'bench.conditioning.fullWorkTarget', value: 100, min: 90, max: 100, unit: 'iss', basis: 'assumption', leaf: 'D10.2.1', constrainedBy: `${D10} "conditioning"` },
  { name: 'bench.conditioning.afterLayoff', value: 65, min: 55, max: 80, unit: 'iss', basis: 'bible', leaf: 'D10.2.1', constrainedBy: `${D10} "conditioning"` },
  // D10.3.1 load units
  { name: 'bench.load.gameSnap', value: 1, min: 0.5, max: 2, unit: 'load', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "weekly load"` },
  { name: 'bench.load.gameSnapContact', value: 1.2, min: 0.5, max: 2, unit: 'load', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "weekly load"` },
  { name: 'bench.load.liveRep', value: 0.9, min: 0.3, max: 1.5, unit: 'load', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "weekly load"` },
  { name: 'bench.load.thudRep', value: 0.6, min: 0.2, max: 1, unit: 'load', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "weekly load"` },
  { name: 'bench.load.teamRep', value: 0.4, min: 0.1, max: 0.8, unit: 'load', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "weekly load"` },
  { name: 'bench.load.individualMinute', value: 0.3, min: 0.1, max: 0.6, unit: 'load', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "weekly load"` },
  { name: 'bench.load.walkThrough', value: 0.05, min: 0, max: 0.2, unit: 'load', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "weekly load"` },
  // D10.3.1 tolerance and debt
  { name: 'bench.tolerance.chronicMultiplier', value: 1.3, min: 1, max: 1.6, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "full pads"` },
  { name: 'bench.tolerance.ageFullUntil', value: 28, min: 24, max: 32, unit: 'years', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "age factor"` },
  { name: 'bench.tolerance.ageFloorAt', value: 34, min: 30, max: 40, unit: 'years', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "age factor"` },
  { name: 'bench.tolerance.ageFloor', value: 0.85, min: 0.6, max: 1, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "age factor"` },
  { name: 'bench.tolerance.conditioningReference', value: 85, min: 60, max: 100, unit: 'iss', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "full pads"` },
  { name: 'bench.debt.dailyRecovery', value: 0.12, min: 0.05, max: 0.3, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "short week"` },
  { name: 'bench.debt.dayOffRecovery', value: 0.2, min: 0.05, max: 0.4, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "short week"` },
  { name: 'bench.band.heavy', value: 0.15, min: 0.05, max: 0.3, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "bands"` },
  { name: 'bench.band.overreached', value: 0.35, min: 0.2, max: 0.5, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "bands"` },
  { name: 'bench.band.runDown', value: 0.6, min: 0.4, max: 0.9, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "bands"` },
  { name: 'bench.band.heavyFreshnessCut', value: 0.05, min: 0, max: 0.15, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "bands"` },
  { name: 'bench.band.overreachedFreshnessCut', value: 0.12, min: 0, max: 0.25, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: `${D10} "bands"` },
  { name: 'bench.band.heavyDevelopment', value: 0.85, min: 0.5, max: 1, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: 'D7.1.1 development tests' },
  { name: 'bench.band.overreachedDevelopment', value: 0.6, min: 0.3, max: 1, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: 'D7.1.1 development tests' },
  { name: 'bench.band.overreachedSoftTissue', value: 1.4, min: 1, max: 2, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: 'D11.1.1 injury tests; J15.7 injury rows' },
  { name: 'bench.band.overreachedAttentionCut', value: 0.1, min: 0, max: 0.3, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: 'D9.2.1 knowledge tests' },
  { name: 'bench.band.runDownIllness', value: 2, min: 1, max: 4, unit: 'ratio', basis: 'bible', leaf: 'D10.3.1', constrainedBy: 'D11.7.1 illness tests' },
  // D10.4.1 season wear
  { name: 'bench.wear.offset', value: 0.75, min: 0.5, max: 1, unit: 'ratio', basis: 'bible', leaf: 'D10.4.1', constrainedBy: `${D10} "season wear"` },
  { name: 'bench.wear.scale', value: 2, min: 1, max: 4, unit: 'ratio', basis: 'bible', leaf: 'D10.4.1', constrainedBy: `${D10} "season wear"` },
  { name: 'bench.wear.contactWeight', value: 1.5, min: 1, max: 3, unit: 'ratio', basis: 'bible', leaf: 'D10.4.1', constrainedBy: `${D10} "season wear"` },
  { name: 'bench.wear.byeRemoval', value: 0.1, min: 0, max: 0.3, unit: 'ratio', basis: 'bible', leaf: 'D10.4.1', constrainedBy: `${D10} "season wear"` },
  { name: 'bench.wear.freshnessCut', value: 0.06, min: 0, max: 0.15, unit: 'ratio', basis: 'bible', leaf: 'D10.4.1', constrainedBy: `${D10} "season wear"` },
  { name: 'bench.wear.softTissue', value: 1.15, min: 1, max: 1.5, unit: 'ratio', basis: 'bible', leaf: 'D10.4.1', constrainedBy: 'D11.1.1 injury tests' },
  { name: 'bench.wear.agingAdd', value: 0.1, min: 0, max: 0.3, unit: 'ratio', basis: 'bible', leaf: 'D10.4.1', constrainedBy: 'D8.2.1 aging tests' },
];

export const PARAMS: Contract.ParamFile = {
  module: BENCH_MODULE,
  version: '0.1.0',
  params: rows.map((r) => ({ ...r, belongsTo: BENCH_MODULE, status: 'starting' as const })),
};

export type BenchParam = (typeof rows)[number]['name'];

/** A read-only table over this module's parameter file. The integrator's merged table replaces it after the merge. */
export function benchParamTable(): Contract.ParamTable {
  const byName = new Map(PARAMS.params.map((p) => [p.name, p.value]));
  return {
    version: PARAMS.version,
    has: (name) => byName.has(name),
    num: (name) => {
      const v = byName.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
  };
}
