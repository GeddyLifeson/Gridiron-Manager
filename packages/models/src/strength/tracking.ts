// Tracking data: speed, distance and load from practice and games (N2.5.1). Game metrics come from the
// engine's stored positions down-sampled to 10 samples per second (rule 1); practice metrics come from
// the practice plan and a movement profile per period type and position (rule 2). The load-to-injury
// link is not here: it lives in D11 with its own evidence status.
import type { DeterministicMath } from '@gm/schema';
import { param } from './params.ts';

export class TrackingError extends Error {}

export interface Point { readonly x: number; readonly y: number }

/** Keeps every k-th position so the stored rate is `tracking.sampleHz` (rule 1). The last position is always kept. */
export function downsample(positions: readonly Point[], tickHz: number): Point[] {
  const hz = param('tracking.sampleHz');
  const k = tickHz / hz;
  if (!Number.isInteger(k) || k < 1) throw new TrackingError(`tick rate ${tickHz} Hz is not a whole multiple of ${hz} Hz`);
  const out: Point[] = [];
  for (let i = 0; i < positions.length; i += k) out.push(positions[i]!);
  const last = positions[positions.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

export interface GameMovement {
  /** Path length of the stored positions, yards. */
  readonly distanceYd: number;
  readonly highSpeedYd: number;
  readonly sprints: number;
  readonly topSpeedYdS: number;
  readonly accelerations: number;
  readonly decelerations: number;
}

/**
 * Metrics of one player's stored positions over one or more plays (each play a separate track, sampled
 * at `tracking.sampleHz`). Distance is the exact path length of what is stored (acceptance: within 1 percent).
 */
export function gameMovement(plays: readonly (readonly Point[])[], math: DeterministicMath): GameMovement {
  const dt = 1 / param('tracking.sampleHz');
  const hs = param('tracking.highSpeedYdS'), sp = param('tracking.sprintYdS'), ac = param('tracking.accelYdS2');
  const need = Math.ceil(param('tracking.minEffortS') / dt - 1e-9);
  const needA = Math.ceil(param('tracking.minAccelS') / dt - 1e-9);
  let dist = 0, high = 0, top = 0, sprints = 0, accels = 0, decels = 0;
  for (const track of plays) {
    let prevV: number | null = null;
    let runS = 0, runA = 0, runD = 0;
    for (let i = 1; i < track.length; i++) {
      const dx = track[i]!.x - track[i - 1]!.x, dy = track[i]!.y - track[i - 1]!.y;
      const seg = math.sqrt(dx * dx + dy * dy);
      const v = seg / dt;
      dist += seg;
      if (v >= hs) high += seg;
      if (v > top) top = v;
      runS = v >= sp ? runS + 1 : 0;
      if (runS === need) sprints++;
      if (prevV !== null) {
        const a = (v - prevV) / dt;
        runA = a >= ac ? runA + 1 : 0;
        runD = a <= -ac ? runD + 1 : 0;
        if (runA === needA) accels++;
        if (runD === needA) decels++;
      }
      prevV = v;
    }
  }
  return { distanceYd: dist, highSpeedYd: high, sprints, topSpeedYdS: top, accelerations: accels, decelerations: decels };
}

// ---------------------------------------------------------------- practice load (rule 2)

export interface MovementProfile {
  /** Yards and high-speed yards one player of this position covers per rep of this period type at normal tempo. */
  readonly distancePerRepYd: number;
  readonly highSpeedPerRepYd: number;
}

export interface PracticePeriod {
  readonly periodType: string;
  /** Reps the player took. */
  readonly reps: number;
  /** Tempo multiplier from the practice plan (1 = normal). */
  readonly tempo: number;
}

export interface Load { readonly distanceYd: number; readonly highSpeedYd: number }

/** Practice load of one player for one day: linear in reps and tempo (acceptance: doubling reps doubles the contribution). */
export function practiceLoad(periods: readonly PracticePeriod[], profileOf: (periodType: string) => MovementProfile | undefined): Load {
  let d = 0, h = 0;
  for (const p of periods) {
    const prof = profileOf(p.periodType);
    if (!prof) throw new TrackingError(`no movement profile for period type ${p.periodType}`);
    if (p.reps < 0 || p.tempo < 0) throw new TrackingError(`period ${p.periodType}: reps and tempo cannot be negative`);
    d += prof.distancePerRepYd * p.reps * p.tempo;
    h += prof.highSpeedPerRepYd * p.reps * p.tempo;
  }
  return { distanceYd: d, highSpeedYd: h };
}

// ---------------------------------------------------------------- load ratio (rule 3)

export type LoadFlag = 'underloaded' | 'normal' | 'spike';

export interface LoadRatio {
  /** 7-day sum over the 28-day weekly average; null without a 28-day base. */
  readonly ratio: number | null;
  readonly flag: LoadFlag | null;
  /** The band came from the return-to-play plan, not the player's own history (edge cases). */
  readonly fromReturnPlan: boolean;
}

/**
 * Acute to chronic ratio of daily load (any one measure, e.g. distance). `daily` maps day index to load;
 * missing days are zero. Without 28 days of history the ratio is null unless the return-to-play plan
 * (H5) supplies a band: then that weekly load stands in for the chronic base.
 */
export function loadRatio(daily: ReadonlyMap<number, number>, today: number, historyStartDay: number, returnPlanWeekly: number | null = null): LoadRatio {
  const aDays = param('tracking.acuteDays'), cDays = param('tracking.chronicDays');
  let acute = 0, chronic = 0;
  for (let d = today - cDays + 1; d <= today; d++) {
    const v = daily.get(d) ?? 0;
    chronic += v;
    if (d > today - aDays) acute += v;
  }
  const hasBase = today - historyStartDay + 1 >= cDays;
  let base: number | null = hasBase ? chronic / (cDays / aDays) : null;
  const fromReturnPlan = !hasBase && returnPlanWeekly !== null;
  if (fromReturnPlan) base = returnPlanWeekly;
  if (base === null || base <= 0) return { ratio: null, flag: null, fromReturnPlan };
  const ratio = acute / base;
  const flag: LoadFlag = ratio < param('tracking.underloaded') ? 'underloaded' : ratio > param('tracking.spike') ? 'spike' : 'normal';
  return { ratio, flag, fromReturnPlan };
}

/** Rule 4: top speed more than 5 percent under the season best in two straight games raises a "check on him" note. */
export function topSpeedNote(gameTopSpeeds: readonly number[]): boolean {
  const n = param('tracking.topSpeedGames');
  if (gameTopSpeeds.length <= n) return false;
  const recent = gameTopSpeeds.slice(-n);
  let best = 0;
  for (const v of gameTopSpeeds.slice(0, -n)) if (v > best) best = v;
  const floor = best * (1 - param('tracking.topSpeedDrop'));
  return recent.every((v) => v < floor);
}

/** Rule 5: what tracking a program has. Supplied by the program resource table (T area, C1.2.2). */
export type TrackingLevel = 'full' | 'practice_only' | 'none';

export function trackingReports(level: TrackingLevel): { readonly practice: boolean; readonly games: boolean } {
  return { practice: level !== 'none', games: level === 'full' };
}
