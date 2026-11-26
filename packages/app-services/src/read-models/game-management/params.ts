// Tuning constants of the game management and sideline screens (G-61). No rule value lives here: play
// clock length, downs, timeouts, challenge counts and every legality answer come from the rule engine
// through the live game source (O2.4.1: legality is asked of the worker, never computed in the UI). The
// values below are starting values a bible leaf states, or named assumptions (DECISIONS.md A-G61-n).
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.game-management',
  version: 'g61.1',
  params: [
    {
      name: 'game_management.penalty_answer_s', value: 10, min: 1, max: 60, unit: 's', belongsTo: 'I5.1.1',
      basis: 'bible', leaf: 'I5.1.1', constrainedBy: 'I5.1.1 rule: penalty choices have 10 s (starting value) before the referee presses for an answer', status: 'starting',
    },
    {
      name: 'game_management.toss_answer_s', value: 10, min: 1, max: 60, unit: 's', belongsTo: 'I5.1.1',
      basis: 'assumption', leaf: 'I5.1.1', constrainedBy: 'A-G61-1: no leaf gives the toss or overtime toss answer time; the penalty time is reused', status: 'starting',
    },
    {
      name: 'game_management.clock_panel_window_s', value: 300, min: 0, max: 900, unit: 's', belongsTo: 'I5.4.1',
      basis: 'bible', leaf: 'I5.4.1', constrainedBy: 'I5.4.1: the arithmetic panel shows in the last five minutes of each half', status: 'starting',
    },
    {
      name: 'game_management.kneel_play_s', value: 2, min: 0, max: 10, unit: 's', belongsTo: 'I5.4.1',
      basis: 'bible', leaf: 'I5.4.1', constrainedBy: 'I5.4.1 burn estimate: about 2 to 6 s of play duration; a kneel-down is the short end', status: 'starting',
    },
    {
      name: 'game_management.snap_left_s', value: 2, min: 0, max: 10, unit: 's', belongsTo: 'I5.4.1',
      basis: 'assumption', leaf: 'I5.4.1', constrainedBy: 'A-G61-2: "less the time the snap itself is delayed" has no value; the offense is taken to snap with 2 s left', status: 'starting',
    },
    {
      name: 'game_management.booth_line_chars', value: 60, min: 20, max: 120, unit: 'count', belongsTo: 'O2.1.3',
      basis: 'bible', leaf: 'O2.1.3', constrainedBy: 'O2.1.3: one line of text, at most 60 characters', status: 'starting',
    },
    {
      name: 'game_management.message_list', value: 10, min: 1, max: 100, unit: 'count', belongsTo: 'O2.1.3',
      basis: 'bible', leaf: 'O2.1.3', constrainedBy: 'O2.1.3: a key opens the last ten messages', status: 'starting',
    },
    {
      name: 'game_management.guard_hold_s', value: 0.4, min: 0, max: 2, unit: 's', belongsTo: 'O2.5.3',
      basis: 'bible', leaf: 'O2.5.3', constrainedBy: 'O2.5.3: rare irreversible keys flash a 0.4 s hold-to-confirm', status: 'starting',
    },
    {
      name: 'game_management.guard_min_play_clock_s', value: 3, min: 0, max: 10, unit: 's', belongsTo: 'O2.5.3',
      basis: 'bible', leaf: 'O2.5.3', constrainedBy: 'O2.5.3: a guard never appears with under 3 s on the play clock', status: 'starting',
    },
    {
      name: 'game_management.late_timeout_window_s', value: 120, min: 0, max: 900, unit: 's', belongsTo: 'O2.5.3',
      basis: 'bible', leaf: 'O2.5.3', constrainedBy: 'O2.5.3: a timeout in the last two minutes is guarded', status: 'starting',
    },
  ],
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`game-management: unknown parameter ${name}`);
  return p.value;
}
