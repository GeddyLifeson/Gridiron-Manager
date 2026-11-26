// The coin toss as data (B1.1.2, B10.1.1) and the calls the flow makes for a coach who did not
// answer (J11.6.1: every request has a default, so a game completes with no answers).
import type { Contract } from '@gm/engine-core';
import { DEFAULT_CALL, OPT, flowParam } from './params.ts';
import { isFreeKick, other, type FlowEnv, type GameState, type Side } from './situation.ts';

const POSSESSION_IDS: readonly string[] = [OPT.receive, OPT.kick, OPT.offense, OPT.defense];
const GOAL_IDS: readonly string[] = [OPT.defendWest, OPT.defendEast];
const RECEIVE_IDS: readonly string[] = [OPT.receive, OPT.offense];
const KNOWN_TOSS_IDS: readonly string[] = [...POSSESSION_IDS, ...GOAL_IDS, OPT.defer];

/** The rule set's toss options the flow can act on. With none it offers the possession privilege alone. */
export function tossMenu(ids: readonly string[]): string[] {
  const known = ids.filter((id) => KNOWN_TOSS_IDS.includes(id));
  return known.length > 0 ? known : [OPT.receive, OPT.kick];
}

/** What the loser of the toss may choose after the winner's choice (B1.1.2 rule 3): the other privilege, or first choice after a deferral. */
export function loserMenu(menu: readonly string[], winnerChoice: string): string[] {
  if (winnerChoice === OPT.defer) return menu.filter((id) => id !== OPT.defer);
  if (POSSESSION_IDS.includes(winnerChoice)) return menu.filter((id) => GOAL_IDS.includes(id));
  return menu.filter((id) => POSSESSION_IDS.includes(id));
}

/** B1.1.2: most coaches defer, so the default is to defer where the rule set offers it, else the first option. */
export function defaultTossChoice(menu: readonly string[]): string {
  return menu.includes(OPT.defer) ? OPT.defer : menu[0]!;
}

export interface TossOutcome {
  /** Team that receives (or takes the ball first in overtime). */
  readonly receiver: Side;
  /** Team with first choice for the second half, which the flow takes as a choice to receive (B1.1.2 rule 4). */
  readonly secondHalfReceiver: Side;
  /** Direction per side when a goal was chosen, else null (directions stay as they are). */
  readonly attackDir: [Contract.AttackDir, Contract.AttackDir] | null;
}

/** Pure reading of a toss event. An unknown id counts as "receive", so a toss always has an outcome. */
export function tossOutcome(winner: Side, choiceId: string, loserChoiceId: string | null): TossOutcome {
  const loser = other(winner);
  const receives = (id: string) => RECEIVE_IDS.includes(id) || !KNOWN_TOSS_IDS.includes(id);
  let receiver: Side;
  if (POSSESSION_IDS.includes(choiceId) || !KNOWN_TOSS_IDS.includes(choiceId)) receiver = receives(choiceId) ? winner : loser;
  else if (loserChoiceId !== null && POSSESSION_IDS.includes(loserChoiceId)) receiver = receives(loserChoiceId) ? loser : winner;
  else receiver = choiceId === OPT.defer && loserChoiceId !== null && GOAL_IDS.includes(loserChoiceId) ? winner : loser;
  let attackDir: TossOutcome['attackDir'] = null;
  const goal = (side: Side, id: string | null) => {
    if (id === null || !GOAL_IDS.includes(id)) return;
    const dir: Contract.AttackDir = id === OPT.defendWest ? 1 : -1;
    attackDir = side === 0 ? [dir, dir === 1 ? -1 : 1] : [dir === 1 ? -1 : 1, dir];
  };
  goal(winner, choiceId);
  goal(loser, loserChoiceId);
  return { receiver, secondHalfReceiver: choiceId === OPT.defer ? winner : loser, attackDir };
}

/** Players a team sends out when nobody chose: the first available dressed players, up to the rule set's limit. */
export function defaultLineup(env: FlowEnv, team: Contract.SimTeam, state: GameState): Contract.FieldedPlayer[] {
  const max = env.rules.num('substitution.max_players');
  const bench = state.gameDay[team.side];
  const out: Contract.FieldedPlayer[] = [];
  for (const p of team.players) {
    if (out.length >= max) break;
    const day = bench[String(p.playerId)];
    if (day && (day.ejected || day.unavailable || day.requiredAbsenceDowns > 0)) continue;
    out.push({ playerId: p.playerId, role: p.position });
  }
  return out;
}

function kickKindFor(kind: Contract.PlayKind): Contract.KickKind {
  return kind === 'safety_kick' ? 'safety_kick' : kind === 'fair_catch_kick' ? 'fair_catch_kick' : kind === 'try' ? 'try_kick' : 'kickoff';
}

/**
 * The conservative call for the team that snaps or kicks (J11.6.1): the kicking unit on a free kick
 * and on a try, the punt or field goal unit on the last down of a series, a run otherwise.
 */
export function defaultSnappingCall(env: FlowEnv, situation: Contract.GameSituation, players: Contract.FieldedPlayer[]): Contract.SnappingCall {
  const kick = (kickKind: Contract.KickKind): Contract.KickCall => ({ unit: 'kick', kickKind, callContentId: null, contentHash: null, direction: null, players });
  if (isFreeKick(situation.playKind) || situation.playKind === 'try') return kick(kickKindFor(situation.playKind));
  if (situation.down !== null && situation.down >= env.rules.num('series.downs')) {
    const toGoal = (situation.attackDir === 1 ? env.geometry.goalLineEastX - situation.ballX : situation.ballX - env.geometry.goalLineWestX);
    return kick(toGoal <= flowParam(env, 'defaultFieldGoalMaxYardsToGoal') ? 'field_goal' : 'punt');
  }
  return {
    unit: 'offense', playContentId: null, contentHash: null, kind: 'run', personnelCode: DEFAULT_CALL.personnelCode, formationId: null,
    strength: null, motionId: null, protectionId: null, tags: [], runDirection: 'middle', shotgun: false, tempo: 'huddle', players,
  };
}

/** The default answer to a snapping call it has not seen: a return unit against a free kick, a base defense otherwise. */
export function defaultOpposingCall(env: FlowEnv, situation: Contract.GameSituation, players: Contract.FieldedPlayer[]): Contract.OpposingCall {
  if (isFreeKick(situation.playKind)) return { unit: 'return', returnKind: 'kick_return', callContentId: null, contentHash: null, players };
  return {
    unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null,
    coverageFamily: DEFAULT_CALL.coverageFamily, rushers: flowParam(env, 'defaultRushers'), boxCount: flowParam(env, 'defaultBoxCount'), players,
  };
}
