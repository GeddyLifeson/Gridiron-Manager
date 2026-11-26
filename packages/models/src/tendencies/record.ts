// From the game's play records (P3.3.1) to charted plays (N2.3.1 rule 1). This is the own-team view:
// the call fields are the true calls. Opponents' rows go through `chartOpponent` (charting.ts) after this.
import type { FieldGeometry, PlayRecord, Side } from '@gm/schema';
import { param } from './params.ts';
import type { AfterEvent, ChartedPlay, ChartSide, Hash } from './types.ts';

export interface GameChartContext {
  readonly teamIds: readonly [number, number];
  readonly gameOrder: number;
  readonly season: number;
  readonly geometry: FieldGeometry;
  /** Play caller of each team on each side, by team side index; null when unknown. */
  readonly callers?: { readonly offense: readonly [number | null, number | null]; readonly defense: readonly [number | null, number | null] };
  /** N2.2.3 coaching success shares (from `ep.defaultDefinitions()` or the user's choice). */
  readonly success: { readonly firstDownShare: number; readonly secondDownShare: number; readonly lateDownShare: number };
}

/** Offense's left or right hash, or the middle (between the inbounds lines). */
export function hashOf(ballY: number, attackDir: 1 | -1, g: FieldGeometry): Hash {
  const tol = param('chart.hashToleranceYd');
  const onSouth = ballY - g.hashSouthY <= tol && g.hashSouthY - ballY <= tol;
  const onNorth = ballY - g.hashNorthY <= tol && g.hashNorthY - ballY <= tol;
  if (!onSouth && !onNorth && ballY > g.hashSouthY && ballY < g.hashNorthY) return 'middle';
  // The offense's left is +y when it attacks east (+x), -y when it attacks west (J1.1.2).
  const north = ballY > g.centreY;
  return (north ? 1 : -1) * attackDir > 0 ? 'left' : 'right';
}

function yardsToGoal(ballX: number, dir: 1 | -1, g: FieldGeometry): number {
  return dir === 1 ? g.goalLineEastX - ballX : ballX - g.goalLineWestX;
}

function successOf(down: number, dist: number, yards: number, s: GameChartContext['success']): boolean {
  const share = down === 1 ? s.firstDownShare : down === 2 ? s.secondDownShare : s.lateDownShare;
  return yards >= share * dist;
}

function afterEventOf(prev: PlayRecord | null, cur: PlayRecord, snapping: Side): AfterEvent {
  if (!prev) return 'first_play';
  // A timeout answer logged around the previous play or before this snap (J11.6.1 decisions feed).
  if (cur.decisions.some((d) => d.type === 'timeout') || prev.decisions.some((d) => d.type === 'timeout')) return 'timeout';
  const f = prev.final;
  if (f.changeOfPossession && f.possessionAfter === snapping && f.snappingSide !== snapping && prev.situation.playKind === 'scrimmage') return 'turnover';
  if (f.snappingSide === snapping && f.resultType === 'sack') return 'sack';
  if (prev.seriesAfter.firstDownAwarded && f.enforcement !== null && f.enforcement.enforced.length > 0 && f.snappingSide === snapping) return 'penalty_first_down';
  return 'none';
}

/**
 * Chart one team's scrimmage plays in one game, on one side or both. Kicks and tries are not tendency
 * rows. Records must be in play order.
 */
export function chartGame(records: readonly PlayRecord[], teamSide: Side, ctx: GameChartContext, sides: readonly ChartSide[] = ['offense', 'defense']): ChartedPlay[] {
  const out: ChartedPlay[] = [];
  let prevScrimmage: PlayRecord | null = null;
  for (const r of records) {
    const s = r.situation;
    if (s.playKind !== 'scrimmage' || s.down === null || s.distanceYd === null) continue;
    const snap = r.calls.snapping;
    const opp = r.calls.opposing;
    if (snap.unit !== 'offense') { prevScrimmage = r; continue; }
    const side: ChartSide = s.offense === teamSide ? 'offense' : 'defense';
    if (!sides.includes(side)) { prevScrimmage = r; continue; }
    const other: Side = teamSide === 0 ? 1 : 0;
    const def = opp.unit === 'defense' ? opp : null;
    const yards = r.final.yardsGained;
    const forced = snap.kind === 'kneel' || snap.kind === 'spike';
    const lookOnly = r.final.noPlay || r.final.resultType === 'no_play';
    const callers = ctx.callers ? (side === 'offense' ? ctx.callers.offense : ctx.callers.defense) : null;
    out.push({
      ref: `${r.gameId}:${r.index}`,
      gameId: r.gameId, gameOrder: ctx.gameOrder, season: ctx.season, index: r.index,
      teamId: ctx.teamIds[teamSide], opponentId: ctx.teamIds[other], side,
      callerId: callers ? callers[teamSide] : null,
      source: 'own',
      down: s.down, distanceYd: s.distanceYd,
      yardsToGoalYd: yardsToGoal(s.ballX, s.attackDir, ctx.geometry),
      hash: hashOf(s.ballY, s.attackDir, ctx.geometry),
      quarter: s.period, clockTenths: s.clockTenths,
      scoreDiff: s.score[teamSide] - s.score[other],
      afterEvent: afterEventOf(prevScrimmage, r, s.offense),
      personnel: snap.personnelCode, formation: snap.formationId, strength: snap.strength, motion: snap.motionId,
      shotgun: snap.shotgun, tempo: snap.tempo,
      playKind: snap.kind, runDirection: snap.runDirection, concept: snap.playContentId, protection: snap.protectionId,
      front: def ? def.frontId : null, rushers: def ? def.rushers : null, boxCount: def ? def.boxCount : null,
      coverageFamily: def ? def.coverageFamily : null, pressureDesign: def ? def.pressureId : null,
      yards, success: lookOnly || forced ? null : successOf(s.down, s.distanceYd, yards, ctx.success),
      forced, lookOnly,
    });
    prevScrimmage = r;
  }
  return out;
}
