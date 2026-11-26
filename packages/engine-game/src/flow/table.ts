// The (phase, event) transition table of J11.2.1, as data. `apply` refuses any pair that has no row
// and any result phase the row does not list. Phase and event names are the contract's.
//
// Order inside one play, as built here (J11.2.1 marks the ruling, penalty and challenge order
// Unverified): play, replay (booth review or one coach's challenge), ruling of the reviewed play,
// penalty choice, then `play_resolved`. The play record is therefore final when it is logged, and
// statistics can read `play_resolved` events alone (J11.9.1).
import type { Contract } from '@gm/engine-core';

type Phase = Contract.GameFlowPhase;
type EventType = Contract.GameEvent['type'];

export interface TransitionRow {
  readonly phase: Phase;
  readonly event: EventType;
  /** Every phase the pair may lead to. */
  readonly to: readonly Phase[];
  readonly note: string;
}

const REST: readonly Phase[] = ['call_window', 'kickoff_setup'];

export const TRANSITION_TABLE: readonly TransitionRow[] = [
  { phase: 'pre_game', event: 'game_started', to: ['pre_game'], note: 'inactives locked, toss next' },
  { phase: 'pre_game', event: 'decision_requested', to: ['pre_game'], note: 'toss call and toss choices' },
  { phase: 'pre_game', event: 'decision_made', to: ['pre_game'], note: 'toss call and toss choices' },
  { phase: 'pre_game', event: 'deadline_missed', to: ['pre_game'], note: 'the default follows as a decision' },
  { phase: 'pre_game', event: 'toss', to: ['kickoff_setup'], note: 'kicker and directions set (B1.1.2)' },
  { phase: 'pre_game', event: 'environment_updated', to: ['pre_game'], note: 'weather fixed (J12)' },
  { phase: 'pre_game', event: 'substitution', to: ['pre_game'], note: 'inactives (I1)' },

  { phase: 'kickoff_setup', event: 'decision_requested', to: ['kickoff_setup'], note: 'kick call and return call' },
  { phase: 'kickoff_setup', event: 'decision_made', to: ['kickoff_setup'], note: 'kick call and return call' },
  { phase: 'kickoff_setup', event: 'deadline_missed', to: ['kickoff_setup'], note: 'the default follows as a decision' },
  { phase: 'kickoff_setup', event: 'clock_advanced', to: ['kickoff_setup', 'play'], note: 'intermission stays; lining up for the kick leads to the play' },
  { phase: 'kickoff_setup', event: 'timeout_charged', to: ['timeout'], note: 'charged timeout before a free kick' },
  { phase: 'kickoff_setup', event: 'substitution', to: ['kickoff_setup'], note: 'I6' },
  { phase: 'kickoff_setup', event: 'environment_updated', to: ['kickoff_setup'], note: 'quarter change (J12.2.2)' },

  { phase: 'call_window', event: 'decision_requested', to: ['call_window'], note: 'timeout, snapping call, opposing call' },
  { phase: 'call_window', event: 'decision_made', to: ['call_window', 'pre_snap'], note: 'the last call in leads to the pre-snap phase' },
  { phase: 'call_window', event: 'deadline_missed', to: ['call_window'], note: 'the default follows as a decision' },
  { phase: 'call_window', event: 'clock_advanced', to: ['call_window', 'period_end'], note: 'a running clock may expire before the snap' },
  { phase: 'call_window', event: 'timeout_charged', to: ['timeout'], note: 'charged team timeout' },
  { phase: 'call_window', event: 'substitution', to: ['call_window'], note: 'I6' },
  { phase: 'call_window', event: 'environment_updated', to: ['call_window'], note: 'quarter change (J12.2.2)' },

  { phase: 'pre_snap', event: 'clock_advanced', to: ['play', 'period_end'], note: 'J5 uses the play clock; a running clock may expire first' },
  { phase: 'pre_snap', event: 'substitution', to: ['pre_snap'], note: 'I6' },

  { phase: 'play', event: 'decision_requested', to: ['challenge_window', 'penalty_decision'], note: 'challenge or penalty choice' },
  { phase: 'play', event: 'review_resolved', to: ['ruling'], note: 'booth review (B9.1.2)' },
  { phase: 'play', event: 'play_resolved', to: ['dead_ball'], note: 'nothing to choose' },

  { phase: 'challenge_window', event: 'decision_made', to: ['review', 'ruling'], note: 'a challenge leads to review, none back to ruling' },
  { phase: 'challenge_window', event: 'deadline_missed', to: ['challenge_window'], note: 'the default follows as a decision' },

  { phase: 'review', event: 'review_resolved', to: ['ruling'], note: 'B9 resolved; the steps after it run again' },

  { phase: 'ruling', event: 'decision_requested', to: ['challenge_window', 'penalty_decision'], note: 'the other coach may challenge; penalty choice' },
  { phase: 'ruling', event: 'timeout_charged', to: ['ruling'], note: 'timeout charged for a lost challenge' },
  { phase: 'ruling', event: 'play_resolved', to: ['dead_ball'], note: 'nothing to choose' },

  { phase: 'penalty_decision', event: 'decision_made', to: ['penalty_decision'], note: 'accept, decline or choose (I5)' },
  { phase: 'penalty_decision', event: 'deadline_missed', to: ['penalty_decision'], note: 'the default follows as a decision' },
  { phase: 'penalty_decision', event: 'play_resolved', to: ['dead_ball'], note: 'the chosen outcome is final' },

  { phase: 'dead_ball', event: 'score_changed', to: ['dead_ball'], note: 'scoreboard; must agree with the play record' },
  { phase: 'dead_ball', event: 'drive_ended', to: ['dead_ball'], note: 'drive bookkeeping (J11.9.1)' },
  { phase: 'dead_ball', event: 'timeout_charged', to: ['dead_ball'], note: 'official stoppage, or a timeout spent to avoid a runoff' },
  { phase: 'dead_ball', event: 'decision_requested', to: ['dead_ball'], note: 'runoff options (B1.6.1)' },
  { phase: 'dead_ball', event: 'decision_made', to: ['dead_ball'], note: 'runoff options' },
  { phase: 'dead_ball', event: 'deadline_missed', to: ['dead_ball'], note: 'the default follows as a decision' },
  { phase: 'dead_ball', event: 'substitution', to: ['dead_ball'], note: 'substitution window (J11.5.1)' },
  { phase: 'dead_ball', event: 'clock_advanced', to: ['dead_ball', 'call_window', 'kickoff_setup', 'try_decision', 'period_end'], note: 'stoppage time stays; spotting leaves the dead ball' },
  { phase: 'dead_ball', event: 'period_ended', to: [...REST, 'overtime_toss'], note: 'an overtime period with no clock ends by the overtime rule' },
  { phase: 'dead_ball', event: 'game_final', to: ['final'], note: 'overtime decided' },

  { phase: 'try_decision', event: 'decision_requested', to: ['try_decision'], note: 'one or two (I5)' },
  { phase: 'try_decision', event: 'decision_made', to: ['call_window'], note: 'try spot set by the rule set' },
  { phase: 'try_decision', event: 'deadline_missed', to: ['try_decision'], note: 'the default follows as a decision' },

  { phase: 'timeout', event: 'clock_advanced', to: REST, note: 'timeout length, then back to the calls' },
  { phase: 'timeout', event: 'substitution', to: ['timeout'], note: 'I6' },

  { phase: 'period_end', event: 'drive_ended', to: ['period_end'], note: 'a half or the game ended the drive' },
  { phase: 'period_end', event: 'period_ended', to: [...REST, 'overtime_toss', 'period_end'], note: 'change of ends, halftime, overtime, or stay for the final event' },
  { phase: 'period_end', event: 'game_final', to: ['final'], note: 'result recorded' },

  { phase: 'overtime_toss', event: 'decision_requested', to: ['overtime_toss'], note: 'toss call and choices (B10.1.1)' },
  { phase: 'overtime_toss', event: 'decision_made', to: ['overtime_toss'], note: 'toss call and choices' },
  { phase: 'overtime_toss', event: 'deadline_missed', to: ['overtime_toss'], note: 'the default follows as a decision' },
  { phase: 'overtime_toss', event: 'clock_advanced', to: ['overtime_toss'], note: 'intermission before overtime' },
  { phase: 'overtime_toss', event: 'toss', to: REST, note: 'first possession set; the overtime rule gives the restart' },
];

/** Phases in which each decision type may be requested. */
export const REQUEST_PHASES: Readonly<Record<Contract.DecisionType, readonly Phase[]>> = {
  toss_call: ['pre_game', 'overtime_toss'],
  toss_choice: ['pre_game', 'overtime_toss'],
  overtime_choice: ['overtime_toss'],
  snapping_call: ['kickoff_setup', 'call_window'],
  opposing_call: ['kickoff_setup', 'call_window'],
  timeout: ['call_window'],
  challenge: ['play', 'ruling'],
  penalty_choice: ['play', 'ruling'],
  runoff_choice: ['dead_ball'],
  try_choice: ['try_decision'],
};

/** Phases from which `advance` can start with nothing but the state (J13.5.2 save points are among them). */
export const UNIT_START_PHASES: readonly Phase[] = ['pre_game', 'kickoff_setup', 'call_window', 'try_decision', 'period_end', 'overtime_toss', 'final'];

const INDEX = new Map<string, TransitionRow>(TRANSITION_TABLE.map((r) => [`${r.phase}|${r.event}`, r]));

export function transitionRow(phase: Phase, event: EventType): TransitionRow | undefined {
  return INDEX.get(`${phase}|${event}`);
}

/** Thrown by `apply` for a pair outside the table, or for an event its phase cannot take. */
export class FlowTransitionError extends Error {
  constructor(readonly phase: Phase, readonly event: EventType, detail: string) {
    super(`game flow: (${phase}, ${event}) ${detail}`);
  }
}
