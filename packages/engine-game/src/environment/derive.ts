// Derived multipliers (J12.1.1: "computed once per update ... by table lookup so that consumers never
// interpret raw weather themselves"). Every function here is pure in the snapshot fields (J12.1.1
// acceptance 3). Footing (J12.5.1), grip and the `wet` context input (J12.4.1, J12.4.2), air density
// (J12.7.1) and the kick distance factor (J12.4.2).
import type { Contract } from '@gm/engine-core';
import { airDensityRatio } from './physics.ts';
import type { Precip, SurfaceCondition, SurfaceKind } from './types.ts';

type Env = Contract.Environment;
type Fields = Omit<Env, 'derived'>;

/** J12.4.1 `wet` value of a precipitation state, before any team adjustment. */
export function wetOf(precip: Precip, p: Contract.ParamTable): number {
  switch (precip) {
    case 'none': return 0;
    case 'light_rain': return p.num('environment.wet.lightRain');
    case 'rain': return p.num('environment.wet.rain');
    case 'heavy_rain': return p.num('environment.wet.heavyRain');
    case 'snow': return p.num('environment.wet.snow');
    case 'heavy_snow': return p.num('environment.wet.heavySnow');
  }
}

/** J12.4.2 cold grip term: a `wet`-like term below the cold threshold. */
export function coldWetOf(tempF: number, p: Contract.ParamTable): number {
  return tempF < p.num('environment.cold.gripBelowF') ? p.num('environment.cold.gripWet') : 0;
}

/** Combined `wet` index from precipitation and cold, 0 to 1 (independent losses combine multiplicatively). */
export function wetIndex(precip: Precip, tempF: number, p: Contract.ParamTable): number {
  return 1 - (1 - wetOf(precip, p)) * (1 - coldWetOf(tempF, p));
}

/**
 * The `wet` context input one team's ball handling sees (J5.6.2, J6.5.1, J6.7.1, J7.6.2, J9.4.1). A team
 * that held a wet-ball period this week has its `wet` multiplied by the practice scale (J12.4.1).
 */
export function teamWet(env: Env, practisedWetBall: boolean, p: Contract.ParamTable): number {
  const w = wetIndex(env.precip, env.tempF, p);
  return practisedWetBall ? w * p.num('environment.wet.practiceScale') : w;
}

/** Grip factor from a `wet` index: 1.0 dry down to about 0.8 at full wet (J12.4.1). */
export function gripOf(wet: number, p: Contract.ParamTable): number {
  return 1 - p.num('environment.grip.lossAtFullWet') * Math.min(1, Math.max(0, wet));
}

/** One team's grip factor, with its wet-ball practice. */
export function teamGrip(env: Env, practisedWetBall: boolean, p: Contract.ParamTable): number {
  return gripOf(teamWet(env, practisedWetBall, p), p);
}

/** J12.5.1 footing table. */
export function footingOf(condition: SurfaceCondition, kind: SurfaceKind, p: Contract.ParamTable): number {
  switch (condition) {
    case 'dry': return 1;
    case 'damp': return p.num('environment.footing.damp');
    case 'wet': return kind === 'artificial' ? p.num('environment.footing.wetArtificial') : p.num('environment.footing.wetNatural');
    case 'soft': return p.num('environment.footing.soft');
    case 'frozen': return p.num('environment.footing.frozen');
    case 'snow_covered': return p.num('environment.footing.snowCovered');
  }
}

/**
 * J12.5.1: footing multiplies lateral acceleration and braking limits fully, and forward acceleration by
 * half the deficit, so cutting suffers more than straight-line speed. For J2.1.1 step 5.
 */
export function footingLimits(footing: number): { readonly lateral: number; readonly braking: number; readonly forward: number } {
  return { lateral: footing, braking: footing, forward: 1 - (1 - footing) / 2 };
}

/**
 * J12.4.2 ball-hardness share of the cold effect on kick distance. The denser-air share is in airDensity,
 * which J9 applies to drag, so J9 adds no cold term of its own.
 */
export function kickDistanceOf(tempF: number, p: Contract.ParamTable): number {
  const below = Math.max(0, p.num('environment.kick.referenceTempF') - tempF);
  return Math.max(0, 1 - p.num('environment.kick.ballColdLossPerF') * below);
}

/**
 * All derived multipliers of a snapshot. `passDistance` stays 1: measured intended air yards per attempt do
 * not move with wind, rain or cold (J12.3.1, J12.4.1, J12.4.2), and pass flight already reads airDensity.
 */
export function deriveMultipliers(f: Fields, kind: SurfaceKind, p: Contract.ParamTable, m: Contract.DeterministicMath): Env['derived'] {
  return {
    footing: footingOf(f.surfaceCondition, kind, p),
    grip: gripOf(wetIndex(f.precip, f.tempF, p), p),
    airDensity: airDensityRatio(f.altitudeFt, f.tempF, p.num('environment.kick.referenceTempF'), m),
    kickDistance: kickDistanceOf(f.tempF, p),
    passDistance: 1,
  };
}
