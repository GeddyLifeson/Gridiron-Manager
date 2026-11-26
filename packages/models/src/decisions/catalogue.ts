// Decision types (N3.2.1 game day, N3.2.2 weekly and program). The catalogue decides nothing: it names
// every logged type, its owner leaf, and which model's view it gets (N3.3).

/** Which part of N3.3 scores the type. */
export type ViewKind = 'game_management' | 'play_call' | 'none';

export interface DecisionTypeDef {
  readonly type: string;
  readonly scope: 'game' | 'week';
  /** Owner leaves that emit it (N3.2.1 "Owner" column; N3.2.2 parentheses). */
  readonly owners: readonly string[];
  readonly view: ViewKind;
  /** Decisions "not made" of this type are logged at moments the owner flags (N3.2.1). */
  readonly flaggedNotMade: boolean;
  readonly note: string;
}

function g(type: string, owners: string[], view: ViewKind, note: string, flaggedNotMade = false): DecisionTypeDef {
  return { type, scope: 'game', owners, view, flaggedNotMade, note };
}
function w(type: string, owners: string[], view: ViewKind, note: string): DecisionTypeDef {
  return { type, scope: 'week', owners, view, flaggedNotMade: false, note };
}

/**
 * N3.2.1. View choices: N3.3.1 names fourth downs, tries, timeouts, challenges, penalties and kicks as
 * game-management decisions with an objective estimate; N3.3.2 covers play calls. The defensive call is
 * the mirror of the offensive call (I3) and is scored the same way. The coin toss choice is a
 * game-management choice (receive, defer, goal) the WP model can value. Clock mode choices (kneel, spike,
 * runoff) change the state the WP model reads, so they are scored like timeouts. The rest have no model.
 */
export const GAME_DECISION_TYPES: readonly DecisionTypeDef[] = [
  g('coin_toss_choice', ['I1'], 'game_management', 'receive, defer, goal'),
  g('inactives', ['I1'], 'none', 'the list'),
  g('offensive_play_call', ['I2'], 'play_call', 'the I2.7.1 record'),
  g('defensive_call', ['I3'], 'play_call', 'personnel match, front, pressure, coverage'),
  g('fourth_down', ['I5'], 'game_management', 'go, punt, field goal, with the play if go'),
  g('try', ['I5'], 'game_management', 'one or two'),
  g('kickoff_onside', ['I4'], 'game_management', 'kick type, declared onside'),
  g('punt_return_instructions', ['I4'], 'game_management', 'type, fair catch rule'),
  g('field_goal_attempt', ['I4'], 'game_management', 'distance, conditions'),
  g('timeout', ['I5'], 'game_management', 'used, or the choice not to use at a flagged moment', true),
  g('challenge', ['I5'], 'game_management', 'thrown or not at a flagged reviewable play', true),
  g('penalty_acceptance', ['I5'], 'game_management', 'accept or decline'),
  g('clock_mode', ['I5'], 'game_management', 'tempo, kneel, spike, runoff choices'),
  g('substitution_override', ['I6'], 'none', 'pulling or keeping a player against the plan'),
  g('medical_limit_override', ['I6', 'H5'], 'none', 'playing a player past advice'),
  g('adjustment', ['I8'], 'none', 'what was changed between series or at halftime'),
  g('delegation_change', ['I2.6.2'], 'none', 'who calls'),
];

/** N3.2.2. None of these has a model at the time (N3.3.3); each gets follow-up checks. */
export const WEEK_DECISION_TYPES: readonly DecisionTypeDef[] = [
  w('rule_breaking_act', ['L8.2.5'], 'none', 'confirmed through the L8.2.5 warning; linked to its violation_log row'),
  w('week_template_change', ['H1.4.1'], 'none', 'week template changes'),
  w('travel_plan', ['H8.1.1'], 'none', 'travel plans'),
  w('media_stance', ['H7.2.1'], 'none', 'media stances'),
  w('injury_report_filing', ['H5.2'], 'none', 'injury report filings'),
  w('game_plan_contents', ['G6'], 'none', 'what was put in and left out; by snapshot id'),
  w('call_sheet_layout', ['G7'], 'none', 'call sheet layout; by snapshot id'),
  w('practice_plan', ['H3'], 'none', 'practice plan and rep allocation'),
  w('padded_practice_use', ['C11'], 'none', 'padded-practice use'),
  w('injured_player_status', ['H5'], 'none', 'game status and playing-time decisions on injured players'),
  w('depth_chart_change', ['M2'], 'none', 'depth chart changes'),
  w('position_battle', ['M2.5'], 'none', 'position battle decisions'),
  w('roster_move', ['H6', 'M1.5.1', 'M6.4'], 'none', 'roster moves and memos'),
  w('discipline_action', ['L3'], 'none', 'discipline actions'),
  w('promise', ['L1'], 'none', 'promises'),
  w('staff_hire_fire', ['L4'], 'none', 'staff hires and firings'),
  w('time_allocation', ['E7'], 'none', 'time allocation for the week'),
  w('recruiting_offer_visit', ['T4'], 'none', 'recruiting offers and visits'),
];

export const DECISION_TYPES: readonly DecisionTypeDef[] = [...GAME_DECISION_TYPES, ...WEEK_DECISION_TYPES];

const BY_TYPE = new Map(DECISION_TYPES.map((d) => [d.type, d]));

export function decisionType(type: string): DecisionTypeDef {
  const d = BY_TYPE.get(type);
  if (!d) throw new Error(`unknown decision type ${type} (N3.2)`);
  return d;
}

export function isDecisionType(type: string): boolean {
  return BY_TYPE.has(type);
}
