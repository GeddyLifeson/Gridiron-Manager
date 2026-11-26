// Tuning constants of the assignment language (plans/engine-build-plan.md, "Tuning constants").
// None is a rule value. Each threshold says how a perceived picture is turned into a yes or no for
// a condition, or how an action aims. A value the bible states as a starting value cites its leaf;
// every other value is an assumption and is marked so (never presented as a fact).
import type { ParamFile, ParamTable, TuningParam } from '@gm/schema';

const p = (name: string, value: number, min: number, max: number, unit: string, leaf: string, basis: 'bible' | 'assumption' = 'assumption'): TuningParam =>
  ({ name: `lang.${name}`, value, min, max, unit, belongsTo: 'football-lang.lang', basis, leaf, constrainedBy: 'Q3.2', status: 'starting' });

export const PARAMS: ParamFile = {
  module: 'football-lang.lang',
  version: '1',
  params: [
    p('decide.hysteresisTicks', 2, 1, 5, 'tick', 'J4.4.1', 'bible'),
    p('path.passRadiusYd', 0.6, 0.2, 1.5, 'yd', 'J2.5.1', 'bible'),
    p('path.extendYd', 15, 5, 40, 'yd', 'J2.5.1'),
    p('arrive.radiusYd', 1.0, 0.3, 2.5, 'yd', 'J4.1.2'),
    p('release.verticalDepthYd', 5, 2, 10, 'yd', 'J4.1.2'),
    p('release.flatDepthYd', 3, 1, 6, 'yd', 'J4.1.2'),
    p('release.lateralSpeedYps', 2, 0.5, 5, 'yd_per_s', 'J4.1.2'),
    p('release.blockSpeedYps', 1.5, 0.3, 4, 'yd_per_s', 'J4.1.2'),
    p('release.decideS', 0.6, 0.2, 1.5, 's', 'J4.1.2'),
    p('leverage.marginYd', 0.5, 0.1, 2, 'yd', 'J5.2.2', 'bible'),
    p('zone.halfWidthYd', 5, 2, 12, 'yd', 'J4.1.2'),
    p('zone.halfDepthYd', 5, 2, 12, 'yd', 'J4.1.2'),
    p('box.halfWidthYd', 5, 3, 8, 'yd', 'J4.1.2'),
    p('box.depthYd', 6, 3, 9, 'yd', 'J4.1.2'),
    p('front.onLineDepthYd', 1.5, 0.5, 3, 'yd', 'J4.1.2'),
    p('front.headUpYd', 0.175, 0.05, 0.4, 'yd', 'J5.2.2'),
    p('front.shadeYd', 0.525, 0.2, 0.9, 'yd', 'J5.2.2'),
    p('front.gapYd', 1.0, 0.5, 2, 'yd', 'J5.2.2'),
    p('front.walkedUpDepthYd', 2.5, 1.5, 4, 'yd', 'J4.1.2'),
    p('front.engageRangeYd', 1.5, 0.5, 3, 'yd', 'J4.1.2'),
    p('read.moveSpeedYps', 1.0, 0.3, 3, 'yd_per_s', 'J4.1.2'),
    p('safety.deepDepthYd', 10, 7, 15, 'yd', 'J4.1.2'),
    p('pocket.halfWidthYd', 4, 2, 7, 'yd', 'J4.1.2'),
    p('qb.scrambleSpeedYps', 3, 1, 6, 'yd_per_s', 'J4.1.2'),
    p('ball.areaRadiusYd', 5, 2, 10, 'yd', 'J4.1.2'),
    p('eyes.coneCos', 0.866, 0.5, 0.99, 'ratio', 'J3.1.2', 'bible'),
    p('bunch.widthYd', 3, 1.5, 5, 'yd', 'J4.1.2'),
    p('backfield.depthYd', 1.0, 0.5, 2, 'yd', 'J4.1.2'),
    p('trail.offsetYd', 1.0, 0.3, 3, 'yd', 'J4.1.3'),
    // Off coverage: how far ahead of his man's movement a defender on top plays him, and the cushion he keeps. Design values.
    p('trail.offLeadS', 1.0, 0.3, 2, 's', 'J4.1.3'),
    p('trail.offCushionYd', 2, 0.5, 5, 'yd', 'J4.1.3'),
    // A deep zone defender ranges over receivers within this lateral distance of his landmark. Design value.
    p('deepZone.halfWidthYd', 12, 5, 20, 'yd', 'J4.2.1'),
    p('shoulder.offsetYd', 0.5, 0.2, 1, 'yd', 'J4.1.3'),
    p('contain.widthYd', 2, 0.5, 5, 'yd', 'J4.1.3'),
    p('rush.trackOffsetYd', 1.5, 0.5, 4, 'yd', 'J4.1.3'),
    p('spy.depthYd', 5, 2, 9, 'yd', 'J4.1.3'),
    p('passSet.depthYd', 2, 0.5, 5, 'yd', 'J4.1.3'),
    // The point a pass blocker keeps himself in front of, and how far from the rusher's middle he stays once the
    // rusher is at his set depth (about two body radii, so the block stays in contact). Design values.
    p('passSet.pocketDepthYd', 7, 4, 10, 'yd', 'J4.1.3'),
    p('passSet.mirrorGapYd', 0.9, 0.5, 1.5, 'yd', 'J4.1.3'),
    p('combo.holdS', 1.0, 0.3, 2.5, 's', 'J4.1.3'),
    p('chip.holdS', 0.4, 0.1, 1.2, 's', 'J4.1.3'),
    p('scan.rangeYd', 6, 3, 12, 'yd', 'J4.1.3'),
    p('climb.minDepthYd', 3, 1.5, 6, 'yd', 'J4.1.3'),
    p('pursue.leadS', 0.5, 0, 1.5, 's', 'J4.1.3'),
    // Longest time ahead a pursuer aims when he solves for where he can meet the carrier. Design value.
    p('pursue.maxLeadS', 3, 0.5, 6, 's', 'J4.1.3'),
    // How far ahead of the carrier he sees a pursuer plays him (what he sees is a key delay old), and the range
    // inside which he stops breaking down and goes through the man. Design values.
    p('pursue.anticipateS', 0.3, 0, 0.6, 's', 'J4.1.3'),
    p('pursue.attackYd', 3, 1, 6, 'yd', 'J4.1.3'),
    p('pursue.cutbackYd', 2, 0.5, 5, 'yd', 'J4.1.3'),
    p('kick.clearanceYd', 10, 4, 20, 'yd', 'J4.1.3'),
    p('secure.effort', 0.85, 0.5, 1, 'ratio', 'J4.1.3'),
    p('sideline.runYd', 30, 10, 60, 'yd', 'J4.1.3'),
    p('route.sidelineRoomYd', 2, 0.5, 5, 'yd', 'J4.1.3'),
  ],
};

/** The constants read once at compile time, so the tick does no lookups (P6.3.1). */
export interface Consts {
  readonly hysteresisTicks: number; readonly passRadius: number; readonly extend: number; readonly arriveRadius: number;
  readonly verticalDepth: number; readonly flatDepth: number; readonly lateralSpeed: number; readonly blockSpeed: number; readonly releaseDecideS: number;
  readonly leverageMargin: number; readonly zoneHalfWidth: number; readonly zoneHalfDepth: number; readonly boxHalfWidth: number; readonly boxDepth: number;
  readonly onLineDepth: number; readonly headUp: number; readonly shade: number; readonly gap: number; readonly walkedUpDepth: number; readonly engageRange: number;
  readonly moveSpeed: number; readonly deepDepth: number; readonly pocketHalfWidth: number; readonly scrambleSpeed: number; readonly ballArea: number; readonly eyesConeCos: number;
  readonly bunchWidth: number; readonly backfieldDepth: number; readonly trailOffset: number; readonly offLeadS: number; readonly offCushion: number; readonly deepZoneHalfWidth: number; readonly shoulderOffset: number; readonly containWidth: number;
  readonly rushTrackOffset: number; readonly spyDepth: number; readonly passSetDepth: number; readonly passSetPocketDepth: number; readonly passSetMirrorGap: number; readonly comboHoldS: number; readonly chipHoldS: number;
  readonly scanRange: number; readonly climbMinDepth: number; readonly pursueLeadS: number; readonly pursueMaxLeadS: number; readonly pursueAnticipateS: number; readonly pursueAttackYd: number; readonly pursueCutback: number; readonly kickClearance: number;
  readonly secureEffort: number; readonly sidelineRun: number; readonly sidelineRoom: number;
}

export function constsOf(t: ParamTable): Consts {
  const n = (name: string): number => t.num(`lang.${name}`);
  return {
    hysteresisTicks: n('decide.hysteresisTicks'), passRadius: n('path.passRadiusYd'), extend: n('path.extendYd'), arriveRadius: n('arrive.radiusYd'),
    verticalDepth: n('release.verticalDepthYd'), flatDepth: n('release.flatDepthYd'), lateralSpeed: n('release.lateralSpeedYps'), blockSpeed: n('release.blockSpeedYps'), releaseDecideS: n('release.decideS'),
    leverageMargin: n('leverage.marginYd'), zoneHalfWidth: n('zone.halfWidthYd'), zoneHalfDepth: n('zone.halfDepthYd'), boxHalfWidth: n('box.halfWidthYd'), boxDepth: n('box.depthYd'),
    onLineDepth: n('front.onLineDepthYd'), headUp: n('front.headUpYd'), shade: n('front.shadeYd'), gap: n('front.gapYd'), walkedUpDepth: n('front.walkedUpDepthYd'), engageRange: n('front.engageRangeYd'),
    moveSpeed: n('read.moveSpeedYps'), deepDepth: n('safety.deepDepthYd'), pocketHalfWidth: n('pocket.halfWidthYd'), scrambleSpeed: n('qb.scrambleSpeedYps'), ballArea: n('ball.areaRadiusYd'), eyesConeCos: n('eyes.coneCos'),
    bunchWidth: n('bunch.widthYd'), backfieldDepth: n('backfield.depthYd'), trailOffset: n('trail.offsetYd'), offLeadS: n('trail.offLeadS'), offCushion: n('trail.offCushionYd'), deepZoneHalfWidth: n('deepZone.halfWidthYd'), shoulderOffset: n('shoulder.offsetYd'), containWidth: n('contain.widthYd'),
    rushTrackOffset: n('rush.trackOffsetYd'), spyDepth: n('spy.depthYd'), passSetDepth: n('passSet.depthYd'), passSetPocketDepth: n('passSet.pocketDepthYd'), passSetMirrorGap: n('passSet.mirrorGapYd'), comboHoldS: n('combo.holdS'), chipHoldS: n('chip.holdS'),
    scanRange: n('scan.rangeYd'), climbMinDepth: n('climb.minDepthYd'), pursueLeadS: n('pursue.leadS'), pursueMaxLeadS: n('pursue.maxLeadS'), pursueAnticipateS: n('pursue.anticipateS'), pursueAttackYd: n('pursue.attackYd'), pursueCutback: n('pursue.cutbackYd'), kickClearance: n('kick.clearanceYd'),
    secureEffort: n('secure.effort'), sidelineRun: n('sideline.runYd'), sidelineRoom: n('route.sidelineRoomYd'),
  };
}
