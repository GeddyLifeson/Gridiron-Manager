// K5.1.1: estimate, offset, advice, choice. One procedure for every game-management decision, so AI
// coaches differ by data, not by code. It always takes the same three draws, whatever the branch.
import type { Draws } from '../profile/draws.ts';
import { param } from './params.ts';
import type { LogRow, OptionEst } from './types.ts';

export class ManagementError extends Error {}

/** Win probability (0 to 1) to win-probability points. A unit conversion, not a football number. */
export const PTS = 100;

export interface MethodInput {
  readonly decisionType: string;
  /** Options the coach weighs, with the staff's estimated win probability (rule 1). Sorted by id inside. */
  readonly options: readonly OptionEst[];
  /** Legal options he does not weigh (out of range, plainly bad). They keep only the floor chance. */
  readonly longShots?: readonly string[];
  /** The conventional option (rule 2). */
  readonly habit: string;
  /** His tendency for this decision type, in win-probability points (rule 3). */
  readonly offsetPts: number;
  readonly advisor: boolean;
  readonly analyticsTrust: number;
  /** Rule 5: with no advisor, the weekly chart's line for this cell replaces the live search. */
  readonly weekly?: { readonly choice: string; readonly marginPts: number } | null;
  readonly draws: Draws;
}

export interface MethodResult {
  readonly chosen: string;
  readonly thinkingS: number;
  readonly log: LogRow;
}

function argmax(options: readonly OptionEst[]): OptionEst {
  let best = options[0]!;
  for (const o of options) if (o.wp > best.wp) best = o;
  return best;
}

/** K5.1.1 rules 1 and 2 alone: the advisor's line. No draw. `close` is a margin inside the thinking band. */
export function modelLine(options: readonly OptionEst[], habit: string): { optionId: string; marginPts: number; close: boolean } {
  const sorted = [...options].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const h = sorted.find((o) => o.id === habit);
  if (!h) throw new ManagementError(`habit ${habit} is not an option`);
  const model = argmax(sorted);
  const marginPts = (model.wp - h.wp) * PTS;
  return { optionId: model.id, marginPts, close: marginPts < param('think.closeBandPts') };
}

export function decide(input: MethodInput): MethodResult {
  const options = [...input.options].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (options.length === 0) throw new ManagementError(`${input.decisionType}: no option`);
  const habit = options.find((o) => o.id === input.habit);
  if (!habit) throw new ManagementError(`${input.decisionType}: habit ${input.habit} is not an option`);
  const uAdvice = input.draws.uniform(), uFloor = input.draws.uniform(), uThink = input.draws.uniform();

  // Rules 1 and 2: the model's choice and its margin over the habit.
  const model = argmax(options);
  const marginPts = (model.wp - habit.wp) * PTS;
  // Rule 5: without an advisor he sees the coarser weekly chart.
  const weekly = !input.advisor && input.weekly && options.some((o) => o.id === input.weekly!.choice) ? input.weekly : null;
  const seenChoice = weekly ? weekly.choice : model.id;
  const seenMargin = weekly ? (weekly.choice === habit.id ? 0 : weekly.marginPts) : marginPts;
  // Rule 3: he leaves the habit only for a margin above his offset.
  let chosen = seenChoice !== habit.id && seenMargin > input.offsetPts ? seenChoice : habit.id;
  // Rule 4: the advisor's line is the model's choice; he switches to it with probability analyticsTrust.
  const advice = input.advisor ? model.id : null;
  let followedAdvice = false;
  if (advice !== null && advice !== chosen && uAdvice < input.analyticsTrust) { chosen = advice; followedAdvice = true; }
  // A3 ruling 22: every other legal option keeps the floor chance.
  const others = [...options.map((o) => o.id), ...[...(input.longShots ?? [])].sort()].filter((id) => id !== chosen);
  const floorP = param('prob.floor');
  let floor = false;
  if (others.length > 0 && uFloor < floorP * others.length) { chosen = others[Math.min(others.length - 1, Math.floor(uFloor / floorP))]!; floor = true; }
  // Rule 7: thinking time, longer when the margin sits at his offset.
  const close = Math.abs(seenMargin - input.offsetPts) < param('think.closeBandPts');
  const thinkingS = param('think.minS') + uThink * (param('think.maxS') - param('think.minS')) + (close ? param('think.closeExtraS') : 0);
  return {
    chosen, thinkingS,
    log: { decisionType: input.decisionType, options, chosen, model: model.id, habit: habit.id, marginPts, offsetPts: input.offsetPts, advice, followedAdvice, errorId: null, floor, wpTrue: null },
  };
}
