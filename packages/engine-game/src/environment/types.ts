// Inputs and hidden process state of the environment module (J12). The venue input is this module's own
// shape: the world contract's VenueRecord has no retractable roof kind, wind shelter, field orientation or
// natural/artificial split yet (contract request in the PR), so the caller maps its venue into this.
import type { Contract } from '@gm/engine-core';

export type RoofKind = 'open' | 'retractable' | 'fixed_dome';
export type SurfaceKind = 'natural' | 'artificial';
export type Precip = Contract.Environment['precip'];
export type SurfaceCondition = Contract.Environment['surfaceCondition'];

/** Monthly climate normals of a reference place (G-11 reference-locations.json `climate.normals`). Twelve values each, January first. */
export interface ClimateNormals {
  readonly tempF: readonly number[];
  readonly precipIn: readonly number[];
  readonly snowIn: readonly number[];
}

export interface VenueEnvironment {
  readonly roofKind: RoofKind;
  /** Content id of the surface type (C1). */
  readonly surfaceType: string;
  /** Natural grass (including hybrid) turns soft in a long rain; artificial surfaces never do (J12.5.1). */
  readonly surfaceKind: SurfaceKind;
  readonly altitudeFt: number;
  readonly noiseBase: number;
  /** Field-level share of open-air wind, 0 to 1 (J12.3.1 shelter factor). */
  readonly windShelter: number;
  /** Compass bearing, degrees clockwise from north, that the field's +x axis (toward the east goal line) points to. */
  readonly fieldAxisBearingDeg: number;
  /** Null while the reference place's normals are PENDING: the provisional climate of params.ts is used and flagged. */
  readonly climate: ClimateNormals | null;
}

export type RoofCall = 'open' | 'closed';

export interface GameEnvironmentInput {
  /** Game id for the J13 stream scopes (weather, forecast, gust, footing). */
  readonly gameId: string | number;
  readonly venue: VenueEnvironment;
  /** Local calendar date of kickoff. */
  readonly month: number;
  readonly day: number;
  /** Local kickoff time in hours, for example 13 or 20.33. */
  readonly kickoffLocalHour: number;
  /** Retractable roof only: the home club's call reported at T minus 90 (J12.1.1). Absent: the default rule of params.ts. */
  readonly roofCall?: RoofCall;
  /** Retractable roof only: a closed roof is to open at halftime (form filed at the T minus 90 meeting). */
  readonly halftimeOpen?: boolean;
  /**
   * League roof policy (J12.1.1 `league.roof_policy`, rule key not in the dictionary yet): whether a roof
   * closed for the first half may open at halftime. Default true, the 2015 policy the bible reads.
   */
  readonly halftimeOpenAllowed?: boolean;
}

export interface EnvironmentDeps {
  readonly params: Contract.ParamTable;
  readonly rules: Contract.RuleSet;
  readonly math: Contract.DeterministicMath;
  readonly streams: Contract.StreamSource;
}

export type ClimateStatus = 'normals' | 'provisional';

/** Outdoor weather at the start of a period plus the field's own state. Hidden truth; rebuilt from the seed. */
export interface OutdoorState {
  readonly anomalyF: number;
  readonly tempF: number;
  readonly windMph: number;
  /** Compass bearing the wind blows toward, degrees clockwise from north, in [0, 360). */
  readonly windTowardBearingDeg: number;
  readonly precip: Precip;
  readonly humidityDry: number;
  readonly humidity: number;
  readonly unsettled: boolean;
  /** Consecutive periods with rain of any strength on the uncovered field. */
  readonly rainPeriods: number;
  /** Condition of the playing surface (dry under a closed roof). */
  readonly field: SurfaceCondition;
}

export interface PeriodEnvironment {
  /** 0 is the pre-game snapshot at T minus 90; 1 to 4 the quarters; 5 and up overtime periods. */
  readonly period: number;
  readonly environment: Contract.Environment;
  readonly outdoor: OutdoorState;
  readonly roofClosed: boolean;
  readonly climateStatus: ClimateStatus;
  /** Local hour at the start of the period. */
  readonly localHour: number;
}
