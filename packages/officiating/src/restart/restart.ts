// Restart rules (contract: RestartRules, WP-03): the coin toss and its choices (B1.1.2, B10.1.1,
// B13.7.1), free kick spots and lines (B6.1.1, B6.1.2, B6.2.1), the try spot (B7.3.1, B13.6.3), what
// follows each score (B7.8.1, J11.7.1) and the fair catch kick spot (B6.4.3).
// Every yard line, clock value and switch is a rule key (params.ts). No level is ever tested.
import {
  TICKS_PER_SECOND, otherSide, xAtYardsToGoal, yardsFromOwnGoal, yardsToGoal,
  type AttackDir, type FieldGeometry, type GameState, type NumberSources, type RestartRules, type RestartSetup,
  type RulingContext, type ScoreEvent, type Side, type StreamSource,
} from '@gm/schema';
import { FORMAT_DYNAMIC, KEY, OT_ALTERNATING } from './params.ts';

/** Toss option ids. Goals are named by the field frame of J1.1.1: the goal lines are west and east. */
export const TOSS = {
  defer: 'defer',
  receive: 'receive',
  kick: 'kick',
  offense: 'offense',
  defense: 'defense',
  defendWest: 'defend_west',
  defendEast: 'defend_east',
} as const;

export type TossKind = 'opening' | 'overtime';

/** What one toss decides for the half or overtime period it governs. */
export interface TossOutcome {
  /** Team that receives the kickoff, or that has the ball first in an overtime of alternating series. */
  readonly receiving: Side;
  /** Direction each team attacks, indexed by Side. */
  readonly attackDir: readonly [AttackDir, AttackDir];
}

/** Lines and zones of a free kick as field x (B6.1.2 table, B6.2.1 items 2 and 4). */
export interface FreeKickLines {
  readonly kickLineX: number;
  /** Where the kicking team's other ten players line up. */
  readonly kickingTeamLineX: number;
  readonly receivingLineX: number;
  /** Back of the setup zone; equal to `receivingLineX` where there is none. */
  readonly setupZoneBackX: number;
  /** Front of the landing zone, or null on a ten-yard kick. */
  readonly landingZoneFrontX: number | null;
}

/** The restart rules with the extras the contract's RestartRules has no room for (see the WP-03 report). */
export interface RestartRulesX extends RestartRules {
  /** The fair draw of B1.1.2 rule 8: stream `toss`, scope [game, tossIndex]. */
  tossWinner(streams: StreamSource, gameId: number, tossIndex: number): Side;
  /** Options left to the other captain after the first choice (B1.1.2 rule 3). */
  remainingTossOptions(kind: TossKind, firstChoiceId: string, src: NumberSources): readonly string[];
  /**
   * Resolves the two choices that govern one half or one overtime period. `first` is the captain who
   * chose first. A choice that is not legal falls back to the first legal option, as a captain who says
   * nothing is given one. `defer` is not resolved here: the other captain becomes `first`.
   */
  resolveToss(kind: TossKind, first: Side, firstChoiceId: string, otherChoiceId: string, src: NumberSources): TossOutcome;
  /** Who has first choice for the second half (B1.1.2 rule 4). */
  secondHalfFirstChoice(winner: Side, winnerChoiceId: string): Side;
  /** The fair catch kick from the spot of the catch (B6.4.3 items 1 and 6), or null where the rule set has none. */
  fairCatchKickSetup(side: Side, spotX: number, spotY: number, ctx: RulingContext): RestartSetup | null;
  /** Restraining lines and zones for a free kick from `kickX` by `kicking`. */
  freeKickLines(kicking: Side, kickX: number, onside: boolean, ctx: RulingContext): FreeKickLines;
}

const GOALS: readonly string[] = [TOSS.defendWest, TOSS.defendEast];

function possessionChoices(kind: TossKind, src: NumberSources): readonly string[] {
  return kind === 'overtime' && src.rules.opt(KEY.overtimeFormat) === OT_ALTERNATING ? [TOSS.offense, TOSS.defense] : [TOSS.receive, TOSS.kick];
}

function tossOptions(kind: TossKind, src: NumberSources): readonly string[] {
  const defer = src.rules.bool(kind === 'opening' ? KEY.deferAllowed : KEY.overtimeDeferAllowed);
  return [...(defer ? [TOSS.defer] : []), ...possessionChoices(kind, src), ...GOALS];
}

function remainingTossOptions(kind: TossKind, firstChoiceId: string, src: NumberSources): readonly string[] {
  if (firstChoiceId === TOSS.defer) return [...possessionChoices(kind, src), ...GOALS];
  return GOALS.includes(firstChoiceId) ? possessionChoices(kind, src) : GOALS;
}

function resolveToss(kind: TossKind, first: Side, firstChoiceId: string, otherChoiceId: string, src: NumberSources): TossOutcome {
  const legalFirst = [...possessionChoices(kind, src), ...GOALS];
  const a = legalFirst.includes(firstChoiceId) ? firstChoiceId : legalFirst[0]!;
  const legalOther = remainingTossOptions(kind, a, src);
  const b = legalOther.includes(otherChoiceId) ? otherChoiceId : legalOther[0]!;
  const other = otherSide(first);
  const [goal, goalChooser] = GOALS.includes(a) ? [a, first] : [b, other];
  const [privilege, privilegeChooser] = GOALS.includes(a) ? [b, other] : [a, first];
  const receiving = privilege === TOSS.receive || privilege === TOSS.offense ? privilegeChooser : otherSide(privilegeChooser);
  // Defending the west goal means attacking east.
  const chooserDir: AttackDir = goal === TOSS.defendWest ? 1 : -1;
  const otherDir: AttackDir = chooserDir === 1 ? -1 : 1;
  const attackDir: [AttackDir, AttackDir] = goalChooser === 0 ? [chooserDir, otherDir] : [otherDir, chooserDir];
  return { receiving, attackDir };
}

function tenths(seconds: number): number { return seconds * TICKS_PER_SECOND; }

/** Field x of a yard line of `team` (yards from its own goal line). */
function ownYardline(g: FieldGeometry, team: Side, dirs: readonly [AttackDir, AttackDir], yd: number): number {
  const dir = dirs[team];
  return xAtYardsToGoal(g, yd, dir === 1 ? -1 : 1);
}

/**
 * Yards of a carried penalty (B8.5.7) to walk from `x`, signed along `dir` (the direction of the team
 * that will snap or kick): against that team it moves the ball back, against the opponent forward.
 * Half the distance to the offender's goal line is the most it can be (B8.5.3).
 */
function carried(state: GameState, to: 'try' | 'kickoff', side: Side, x: number, dir: AttackDir, g: FieldGeometry, src: NumberSources): number {
  const p = state.carriedPenalty;
  if (!p || p.to !== to || p.yards <= 0) return 0;
  const againstUs = p.against === side;
  const toOffenderGoal = againstUs ? yardsFromOwnGoal(g, x, dir) : yardsToGoal(g, x, dir);
  const limit = toOffenderGoal * src.rules.num(KEY.halfDistanceFraction);
  const yards = p.yards > limit ? limit : p.yards;
  return againstUs ? -yards : yards;
}

function trySetupIn(state: GameState, side: Side, choice: 'kick' | 'two_point', ctx: RulingContext): RestartSetup {
  const dir = state.attackDir[side];
  const base = xAtYardsToGoal(ctx.geometry, ctx.rules.num(choice === 'kick' ? KEY.tryKickSnap : KEY.tryTwoSnap), dir);
  const walk = carried(state, 'try', side, base, dir, ctx.geometry, ctx);
  return { playKind: 'try', side, ballX: base + walk * dir, ballY: ctx.geometry.centreY, playClockTenths: tenths(ctx.rules.num(KEY.playClock)) };
}

function kickoffSetupIn(state: GameState, kicking: Side, kind: 'kickoff' | 'safety_kick', ctx: RulingContext): RestartSetup {
  const dir = state.attackDir[kicking];
  const base = ownYardline(ctx.geometry, kicking, state.attackDir, ctx.rules.num(kind === 'kickoff' ? KEY.kickYardline : KEY.safetyKickYardline));
  const walk = carried(state, 'kickoff', kicking, base, dir, ctx.geometry, ctx);
  return { playKind: kind, side: kicking, ballX: base + walk * dir, ballY: ctx.geometry.centreY, playClockTenths: tenths(ctx.rules.num(KEY.playClockStoppage)) };
}

/** B7.8.1: what follows each score. */
function afterScore(score: ScoreEvent, state: GameState, ctx: RulingContext): RestartSetup {
  switch (score.type) {
    case 'touchdown':
      // The try by the scoring team. The spot is for a kick until the coach chooses (`trySetup`).
      return trySetupIn(state, score.side, 'kick', ctx);
    case 'field_goal':
      return kickoffSetupIn(state, score.side, 'kickoff', ctx);
    case 'safety':
      return kickoffSetupIn(state, otherSide(score.side), 'safety_kick', ctx);
    default: {
      // Any score on a try: the team on defense during the try receives, whoever scored.
      const offenseOnTry = ctx.situation.playKind === 'try' ? ctx.situation.offense : (score.type === 'defensive_try' ? otherSide(score.side) : score.side);
      return kickoffSetupIn(state, offenseOnTry, 'kickoff', ctx);
    }
  }
}

function fairCatchKickSetup(side: Side, spotX: number, spotY: number, ctx: RulingContext): RestartSetup | null {
  if (!ctx.rules.bool(KEY.fairCatchKick)) return null;
  const g = ctx.geometry;
  // B6.4.3 item 6: a catch outside the inbounds line is kicked from the nearest inbounds line.
  const y = spotY < g.hashSouthY ? g.hashSouthY : spotY > g.hashNorthY ? g.hashNorthY : spotY;
  return { playKind: 'fair_catch_kick', side, ballX: spotX, ballY: y, playClockTenths: tenths(ctx.rules.num(KEY.playClockStoppage)) };
}

function freeKickLines(kicking: Side, kickX: number, onside: boolean, ctx: RulingContext): FreeKickLines {
  const r = ctx.rules;
  const dirs = ctx.before.attackDir;
  const dir = dirs[kicking];
  const receivers = otherSide(kicking);
  if (!onside && r.opt(KEY.format) === FORMAT_DYNAMIC) {
    // B6.1.2: fixed yard lines of the receiving team; only the kicker's line moves with a penalty.
    const at = (key: string): number => ownYardline(ctx.geometry, receivers, dirs, r.num(key));
    return { kickLineX: kickX, kickingTeamLineX: at(KEY.kickingTeamLine), receivingLineX: at(KEY.receivingLine),
      setupZoneBackX: at(KEY.setupZoneBack), landingZoneFrontX: at(KEY.landingZone) };
  }
  const receivingLineX = kickX + r.num(KEY.onsideMinDistance) * dir;
  return { kickLineX: kickX, kickingTeamLineX: kickX, receivingLineX,
    setupZoneBackX: receivingLineX + r.num(KEY.onsideSetupDepth) * dir, landingZoneFrontX: null };
}

export function createRestartRules(): RestartRulesX {
  return {
    tossOptions,
    remainingTossOptions,
    resolveToss,
    tossWinner(streams: StreamSource, gameId: number, tossIndex: number): Side {
      return streams('toss', [gameId, tossIndex]).int(0, 1) === 0 ? 0 : 1;
    },
    secondHalfFirstChoice(winner: Side, winnerChoiceId: string): Side {
      return winnerChoiceId === TOSS.defer ? winner : otherSide(winner);
    },
    afterScore,
    trySetup(side: Side, choice: 'kick' | 'two_point', ctx: RulingContext): RestartSetup { return trySetupIn(ctx.before, side, choice, ctx); },
    kickoffSetup(kicking: Side, kind: 'kickoff' | 'safety_kick', ctx: RulingContext): RestartSetup { return kickoffSetupIn(ctx.before, kicking, kind, ctx); },
    fairCatchKickSetup,
    freeKickLines,
  };
}
