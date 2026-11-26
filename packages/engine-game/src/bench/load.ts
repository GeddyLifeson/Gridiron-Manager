// Fatigue beyond one game: conditioning (D10.2.1), weekly load and fatigue debt (D10.3.1), season wear
// (D10.4.1), travel (D10.5.1), and the game-day starting freshness they produce (D10.1.1 input).
// These are pure formulas. The week and season runner (game build plan) owns calling them day by day.
import type { Contract } from '@gm/engine-core';

type P = Contract.ParamTable;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------------------------------------
// D10.2.1 conditioning
// ---------------------------------------------------------------------------------------------

/**
 * One week of conditioning change. `workShare` is the last 3 weeks of conditioning work as a share of full
 * training (0 to 1). With work the value moves a quarter of the way to the work-implied target each week;
 * with none it falls 6 percent a week toward the floor (D10.2.1). `ceiling` is the player's stamina ceiling.
 */
export function conditioningAfterWeek(current: number, workShare: number, ceiling: number, p: P): number {
  const floor = p.num('bench.conditioning.floor');
  if (workShare <= 0) return Math.max(floor, Math.min(current, current * (1 - p.num('bench.conditioning.idleWeeklyLoss'))));
  const top = Math.min(ceiling, p.num('bench.conditioning.fullWorkTarget'));
  const target = floor + (top - floor) * clamp(workShare, 0, 1);
  return clamp(current + p.num('bench.conditioning.weeklyRate') * (target - current), 0, 100);
}

/** D10.2.1 edge case: a player back from a long layoff starts near this value and is ramped (D11.6.1). */
export function conditioningAfterLayoff(p: P): number {
  return p.num('bench.conditioning.afterLayoff');
}

// ---------------------------------------------------------------------------------------------
// D10.3.1 load, tolerance and fatigue debt
// ---------------------------------------------------------------------------------------------

export interface DayActivity {
  readonly gameSnaps?: number;
  /** Game snaps at a lineman or contact position (weighted 1.2). */
  readonly gameSnapsContact?: number;
  readonly liveReps?: number;
  readonly thudReps?: number;
  readonly teamReps?: number;
  readonly individualMinutes?: number;
  readonly walkThroughReps?: number;
  /** Conditioning work and anything else already in load units. */
  readonly otherLoad?: number;
  readonly timeZonesCrossed?: number;
}

/** Load units for one day (D10.3.1 starting values; travel from D10.5.1). */
export function dayLoad(a: DayActivity, p: P): number {
  return (a.gameSnaps ?? 0) * p.num('bench.load.gameSnap') + (a.gameSnapsContact ?? 0) * p.num('bench.load.gameSnapContact')
    + (a.liveReps ?? 0) * p.num('bench.load.liveRep') + (a.thudReps ?? 0) * p.num('bench.load.thudRep')
    + (a.teamReps ?? 0) * p.num('bench.load.teamRep') + (a.individualMinutes ?? 0) * p.num('bench.load.individualMinute')
    + (a.walkThroughReps ?? 0) * p.num('bench.load.walkThrough') + (a.otherLoad ?? 0)
    + (a.timeZonesCrossed ?? 0) * p.num('bench.travel.loadPerZone');
}

/** Acute load: the last 7 days. `daily` is oldest first. */
export function acuteLoad(daily: readonly number[]): number {
  return sum(daily.slice(-7));
}

/**
 * Chronic load: the average of the last 28 days, expressed per week so that it compares with acute load and
 * with the weekly tolerance (the leaf says "average of the last 28 days" and multiplies it by 1.3 to get a
 * weekly tolerance; reading it per week is this module's interpretation). Fewer than 28 days of history
 * averages what there is.
 */
export function chronicLoad(daily: readonly number[]): number {
  const last = daily.slice(-28);
  if (last.length === 0) return 0;
  return (sum(last) / last.length) * 7;
}

/** D10.3.1 age factor: 1 under 28, falling in a straight line to 0.85 at 34 and staying there. */
export function ageFactor(ageYears: number, p: P): number {
  const full = p.num('bench.tolerance.ageFullUntil'), at = p.num('bench.tolerance.ageFloorAt'), lo = p.num('bench.tolerance.ageFloor');
  if (ageYears <= full) return 1;
  if (ageYears >= at) return lo;
  return 1 - (1 - lo) * (ageYears - full) / (at - full);
}

/** Weekly tolerance = chronic load x 1.3 x age factor x conditioning / 85 (D10.3.1). */
export function weeklyTolerance(chronicWeekly: number, ageYears: number, conditioning: number, p: P): number {
  return chronicWeekly * p.num('bench.tolerance.chronicMultiplier') * ageFactor(ageYears, p) * conditioning / p.num('bench.tolerance.conditioningReference');
}

/**
 * One day of fatigue debt (D10.3.1): debt grows by the day's load above the day's share of the weekly
 * tolerance and shrinks by 12 percent (20 on a full day off), scaled by the D8.3.1 recovery weight for age
 * and slowed after returning travel (D10.5.1). Recovery acts on the debt carried into the day.
 */
export function debtAfterDay(debt: number, load: number, weeklyTol: number, o: { dayOff: boolean; ageRecoveryWeight: number; returnTravel?: boolean }, p: P): number {
  const rate = p.num(o.dayOff ? 'bench.debt.dayOffRecovery' : 'bench.debt.dailyRecovery') * o.ageRecoveryWeight
    * (o.returnTravel ? 1 - p.num('bench.travel.returnRecoverySlow') : 1);
  const recovered = debt * clamp(rate, 0, 1);
  return Math.max(0, debt - recovered + Math.max(0, load - weeklyTol / 7));
}

export type DebtBand = 'none' | 'heavy' | 'overreached' | 'run_down';

/** Bands act on the accumulated debt against the weekly tolerance, never on a single day (D10.3.1). */
export function debtBand(debt: number, weeklyTol: number, p: P): DebtBand {
  if (weeklyTol <= 0) return debt > 0 ? 'run_down' : 'none';
  const r = debt / weeklyTol;
  if (r > p.num('bench.band.runDown')) return 'run_down';
  if (r >= p.num('bench.band.overreached')) return 'overreached';
  if (r >= p.num('bench.band.heavy')) return 'heavy';
  return 'none';
}

export interface BandEffects {
  /** Cut to game-day starting long-term freshness. */
  readonly freshnessCut: number;
  /** D7 development factor. */
  readonly development: number;
  /** D11.1.1 soft-tissue injury multiplier. */
  readonly softTissue: number;
  /** D9 attention cut. */
  readonly attentionCut: number;
  /** D11.7.1 illness multiplier. */
  readonly illness: number;
  /** A D12 complaint event is due (generated people only). */
  readonly complaint: boolean;
}

export function bandEffects(band: DebtBand, p: P): BandEffects {
  switch (band) {
    case 'none': return { freshnessCut: 0, development: 1, softTissue: 1, attentionCut: 0, illness: 1, complaint: false };
    case 'heavy': return { freshnessCut: p.num('bench.band.heavyFreshnessCut'), development: p.num('bench.band.heavyDevelopment'), softTissue: 1, attentionCut: 0, illness: 1, complaint: false };
    case 'overreached':
    case 'run_down': return {
      freshnessCut: p.num('bench.band.overreachedFreshnessCut'), development: p.num('bench.band.overreachedDevelopment'),
      softTissue: p.num('bench.band.overreachedSoftTissue'), attentionCut: p.num('bench.band.overreachedAttentionCut'),
      illness: band === 'run_down' ? p.num('bench.band.runDownIllness') : 1, complaint: band === 'run_down',
    };
  }
}

// ---------------------------------------------------------------------------------------------
// D10.4.1 season wear
// ---------------------------------------------------------------------------------------------

/**
 * Wear 0 to 1 = (cumulative load / the position's 80th-percentile full-season load - 0.75) x 2, with contact
 * load (carries, tackles) counted 1.5 times and 0.1 removed per bye week (D10.4.1). `p80` is data the caller
 * supplies by position and level.
 */
export function seasonWear(o: { load: number; contactLoad: number; p80: number; byeWeeks: number }, p: P): number {
  if (o.p80 <= 0) return 0;
  const cum = o.load + o.contactLoad * p.num('bench.wear.contactWeight');
  const raw = Math.max(0, cum / o.p80 - p.num('bench.wear.offset')) * p.num('bench.wear.scale');
  return clamp(raw - o.byeWeeks * p.num('bench.wear.byeRemoval'), 0, 1);
}

/** Effects of wear, scaled in a straight line from none at 0 to the leaf's values at 1 (the scaling is an assumption). */
export function wearEffects(wear: number, p: P): { freshnessCut: number; softTissue: number; agingAdd: number } {
  const w = clamp(wear, 0, 1);
  return { freshnessCut: w * p.num('bench.wear.freshnessCut'), softTissue: 1 + w * (p.num('bench.wear.softTissue') - 1), agingAdd: w * p.num('bench.wear.agingAdd') };
}

// ---------------------------------------------------------------------------------------------
// Game-day start
// ---------------------------------------------------------------------------------------------

export interface GameDayStartInput {
  readonly conditioning: number;
  readonly band: DebtBand;
  readonly wear: number;
  /** Kickoff on the team's body clock, hours (D10.5.1 early-start cut before 10:00). */
  readonly bodyClockKickoffHour: number;
}

/**
 * Starting long-term freshness for a game: 1 less the debt-band cut, the wear cut and the early body-clock cut.
 * The leaves give each cut as "minus N percent"; adding them is this module's choice.
 */
export function startingLongTerm(i: GameDayStartInput, p: P): number {
  const early = i.bodyClockKickoffHour < p.num('bench.travel.earlyBodyClockHour') ? p.num('bench.travel.earlyBodyClockCut') : 0;
  return clamp(1 - bandEffects(i.band, p).freshnessCut - wearEffects(i.wear, p).freshnessCut - early, 0, 1);
}

/** The fatigue fields of a player's GameDayState at kickoff. Other fields are the caller's. */
export function gameDayFatigue(i: GameDayStartInput, p: P): Pick<Contract.GameDayState, 'freshness' | 'freshnessLongTerm' | 'conditioning'> {
  const lt = startingLongTerm(i, p);
  return { freshness: lt, freshnessLongTerm: lt, conditioning: clamp(i.conditioning, 0, 100) };
}

function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
