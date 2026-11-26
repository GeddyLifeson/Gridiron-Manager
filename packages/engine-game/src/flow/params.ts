// Game flow (J11): the rule keys this module reads, its tuning constants, and the option ids it
// puts on decision requests. No rule value and no real-world number is written anywhere else in
// this folder: a rule value is read from the rule set by key, a tuning constant from the parameter
// table by name.
import type { Contract } from '@gm/engine-core';

export const FLOW_VERSION = 'flow 1';

/** Rule keys read directly by the game flow. Every other rule value reaches it through the officiating facade. */
export const RULE_KEYS: Contract.RuleKeyManifest = [
  { key: 'clock.periods', type: 'number', unit: 'count', meaning: 'Regulation periods; a period beyond this count is overtime', ownerLeaf: 'B1.1.1', readBy: ['engine-game.flow'] },
  { key: 'clock.period_length_s', type: 'number', unit: 's', meaning: 'Length of a regulation period', ownerLeaf: 'B1.1.1', readBy: ['engine-game.flow'] },
  { key: 'timeout.per_half', type: 'number', unit: 'count', meaning: 'Charged timeouts per team per half', ownerLeaf: 'B1.4.1', readBy: ['engine-game.flow'] },
  { key: 'timeout.length_seconds', type: 'number', unit: 's', meaning: 'Length of a charged team timeout (B13.1.2 names the key; it has no value yet)', ownerLeaf: 'B1.4.1', readBy: ['engine-game.flow'] },
  { key: 'challenge.needs_available_timeout', type: 'boolean', meaning: 'A team with no timeouts left may not challenge; its flag is then offered as a refused throw', ownerLeaf: 'B9.1.1', readBy: ['engine-game.flow'] },
  { key: 'series.downs', type: 'number', unit: 'count', meaning: 'Downs in a series; the last one sets the default kicking call and the state invariant', ownerLeaf: 'B3.1.1', readBy: ['engine-game.flow'] },
  { key: 'substitution.max_players', type: 'number', unit: 'count', meaning: 'Players a team may field; size of the default lineup', ownerLeaf: 'B2', readBy: ['engine-game.flow'] },
  { key: 'overtime.period_length_s', type: 'number', unit: 's', meaning: 'Length of an overtime period; 0 means overtime has no game clock (requested key, see the WP-06 report)', ownerLeaf: 'B10.2.1', readBy: ['engine-game.flow'] },
];

const P = (name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string): Contract.TuningParam =>
  ({ name: `flow.${name}`, value, min, max, unit, belongsTo: 'engine-game.flow', basis, leaf, constrainedBy, status: 'starting' });

/** Tuning constants of the game flow (D-09). Clock values are integer tenths of a second. */
export const PARAMS: Contract.ParamFile = {
  module: 'engine-game.flow',
  version: '1',
  params: [
    P('spottingMinTenths', 30, 0, 100, 'tenths_s', 'bible', 'J11.4.2', 'J15.3.2 elapsed time per play'),
    P('spottingMaxTenths', 60, 0, 200, 'tenths_s', 'bible', 'J11.4.2', 'J15.3.2 elapsed time per play'),
    P('spottingPerYardTenths', 1, 0, 5, 'tenths_s_per_yd', 'assumption', 'J11.4.2', 'J15.3.2 elapsed time per play'),
    P('spottingStoppageExtraTenths', 20, 0, 100, 'tenths_s', 'assumption', 'J11.4.2', 'J15.3.2 elapsed time per play'),
    // Between plays (I2.1.1, J5.8.1). The three `preSnap*` values are the time from the accepted call until the
    // offense is set and can snap (relay, huddle, break, align, set, cadence). The offense then snaps at its tempo's
    // target: a huddle offense at a play-clock value, a no-huddle or hurry-up offense after a wait. Fitted to the
    // snap-to-snap game-clock gaps of nflverse 2022 to 2024 (flow/pace-facts.json); every value is a starting value.
    P('preSnapHuddleTenths', 190, 0, 400, 'tenths_s', 'assumption', 'I2.1.1', 'pace.snapToSnap.inBounds.huddle'),
    P('preSnapNoHuddleTenths', 125, 0, 400, 'tenths_s', 'assumption', 'I2.1.1', 'pace.snapToSnap.inBounds.noHuddle'),
    P('preSnapHurryUpTenths', 105, 0, 400, 'tenths_s', 'assumption', 'I2.1.1', 'pace.snapToSnap.inBounds.hurryUp'),
    P('preSnapSpreadShare', 0.3, 0, 1, 'share', 'assumption', 'I2.1.1', 'pace.snapToSnap.inBounds.hurryUp'),
    P('snapTargetHuddleFloorTenths', 10, 0, 400, 'tenths_s', 'assumption', 'J5.8.1', 'pace.snapToSnap.inBounds.huddle'),
    P('snapTargetHuddleMeanTenths', 47, 0, 400, 'tenths_s', 'assumption', 'J5.8.1', 'pace.snapToSnap.inBounds.huddle'),
    P('snapWaitNoHuddleMeanTenths', 85, 0, 400, 'tenths_s', 'assumption', 'J5.8.1', 'pace.snapToSnap.inBounds.noHuddle'),
    P('snapWaitHurryUpMeanTenths', 25, 0, 400, 'tenths_s', 'assumption', 'J5.8.1', 'pace.snapToSnap.inBounds.hurryUp'),
    P('snapLatestPlayClockTenths', 10, 0, 400, 'tenths_s', 'assumption', 'J5.8.1', 'J15.7.1 delay of game'),
    P('kickRestartPreSnapTenths', 50, 0, 400, 'tenths_s', 'assumption', 'J11.7.1', 'J15.3.2 elapsed time per play'),
    P('callDeadlinePlayClockTenths', 150, 0, 400, 'tenths_s', 'assumption', 'J11.6.1', 'J15.3.2 elapsed time per play'),
    P('penaltyDecisionWindowTenths', 150, 0, 600, 'tenths_s', 'bible', 'J11.6.1', 'Q1.2.2 game completes with no answers'),
    P('fixedDecisionWindowTenths', 150, 0, 600, 'tenths_s', 'assumption', 'J11.6.1', 'Q1.2.2 game completes with no answers'),
    P('officialTimeoutTenths', 1200, 0, 3000, 'tenths_s', 'assumption', 'J11.2.1', 'J11.1.1 simulated elapsed time'),
    P('injuryTimeoutTenths', 900, 0, 3000, 'tenths_s', 'assumption', 'J11.2.1', 'J11.1.1 simulated elapsed time'),
    P('defaultFieldGoalMaxYardsToGoal', 35, 0, 60, 'yd', 'assumption', 'J11.6.1', 'J15.6.1 field goal attempts'),
    P('defaultRushers', 4, 0, 11, 'count', 'assumption', 'J11.6.1', 'J15.4.2 rusher count'),
    P('defaultBoxCount', 7, 0, 11, 'count', 'assumption', 'J11.6.1', 'J15.5.1 box count'),
    P('maxPlays', 1000, 100, 5000, 'count', 'assumption', 'J11.2.1', 'J15.2.1 plays per game (engine fault guard, far above it)'),
  ],
};

/** Parameter names, so a misspelling is a compile error. */
export type FlowParam =
  | 'spottingMinTenths' | 'spottingMaxTenths' | 'spottingPerYardTenths' | 'spottingStoppageExtraTenths'
  | 'preSnapHuddleTenths' | 'preSnapNoHuddleTenths' | 'preSnapHurryUpTenths' | 'preSnapSpreadShare' | 'snapTargetHuddleFloorTenths'
  | 'snapTargetHuddleMeanTenths' | 'snapWaitNoHuddleMeanTenths' | 'snapWaitHurryUpMeanTenths' | 'snapLatestPlayClockTenths' | 'kickRestartPreSnapTenths'
  | 'callDeadlinePlayClockTenths' | 'penaltyDecisionWindowTenths' | 'fixedDecisionWindowTenths'
  | 'officialTimeoutTenths' | 'injuryTimeoutTenths' | 'defaultFieldGoalMaxYardsToGoal' | 'defaultRushers'
  | 'defaultBoxCount' | 'maxPlays';

export function flowParam(src: Contract.NumberSources, name: FlowParam): number {
  return src.params.num(`flow.${name}`);
}

/**
 * Option ids of the requests the flow builds itself. Toss ids are the vocabulary the flow can turn
 * into a kicker and a direction; ids from `RestartRules.tossOptions` outside it are not offered.
 */
export const OPT = {
  heads: 'heads', tails: 'tails',
  receive: 'receive', kick: 'kick', defer: 'defer', defendWest: 'defend_west', defendEast: 'defend_east',
  offense: 'offense', defense: 'defense',
  none: 'none', timeout: 'timeout',
  /** A challenge flag thrown when the coach may not challenge: no review, and a timeout or a foul (B9.1.1 rules 4a and 5). */
  challengeFlag: 'challenge_flag',
  tryKick: 'kick', tryTwo: 'two_point',
  runoffTake: 'take_runoff', runoffDecline: 'decline_runoff', runoffAccept: 'accept_runoff', runoffTimeout: 'spend_timeout',
} as const;

/** Default content of a call nobody made. Labels, not football numbers; the counts beside them are parameters. */
export const DEFAULT_CALL = { personnelCode: '11', coverageFamily: 'cover3' } as const;

/** Tenths of a second in one second: the clock unit of J11.1.1, not a football number. */
export const TENTHS_PER_S = 10;
