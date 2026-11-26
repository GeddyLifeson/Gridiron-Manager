// J6.4 Release, route and coverage. In the release contest A is positive when the receiver is winning.
import type { DeterministicMath, EngagementParams, RandomStream } from '@gm/schema';
import { clamp, clampProbability, lerp, type ContestNum } from './math.ts';

export interface ReleaseOutcome {
  readonly kind: 'clean' | 'contested' | 'jam';
  /** Timing delay on the route, seconds (J6.4.1: 0 to 0.6). */
  readonly delayS: number;
  /** Lateral push of the stem off its line, yards (0 to 1.5). */
  readonly stemPushYd: number;
  /** After a clean release the defender is a step behind and starts in trail. */
  readonly defenderInTrail: boolean;
}

export interface BreakInputs {
  readonly zCover: number;
  readonly zRoute: number;
  /** -1 the break goes toward the defender's leverage (he is already there), +1 it goes away from it. */
  readonly leverage: number;
  /** He anticipated the route (J3.2.3): no delay at all. */
  readonly anticipated: boolean;
  /** A second defender holds the other leverage, which removes the "away" penalty. */
  readonly bracketed: boolean;
  /** Extra delay from a pick or rub (J2.5.3), seconds. */
  readonly rubDelayS: number;
}

export interface ZoneBreakInputs {
  readonly zZone: number;
  /** J3.4.2 lean, seconds: negative when his eyes took him to the throw early. Clamped to the leaf's range. */
  readonly leanS: number;
  /** Eyes on the wrong threat: he pays his full recognition delay (J3.2.1) on top. */
  readonly wrongThreat: boolean;
  readonly recognitionDelayS: number;
}

export interface CoverageContests {
  releaseEngagement(): EngagementParams;
  /** The press contest ends at its time limit or when the receiver leaves the legal contact zone. `contactZoneYd` is null when the rule set has none. */
  releaseOver(elapsedS: number, depthYd: number, contactZoneYd: number | null): boolean;
  /** Maps the final A to the outcome. No draw: the noise is already in A. */
  releaseOutcome(advantage: number): ReleaseOutcome;
  /** J6.4.2 `delayBreak`, seconds. */
  breakDelayS(input: BreakInputs): number;
  doubleMoveBiteProbability(zDiscipline: number, zAggressiveness: number): number;
  /** One uniform. True when the defender reacts to the first move and must pay a full transition. */
  resolveDoubleMove(zDiscipline: number, zAggressiveness: number, stream: RandomStream): boolean;
  /** J6.4.3 `delayBreak` for a zone defender breaking on the throw, seconds. */
  zoneBreakDelayS(input: ZoneBreakInputs): number;
}

export function createCoverage(n: ContestNum, math: DeterministicMath): CoverageContests {
  const release: EngagementParams = { kappa: n('release.kappa'), lambda: n('release.lambda'), sigma: n('release.sigma') };
  const maxS = n('release.maxS'), cleanA = n('release.cleanA'), jamA = n('release.jamA');
  const cMin = n('release.contestedDelayMinS'), cMax = n('release.contestedDelayMaxS');
  const jamMax = n('release.jamDelayMaxS'), pushMax = n('release.stemPushMaxYd');
  const sBase = n('separation.baseS'), sCover = n('separation.perZCoverS'), sRoute = n('separation.perZRouteS'), sFloor = n('separation.floorS');
  const levAway = n('separation.leverageAwayS'), levToward = n('separation.leverageTowardS');
  const bite0 = n('separation.biteBeta0'), biteDisc = n('separation.biteDiscipline'), biteAggr = n('separation.biteAggressive');
  const zBase = n('zone.baseS'), zPerZ = n('zone.perZS'), zFloor = n('zone.floorS'), leanMax = n('zone.leanMaxS');

  const doubleMoveBiteProbability = (zDiscipline: number, zAggressiveness: number): number =>
    clampProbability(math.logistic(bite0 + biteDisc * zDiscipline + biteAggr * zAggressiveness));

  return {
    releaseEngagement: () => release,
    releaseOver: (elapsedS, depthYd, contactZoneYd) => elapsedS >= maxS - 1e-9 || (contactZoneYd !== null && depthYd >= contactZoneYd),
    releaseOutcome(advantage) {
      if (advantage > cleanA) return { kind: 'clean', delayS: 0, stemPushYd: 0, defenderInTrail: true };
      if (advantage < jamA) {
        const depth = clamp((jamA - advantage) / (1 + jamA), 0, 1); // 0 at the jam threshold, 1 at A = -1
        return { kind: 'jam', delayS: lerp(cMax, jamMax, depth), stemPushYd: pushMax * depth, defenderInTrail: false };
      }
      const t = (advantage - jamA) / (cleanA - jamA); // 0 at the jam threshold, 1 at the clean threshold
      return { kind: 'contested', delayS: lerp(cMax, cMin, t), stemPushYd: 0, defenderInTrail: false };
    },
    breakDelayS(i) {
      if (i.anticipated) return 0;
      const lev = clamp(i.leverage, -1, 1);
      let m = lev >= 0 ? levAway * lev : -levToward * lev;
      if (i.bracketed && m > 0) m = 0;
      const d = sBase - sCover * i.zCover + sRoute * i.zRoute + m;
      return (d < sFloor ? sFloor : d) + i.rubDelayS;
    },
    doubleMoveBiteProbability,
    resolveDoubleMove: (zDiscipline, zAggressiveness, stream) => stream.uniform() < doubleMoveBiteProbability(zDiscipline, zAggressiveness),
    zoneBreakDelayS(i) {
      const d = zBase - zPerZ * i.zZone + clamp(i.leanS, -leanMax, leanMax);
      return (d < zFloor ? zFloor : d) + (i.wrongThreat ? i.recognitionDelayS : 0);
    },
  };
}
