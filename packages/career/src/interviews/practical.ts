// The graded part of an interview (Marlon 2026-11-26 14:52: "of course those parts stay graded";
// anything a real interview has, the game has). Knowledge work has right answers: tagging film, teaching
// an install, grading snaps, a game plan, whiteboard and game-management situations (S6.4.1, E2.4.3
// segments 4 and 5). Views have none: those are the fit questions in questions.ts.
//
// The user's tasks are graded by the same tools the job uses (S6.4.1 acceptance), and their results are
// passed in. An AI candidate's grade comes from a hidden craft z drawn once per person, plus noise on the
// day (S6.4.1 "AI use": hidden parameters with noise). The world holds no K2 behaviour block for most
// coaches yet, so craft stands in for it until one does.
import type { RandomStream } from '@gm/schema';
import { clamp, param } from './params.ts';
import type { RoleGroup } from './questions.ts';

export interface PracticalTask {
  readonly id: string;
  /** What the candidate does; the user's screen opens the tool the job uses. */
  readonly text: string;
  readonly leaf: string;
}

const T = (id: string, text: string, leaf: string): PracticalTask => ({ id, text, leaf });

/** Graded tasks by role group (S6.4.1 table; E2.4.3 segments 4 and 5 for head coach). */
export const PRACTICAL_TASKS: Readonly<Record<RoleGroup, readonly PracticalTask[]>> = {
  entry: [T('tag_reel', 'Tag a short reel live and say what you see (speed and accuracy)', 'S6.4.1')],
  support: [T('tag_reel', 'Tag a short reel live and say what you see (speed and accuracy)', 'S6.4.1'), T('tendency_report', 'Present a tendency report on a named opponent', 'E2.4.3')],
  position: [T('teach_install', 'Teach one technique or install to the room: progression, clips, drill', 'S6.4.1'), T('grade_snaps', 'Grade six snaps of a player the staff knows well', 'S6.4.1')],
  coordinator: [T('game_plan', 'Plan against a named opponent: favourite calls and their answers, third down and red zone', 'S6.4.1'), T('board_what_if', 'Answer the head coach\'s "what if" on the board', 'S6.4.1')],
  head: [T('board_work', 'Board work: a protection problem, a coverage check, a fourth-down decision', 'E2.4.3'), T('game_management', 'Short timed game-management situations', 'E2.4.3')],
  strength: [T('program_design', 'Build the offseason program for a named player group', 'S6.4.1')],
  personnel: [T('evaluate_players', 'Evaluate the current roster and three prospects on film', 'E2.4.3')],
};

/** Smooth 0..1 curve without transcendental math (P1.1.1): 0.5 at z = 0. */
const squash = (x: number): number => 0.5 + 0.5 * x / (1 + Math.abs(x));

/** An AI candidate's grade on one task: his craft plus noise on the day. One normal per task. */
export function gradeAi(craft: number, stream: RandomStream): number {
  return clamp(squash(param('practical.slope') * (craft + param('practical.noiseSd') * stream.normal())), 0, 1);
}

/** A person's hidden craft z, drawn once on a stream keyed by him (the caller names it). Truth only. */
export function drawCraft(stream: RandomStream): number {
  return stream.normal();
}

/**
 * The practical score 0..1 for one candidate: the mean of his task grades. Given grades (the user's, from
 * the job's own tools) are used as they are; missing ones are drawn from craft, or 0 when he has no craft
 * (the user who skipped the task). Draws happen in task order.
 */
export function practicalScore(group: RoleGroup, given: Readonly<Record<string, number>> | undefined, craft: number | null, stream: RandomStream): { score: number; grades: Readonly<Record<string, number>> } {
  const tasks = PRACTICAL_TASKS[group];
  const grades: Record<string, number> = {};
  for (const t of tasks) {
    const g = given?.[t.id];
    grades[t.id] = g !== undefined ? clamp(g, 0, 1) : craft === null ? 0 : gradeAi(craft, stream);
  }
  const vals = Object.values(grades);
  return { score: vals.length === 0 ? 0.5 : vals.reduce((a, b) => a + b, 0) / vals.length, grades };
}
