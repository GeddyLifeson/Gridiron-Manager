// The candidate window (E2.3.1 state table) and the permission check (C11.6.1, L4.2.1, E2.4.2). Dates are
// never stored: the caller derives the club's cycle state from the schedule and bracket (C2, C3) the day
// after each round. Every count and day comes from HiringRules; with `playoffWindows` off (the college
// record) every coach is reachable any time.
import type { HiringRules } from './keys.ts';

/** Where the candidate's employer stands in its season, as the schedule says today. */
export type ClubCycle =
  | { readonly kind: 'not_employed' }
  | { readonly kind: 'regular_season'; readonly weeksLeft: number; readonly employerConsents: boolean }
  /** Missed the playoffs or was knocked out: the season is over. */
  | { readonly kind: 'season_over'; readonly daysSinceLastGame: number; readonly divisionalRoundOver: boolean }
  /** Still playing. `round` is the bracket round being played now; a bye club is idle in `wild_card`. */
  | {
    readonly kind: 'alive';
    readonly round: 'wild_card' | 'divisional' | 'conference' | 'championship';
    readonly hadBye: boolean;
    readonly daysSinceLastGame: number;
    readonly daysSinceRegularSeasonEnd: number;
    readonly championshipByeWeek: boolean;
  };

export interface CandidateWindow {
  readonly request: boolean;
  readonly virtual: boolean;
  readonly inPerson: boolean;
  /** No coach signs before his club's season is over (E2.3.1 rule 6): an accepted offer is "agreed in principle". */
  readonly signing: boolean;
  /** The interview minutes cap applies (candidate's club in the playoffs). */
  readonly capped: boolean;
  /** Text key of the status line the market screen shows. */
  readonly line: string;
}

const OPEN: CandidateWindow = { request: true, virtual: true, inPerson: true, signing: true, capped: false, line: 'staff.window.open' };

/** E2.3.1 table, one row per club state. */
export function candidateWindow(c: ClubCycle, r: HiringRules): CandidateWindow {
  if (!r.playoffWindows || c.kind === 'not_employed') return OPEN;
  const after = r.virtualAfterDays ?? 0;
  switch (c.kind) {
    case 'regular_season': {
      const consent = r.lateSeasonConsent && c.employerConsents && r.consentWeeksLeft !== null && c.weeksLeft <= r.consentWeeksLeft;
      return { request: false, virtual: consent, inPerson: false, signing: false, capped: false, line: consent ? 'staff.window.consent' : 'staff.window.season_on' };
    }
    case 'season_over': {
      const virtual = c.daysSinceLastGame >= after;
      return { request: true, virtual, inPerson: virtual && c.divisionalRoundOver, signing: true, capped: false, line: c.divisionalRoundOver ? 'staff.window.open' : virtual ? 'staff.window.virtual_only' : 'staff.window.virtual_from' };
    }
    case 'alive': {
      let virtual = false;
      if (c.round === 'wild_card') virtual = c.hadBye && c.daysSinceRegularSeasonEnd >= after;
      else if (c.round === 'divisional') virtual = !c.hadBye && c.daysSinceLastGame >= after;
      else if (c.round === 'championship') virtual = c.championshipByeWeek;
      return { request: true, virtual, inPerson: false, signing: false, capped: true, line: virtual ? 'staff.window.playoff_virtual' : 'staff.window.blocked_playing' };
    }
  }
}

/** E2.3.1 rule 5: may this club spend `minutes` more with a capped candidate? */
export function interviewFits(w: CandidateWindow, usedMinutes: number, minutes: number, r: HiringRules): boolean {
  if (!w.capped || r.playoffCapMinutes === null) return true;
  return usedMinutes + minutes <= r.playoffCapMinutes;
}

/** What kind of move a request is (L4.2.1): by the rung of the job offered against the one he holds. */
export type MoveKind = 'head_coach' | 'promotion' | 'lateral';

export function moveKind(currentRung: number | null, offeredRung: number | null, offeredIsHeadCoach: boolean): MoveKind {
  if (offeredIsHeadCoach) return 'head_coach';
  if (offeredRung !== null && (currentRung === null || offeredRung > currentRung)) return 'promotion';
  return 'lateral';
}

/**
 * The C11.6.1 permission check from the employer's side. `mayRefuse` is whether the league allows a
 * refusal; refusing where it does not is still possible and is a violation (L4.2.1 (1), L8.2.5).
 */
export interface PermissionRule {
  readonly needed: boolean;
  readonly mayRefuse: boolean;
  /** Text key naming the rule shown beside the refuse choice. */
  readonly ruleText: string;
}

export function permissionRule(kind: MoveKind, r: HiringRules): PermissionRule {
  if (!r.permissionRequired) return { needed: false, mayRefuse: false, ruleText: 'staff.permission.none' };
  if (kind === 'head_coach') return { needed: true, mayRefuse: !r.headCoachBlockForbidden, ruleText: 'staff.permission.head_coach' };
  if (kind === 'promotion') return { needed: true, mayRefuse: !r.promotionBlockForbidden, ruleText: 'staff.permission.promotion' };
  return { needed: true, mayRefuse: r.lateralBlockAllowed, ruleText: 'staff.permission.lateral' };
}

/** Contacting another club's coach is tampering when permission is needed and was not granted (C11.6.2). */
export function contactIsTampering(r: HiringRules, permissionGranted: boolean, candidateUnderContract: boolean): boolean {
  return r.permissionRequired && candidateUnderContract && !permissionGranted;
}
