// I4.6.1 the trigger read of a fake ("run it only if the look is there"), as pure functions. A fake called
// with its trigger is checked at the line by the designated player (the upback or personal protector on a
// punt, the holder on a field goal, the punter himself with a green light): he looks at the defense's
// alignment and runs the fake when he sees the look, the kick when he does not. `lookShown` says whether
// the look is there in the picture the defense shows; `checkReadChance` says how likely he is to read
// it right. The resolver draws the read (resolver.ts) and runs the fake or `KickLookCheck.kick`.
import { SLOTS_PER_TEAM, type Assignment, type DeterministicMath, type PlayPoint } from '@gm/schema';
import { clampProbability, issToZ } from '../contest/math.ts';
import type { TickResolverParams } from './params.ts';

/**
 * One part of a fake's trigger look, in the play frame (x downfield from the ball, y lateral, both in
 * yards; the offense's side of the ball is negative x). Every threshold is content: the coach installs
 * the look with the fake (G7.7.2). The engine only measures the alignment against it.
 */
export type LookCondition =
  /** Nobody lined up over this offensive man: no defender within `lateralYd` of him across and within `depthYd` of the ball downfield ("the gunner is uncovered"). */
  | { readonly kind: 'uncovered'; readonly teamSlot: number; readonly lateralYd: number; readonly depthYd: number }
  /** At most `count` defenders within `halfWidthYd` of the ball across and `depthYd` downfield ("a six-man box"). */
  | { readonly kind: 'boxAtMost'; readonly count: number; readonly halfWidthYd: number; readonly depthYd: number }
  /** Nobody lined up outside `outsidePy` on `side` (+1 the positive-y side, -1 the other) within `depthYd` downfield ("the rush leaves the edge open"). */
  | { readonly kind: 'edgeOpen'; readonly side: 1 | -1; readonly outsidePy: number; readonly depthYd: number }
  /** At most `count` defenders outside `beyondPy` on `side` within `depthYd` downfield ("the defense does not match the gate"). */
  | { readonly kind: 'sideAtMost'; readonly side: 1 | -1; readonly beyondPy: number; readonly count: number; readonly depthYd: number }
  /** Any one of these holds ("the gunner or the slot is uncovered"). */
  | { readonly kind: 'either'; readonly of: readonly LookCondition[] };

/** A disguising defender's shown spot (`PresnapDefense.disguise`): the reader sees him there. */
export interface ShownSpot { readonly teamSlot: number; readonly shown: PlayPoint }

/**
 * Is the look there in what the defense shows? `O` and `D` are team-slot order 0 to 10 with
 * `preSnap.align` in the play frame. A disguising defender counts where he shows, not where he will
 * be at the snap, so a disguise can fool the reader exactly as it fools a quarterback (J5.5.1).
 * Every condition must hold.
 */
export function lookShown(look: readonly LookCondition[], O: readonly Assignment[], D: readonly Assignment[], disguise: readonly ShownSpot[]): boolean {
  const shownBy = new Map<number, PlayPoint>();
  for (const d of disguise) shownBy.set(d.teamSlot, d.shown);
  const spots: PlayPoint[] = [];
  for (let i = 0; i < D.length; i++) { const a = D[i]; if (a !== undefined) spots.push(shownBy.get(i) ?? a.preSnap.align); }
  for (const c of look) if (!holds(c, O, spots)) return false;
  return true;
}

function holds(c: LookCondition, O: readonly Assignment[], spots: readonly PlayPoint[]): boolean {
  if (c.kind === 'either') { for (const x of c.of) if (holds(x, O, spots)) return true; return false; }
  if (c.kind === 'uncovered') {
    const man = O[c.teamSlot];
    if (man === undefined) return false;
    const y = man.preSnap.align.py;
    for (const s of spots) if (s.px >= 0 && s.px <= c.depthYd && Math.abs(s.py - y) <= c.lateralYd) return false;
    return true;
  }
  if (c.kind === 'boxAtMost') {
    let n = 0;
    for (const s of spots) if (s.px >= 0 && s.px <= c.depthYd && Math.abs(s.py) <= c.halfWidthYd) n++;
    return n <= c.count;
  }
  if (c.kind === 'sideAtMost') {
    let n = 0;
    for (const s of spots) if (s.px >= 0 && s.px <= c.depthYd && s.py * c.side > c.beyondPy) n++;
    return n <= c.count;
  }
  for (const s of spots) if (s.px >= 0 && s.px <= c.depthYd && s.py * c.side > c.outsidePy) return false;
  return true;
}

/**
 * The chance the designated player reads the look right, present or absent (I4.6.1): the bible's
 * starting chance for the fake's install (repped in practice this week, or installed but not repped),
 * moved on the logit scale by his `play_recognition` z. Grade 50 gives the starting chance exactly.
 * Never 0 or 1 (A3 ruling 22).
 */
export function checkReadChance(recognition: number, repped: boolean, q: TickResolverParams, math: DeterministicMath): number {
  const base = repped ? q['kickLook.check.reppedChance']! : q['kickLook.check.installedChance']!;
  const logit = math.log(base / (1 - base));
  return clampProbability(math.logistic(logit + q['kickLook.check.perZ']! * issToZ(recognition)));
}

/** Throws when a look names something the play does not have. `where` names the play. */
export function validateLook(look: readonly LookCondition[], where: string): void {
  if (look.length === 0) throw new Error(`tick resolver: ${where}: the fake's check names no look`);
  for (const c of look) {
    if (c.kind === 'either') { validateLook(c.of, where); continue; }
    if (c.kind === 'uncovered' && (!Number.isInteger(c.teamSlot) || c.teamSlot < 0 || c.teamSlot >= SLOTS_PER_TEAM)) {
      throw new Error(`tick resolver: ${where}: the fake's look names team slot ${String(c.teamSlot)}, which is not one of the eleven`);
    }
  }
}
