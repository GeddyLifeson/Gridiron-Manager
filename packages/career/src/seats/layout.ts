// O7.4.1 seat layouts. One console frame (O2.1.1) with the lower panel swapped by seat. Each task is graded for
// accuracy and speed; when the user is not the caller the game runs at real pace and never waits for him. The
// field view shows what his seat sees: the booth gets the full overhead view, the sideline a lower zoom limit.
import { sp } from './params.ts';
import type { GamedayRole, SeatRole } from './sheet.ts';

export type LowerPanel = 'charting_form' | 'signal_card' | 'pick_lists' | 'position_group' | 'decision_card' | 'call_sheet' | 'head_coach_console' | 'substitution_counter';

export interface SeatLayout {
  readonly panel: LowerPanel;
  readonly task: string;
  readonly view: 'booth_overhead' | 'sideline';
  readonly zoomMin: number;
  /** Only a caller's seat holds the game for his input (O7.4.1 rules). */
  readonly gameWaits: boolean;
  /** Tasks this seat has; a coordinator in the booth loses sideline corrections (edge case). */
  readonly tasks: readonly string[];
}

const PANEL: Readonly<Record<SeatRole, { panel: LowerPanel; task: string; tasks: readonly string[] }>> = {
  head_coach: { panel: 'head_coach_console', task: 'everything_in_i', tasks: ['call', 'game_management', 'channel'] },
  caller_offense: { panel: 'call_sheet', task: 'call_side', tasks: ['call', 'corrections'] },
  caller_defense: { panel: 'call_sheet', task: 'call_side', tasks: ['call', 'corrections'] },
  special_teams_coordinator: { panel: 'call_sheet', task: 'call_kicking', tasks: ['call', 'corrections'] },
  caller_assistant: { panel: 'call_sheet', task: 'suggest_calls', tasks: ['suggest', 'bench', 'first_calls', 'corrections'] },
  booth_coverage: { panel: 'pick_lists', task: 'name_look', tasks: ['report', 'answer_caller'] },
  booth_front: { panel: 'pick_lists', task: 'name_look', tasks: ['report', 'answer_caller'] },
  booth_offense: { panel: 'pick_lists', task: 'name_personnel', tasks: ['report', 'relay'] },
  game_management: { panel: 'decision_card', task: 'advise', tasks: ['advise', 'warn'] },
  personnel_caller: { panel: 'substitution_counter', task: 'call_group', tasks: ['call_group'] },
  position_bench: { panel: 'position_group', task: 'substitute_and_correct', tasks: ['substitute', 'corrections', 'report'] },
  charter: { panel: 'charting_form', task: 'chart_each_play', tasks: ['chart', 'flag', 'relay'] },
  signaler: { panel: 'signal_card', task: 'send_signal', tasks: ['signal'] },
  sub_getback: { panel: 'substitution_counter', task: 'send_players', tasks: ['send_players'] },
};

export function seatLayout(role: GamedayRole): SeatLayout {
  const p = PANEL[role.role];
  const booth = role.location === 'booth';
  const caller = role.role === 'caller_offense' || role.role === 'caller_defense' || role.role === 'special_teams_coordinator' || role.role === 'head_coach';
  const tasks = booth ? p.tasks.filter((t) => t !== 'corrections') : p.tasks;
  return { panel: p.panel, task: p.task, view: booth ? 'booth_overhead' : 'sideline', zoomMin: booth ? 0 : sp('view.sidelineZoomMin'), gameWaits: caller && role.user, tasks };
}

/** O7.4.1 decision owner: the user makes the seat task at rungs 1 to 7; at 8 or 9 it is the head coach cycle. */
export const seatTaskRung = (rung: number): 'seat' | 'head_coach_cycle' => (rung >= 8 ? 'head_coach_cycle' : 'seat');
