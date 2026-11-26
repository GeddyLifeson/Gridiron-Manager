// Captains and the toss (I1.5): game captains with the speaking and penalty captains (I1.5.1, Rule 18-1), and
// the toss instruction resolved into who kicks off each half and which goal each team defends each quarter
// (I1.5.2, Rules 4-2-1, 4-2-2, 4-2-3). The coin is one draw from the game's `toss` stream event; a re-toss is
// display only. Overtime tosses are I5's.
import { gp } from './params.ts';
import type { Direction } from './conditions.ts';
import type { GameDayRules } from './rules.ts';

// ---------------------------------------------------------------------------------------------- I1.5.1

export interface CaptainChoice {
  /** Up to `toss.captains_max`; active, inactive or honorary. */
  readonly captains: readonly string[];
  /** The one who calls or declares at the toss (Rule 18-1-2). */
  readonly speaker: string;
  /** Penalty-option captains by side on the field (Rule 18-1-3); default the speaker. */
  readonly penaltyCaptain?: { readonly offense?: string; readonly defense?: string };
}

export type CaptainProblem = 'too_many' | 'speaker_not_captain' | 'none_named' | 'penalty_captain_not_captain';

export function checkCaptains(c: CaptainChoice, rules: GameDayRules): CaptainProblem[] {
  const out: CaptainProblem[] = [];
  const set = new Set(c.captains);
  if (set.size === 0) out.push('none_named');
  if (set.size > rules.captainsMax) out.push('too_many');
  if (!set.has(c.speaker)) out.push('speaker_not_captain');
  for (const p of [c.penaltyCaptain?.offense, c.penaltyCaptain?.defense]) if (p !== undefined && !set.has(p)) out.push('penalty_captain_not_captain');
  return out;
}

/** The captain who gives the team's penalty choice for the side on the field (Rule 18-1-3). */
export function penaltyCaptainFor(c: CaptainChoice, side: 'offense' | 'defense'): string {
  return c.penaltyCaptain?.[side] ?? c.speaker;
}

export interface CaptainMemory {
  readonly playerId: string;
  /** L1 memory kind written by G-46's ledger. */
  readonly kind: 'named_game_captain' | 'passed_over_as_captain';
  readonly strength: number;
}

/**
 * I1.5.1: naming a game captain is a small morale gain (larger facing a former team or returning from injury);
 * passing over an active season captain costs him a little trust. Returned as L1 memories for G-46.
 */
export function captainMemories(c: CaptainChoice, seasonCaptains: readonly string[], activeIds: readonly string[], special: readonly string[]): CaptainMemory[] {
  const out: CaptainMemory[] = [];
  for (const id of [...new Set(c.captains)].sort()) {
    if (seasonCaptains.includes(id)) continue;
    out.push({ playerId: id, kind: 'named_game_captain', strength: special.includes(id) ? gp('captain.specialStrength') : gp('captain.namedStrength') });
  }
  for (const id of [...seasonCaptains].sort()) {
    if (activeIds.includes(id) && !c.captains.includes(id)) out.push({ playerId: id, kind: 'passed_over_as_captain', strength: gp('captain.passedOverStrength') });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- I1.5.2

export type Team = 'home' | 'away';
export type Face = 'heads' | 'tails';
export type KickOrReceive = 'receive' | 'kick';

/** A choice among the privileges: (a) receive or kick, (b) the goal to defend. */
export type Privilege = { readonly kind: 'ball'; readonly take: KickOrReceive } | { readonly kind: 'goal'; readonly defend: Direction };

export interface TossInstruction {
  /** The call if this team is visiting (the visiting captain calls, rule 1). */
  readonly call: Face;
  /** The choice if the toss is won: defer, or a privilege. */
  readonly ifWon: 'defer' | Privilege;
  /** When the team chooses first in a half it did not win (or after a deferral): its privilege. */
  readonly whenChoosingFirst: Privilege;
  /** When the other team took a privilege: the preference for the one left. */
  readonly ifLeft: { readonly take: KickOrReceive; readonly defend: Direction };
}

export interface HalfArrangement {
  readonly kicksOff: Team;
  /** Goal defended by the home team in the half's first quarter; it swaps for the second (Rule 4-2-3). */
  readonly homeDefendsFirstQuarter: Direction;
  /** Who chose first and what. */
  readonly chooser: Team;
  readonly choice: Privilege;
}

export interface TossResult {
  readonly called: Face;
  readonly landed: Face;
  readonly winner: Team;
  readonly deferred: boolean;
  readonly firstHalf: HalfArrangement;
  readonly secondHalf: HalfArrangement;
  /** Goal the home team defends in quarters 1 to 4. */
  readonly homeDefends: readonly [Direction, Direction, Direction, Direction];
  /** Warnings the screen shows before confirming (I1.5.2 edge case: "kick" after winning). */
  readonly warnings: readonly ('won_and_kicked')[];
  /** A team that lost its toss option for both halves and overtime (Rule 4-2-1). */
  readonly optionLostBy: Team | null;
}

const other = (t: Team): Team => (t === 'home' ? 'away' : 'home');
const flip = (d: Direction): Direction => (d === 'north' ? 'south' : 'north');

/** Complete one half: the chooser's privilege, then the other team takes what is left (rules 2 and 3). */
function settleHalf(chooser: Team, choice: Privilege, leftPref: TossInstruction['ifLeft']): HalfArrangement {
  const otherTeam = other(chooser);
  if (choice.kind === 'ball') {
    const kicksOff = choice.take === 'kick' ? chooser : otherTeam;
    const homeDefends = otherTeam === 'home' ? leftPref.defend : flip(leftPref.defend);
    return { kicksOff, homeDefendsFirstQuarter: homeDefends, chooser, choice };
  }
  const homeDefends = chooser === 'home' ? choice.defend : flip(choice.defend);
  const kicksOff = leftPref.take === 'kick' ? otherTeam : chooser;
  return { kicksOff, homeDefendsFirstQuarter: homeDefends, chooser, choice };
}

/**
 * I1.5.2: resolve the toss. `coinDraw` is the uniform draw for the game's `toss` event (heads below 0.5).
 * Rule 4-2-2: the winner chooses a privilege or defers; the loser takes the remaining choice; for the second
 * half the loser chooses first unless the winner deferred. Rule 4-2-1: a team that lost its option makes no
 * choice in either half; the opponent makes every choice. Rule 4-2-3: goals change after quarters 1 and 3.
 */
export function resolveToss(instr: Readonly<Record<Team, TossInstruction>>, coinDraw: number, rules: GameDayRules, optionLostBy: Team | null = null): TossResult {
  const called = instr.away.call;
  const landed: Face = coinDraw < 0.5 ? 'heads' : 'tails';
  const winner: Team = optionLostBy !== null ? other(optionLostBy) : landed === called ? 'away' : 'home';
  const loser = other(winner);
  const warnings: 'won_and_kicked'[] = [];
  const won = instr[winner].ifWon;
  const deferred = won === 'defer' && rules.deferAllowed && optionLostBy === null;
  let firstHalf: HalfArrangement;
  let secondChooser: Team;
  if (optionLostBy !== null) {
    const pick = won === 'defer' ? instr[winner].whenChoosingFirst : won;
    firstHalf = settleHalf(winner, pick, instr[loser].ifLeft);
    secondChooser = winner;
  } else if (deferred) {
    firstHalf = settleHalf(loser, instr[loser].whenChoosingFirst, instr[winner].ifLeft);
    secondChooser = winner;
  } else {
    const pick = won === 'defer' ? instr[winner].whenChoosingFirst : won;
    if (pick.kind === 'ball' && pick.take === 'kick') warnings.push('won_and_kicked');
    firstHalf = settleHalf(winner, pick, instr[loser].ifLeft);
    secondChooser = loser;
  }
  const secondHalf = settleHalf(secondChooser, instr[secondChooser].whenChoosingFirst, instr[other(secondChooser)].ifLeft);
  const q1 = firstHalf.homeDefendsFirstQuarter, q3 = secondHalf.homeDefendsFirstQuarter;
  return { called, landed, winner, deferred, firstHalf, secondHalf, homeDefends: [q1, flip(q1), q3, flip(q3)], warnings, optionLostBy };
}

/** The second-half choice may be changed at halftime (I1.5.2 rule 8): replace one team's whenChoosingFirst. */
export function changeSecondHalfChoice(instr: Readonly<Record<Team, TossInstruction>>, team: Team, choice: Privilege): Record<Team, TossInstruction> {
  return { ...instr, [team]: { ...instr[team], whenChoosingFirst: choice } } as Record<Team, TossInstruction>;
}

/** Warning line shown before the user confirms "kick" as his won-toss choice (acceptance 2). */
export function instructionWarnings(i: TossInstruction): 'won_and_kicked'[] {
  return i.ifWon !== 'defer' && i.ifWon.kind === 'ball' && i.ifWon.take === 'kick' ? ['won_and_kicked'] : [];
}

/**
 * I1.5.2 advice, wind part: with a steady wind along the field at or above `toss.adviceWindMph` (positive blows
 * toward north), defer and in the second half defend the goal the wind blows toward, so the fourth quarter is
 * played with the wind (acceptance 4). Below it, null: the line is small and comes from the kickoff value only.
 */
export function windAdvice(windTowardNorthMph: number): { readonly defer: true; readonly secondHalfDefend: Direction } | null {
  const w = windTowardNorthMph;
  if ((w < 0 ? -w : w) < gp('toss.adviceWindMph')) return null;
  return { defer: true, secondHalfDefend: w > 0 ? 'north' : 'south' };
}

/** Whether a team defending `defends` attacks with a wind blowing toward north at `w` mph. */
export function withWind(defends: Direction, windTowardNorthMph: number): boolean {
  return windTowardNorthMph === 0 ? false : (defends === 'south') === (windTowardNorthMph > 0);
}

/** AI coaches (K5): defer by default; above their profile's wind threshold, take the wind in the fourth quarter. */
export function aiTossInstruction(call: Face, windTowardNorthMph: number, profileWindMph: number): TossInstruction {
  const w = windTowardNorthMph < 0 ? -windTowardNorthMph : windTowardNorthMph;
  const defendSecond: Direction = w >= profileWindMph && windTowardNorthMph !== 0 ? (windTowardNorthMph > 0 ? 'north' : 'south') : 'north';
  const goalPick: Privilege = w >= profileWindMph && windTowardNorthMph !== 0 ? { kind: 'goal', defend: defendSecond } : { kind: 'ball', take: 'receive' };
  return { call, ifWon: 'defer', whenChoosingFirst: goalPick, ifLeft: { take: 'receive', defend: windTowardNorthMph > 0 ? 'south' : 'north' } };
}
