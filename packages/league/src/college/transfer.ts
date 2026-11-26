// Transfers (T6): the window and its exceptions (T6.1.1), who leaves (T6.2.1), the market (T6.3.1,
// T6.3.2), and contact before entry (T6.4.1). Entry outside a window is refused because the
// association's database does not accept it (the one case where the game blocks an act). Contact is
// never blocked: before entry it is tampering, an act for the compliance pipeline.
import type { CollegeRules } from './keys.ts';
import { clamp01, param } from './params.ts';
import type { Day, StaffRead, Stream } from './types.ts';

/** The national window for one cycle, from the calendar anchors `transfer_window_open` and `transfer_window_close` (G-12). */
export interface TransferWindow { readonly open: Day; readonly close: Day }

export interface EntryContext {
  /** The last game day of his team's season if it was still playing when the window closed (postseason exception). */
  readonly teamLastGameDay: Day | null;
  /** The day a new head coach was hired or announced at his school this cycle, if any (coaching-change window). */
  readonly headCoachHiredDay: Day | null;
  /** Transfers he has already made while eligible (T6.1.1 `transfer.max_free`). */
  readonly priorTransfers: number;
  /** Has eligibility left for the next season (T5.2.1). */
  readonly hasEligibilityLeft: boolean;
  /** Holds a degree; used by a one-free-transfer rule that allows a second after a degree. */
  readonly graduated: boolean;
}

export type EntryVerdict =
  | { readonly ok: true; readonly via: 'window' | 'postseason' | 'coach_change' }
  | { readonly ok: false; readonly reason: 'outside_window' | 'no_eligibility' | 'transfer_limit' | 'no_transfer_rules' };

/** The days a coaching change opens for that team's players (T6.1.1). */
export function coachChangeWindow(hiredDay: Day, rules: CollegeRules): TransferWindow | null {
  const t = rules.transfer;
  if (!t) return null;
  const open = hiredDay + t.coachChangeDelayDays;
  return { open, close: open + t.coachChangeWindowDays - 1 };
}

/** The extra days a team still playing when the window closed gets after its last game (T6.1.1). */
export function postseasonWindow(win: TransferWindow, lastGameDay: Day, rules: CollegeRules): TransferWindow | null {
  const t = rules.transfer;
  if (!t || lastGameDay < win.close - t.postseasonExtraDays + 1) return null;
  return { open: lastGameDay + 1, close: lastGameDay + t.postseasonExtraDays };
}

const inside = (w: TransferWindow | null, day: Day) => w !== null && day >= w.open && day <= w.close;

/** May a player enter the transfer database on this day (T6.1.1 acceptance)? */
export function entryAllowed(day: Day, win: TransferWindow, ctx: EntryContext, rules: CollegeRules): EntryVerdict {
  const t = rules.transfer;
  if (!t) return { ok: false, reason: 'no_transfer_rules' };
  if (!ctx.hasEligibilityLeft) return { ok: false, reason: 'no_eligibility' };
  if (t.maxFree > 0 && ctx.priorTransfers >= t.maxFree && !(ctx.graduated && ctx.priorTransfers === t.maxFree)) return { ok: false, reason: 'transfer_limit' };
  if (inside(win, day)) return { ok: true, via: 'window' };
  if (ctx.teamLastGameDay !== null && inside(postseasonWindow(win, ctx.teamLastGameDay, rules), day)) return { ok: true, via: 'postseason' };
  if (ctx.headCoachHiredDay !== null && inside(coachChangeWindow(ctx.headCoachHiredDay, rules), day)) return { ok: true, via: 'coach_change' };
  return { ok: false, reason: 'outside_window' };
}

/**
 * Contact with another school's player (T6.4.1). Contact is never refused; it is tampering unless he
 * has entered the database. Returns whether the contact is the breakable act.
 */
export function contactIsTampering(targetHasEntered: boolean): boolean {
  return !targetHasEntered;
}

export interface RetentionFactors {
  /** D12 satisfaction, 0 to 1. */
  readonly satisfaction: number;
  readonly blockedOnDepthChart: boolean;
  readonly positionCoachLeft: boolean;
  /** Pay against the player's market value (1 = at market); below 1 raises risk (T7.3.1). */
  readonly payToMarket: number;
  readonly teamLosing: boolean;
  /** A backup with eligibility left (most mobile). */
  readonly backupWithEligibility: boolean;
  /** Strongest L1 tie with his position coach or head coach, 0 to 1. */
  readonly relationship: number;
  /** A believable role promise for next year was made and recorded. */
  readonly rolePromise: boolean;
}

/** T6.2.1: the hidden chance a player enters the window. Truth data (K9); the staff hears words, not this. */
export function entryChance(f: RetentionFactors): number {
  const short = clamp01(1 - f.payToMarket);
  const p = param('entryBase')
    + param('entryLowSatisfaction') * clamp01(1 - f.satisfaction)
    + (f.blockedOnDepthChart ? param('entryBlockedDepth') : 0)
    + (f.positionCoachLeft ? param('entryCoachLeft') : 0)
    + param('entryUnderpaid') * short
    + (f.teamLosing ? param('entryTeamLosing') : 0)
    + (f.backupWithEligibility ? param('entryBackupWithEligibility') : 0)
    - param('entryRelationship') * clamp01(f.relationship)
    - (f.rolePromise ? param('entryRolePromise') : 0);
  return Math.min(param('entryMax'), clamp01(p));
}

/**
 * The staff's read of a player's plans (T6.2.1 retention board): words, with a chance of being wrong
 * that rises as the position coach's tie weakens. A wrong read is drawn from the other two words.
 */
export function staffRead(trueChance: number, positionCoachTie: number, rng: Stream): StaffRead {
  const honest: StaffRead = trueChance >= param('readLeavingAbove') ? 'agent_asking_around' : trueChance < param('readStayingBelow') ? 'says_staying' : 'nothing_heard';
  const wrong = param('readErrorFloor') + param('readErrorWeakTie') * clamp01(1 - positionCoachTie);
  const draw = rng.uniform();
  if (draw >= wrong) return honest;
  const others = (['says_staying', 'nothing_heard', 'agent_asking_around'] as const).filter((r) => r !== honest);
  return others[draw < wrong / (1 + 1) ? 0 : 1]!;
}

export type Subdivision = 'top' | 'second' | 'lower';

/** T6.2.1: starting share of entrants still unsigned when the next season starts. */
export function unsignedShare(level: Subdivision, powerConferenceScholarship: boolean): number {
  if (powerConferenceScholarship) return param('unsignedPowerScholarship');
  return level === 'top' ? param('unsignedTop') : level === 'second' ? param('unsignedSecond') : param('unsignedLower');
}

/** Chance a target signs with a suitor; tampering before entry adds a head start (T6.4.1). */
export function landingChance(base: number, tampered: boolean): number {
  return clamp01(base + (tampered ? param('tamperingLandingBoost') : 0));
}

export type ProspectSource = 'high_school' | 'same_level' | 'lower_subdivision' | 'lower_division' | 'juco';

/** Width multiplier on the D6 evaluation band at equal scouting effort (T6.3.1, T6.3.2 acceptance). */
export function evaluationBandFactor(source: ProspectSource): number {
  switch (source) {
    case 'high_school': return param('bandHighSchool');
    case 'same_level': return param('bandSameLevel');
    case 'lower_subdivision': return param('bandLowerSubdivision');
    case 'lower_division': return param('bandLowerDivision');
    case 'juco': return param('bandJuco');
  }
}

/** Whether entering ends the player's aid at the end of the term (T6.2.1 data switch). */
export function aidEndsOnEntry(rules: CollegeRules): boolean {
  return rules.transfer?.aidEndsOnEntry ?? false;
}
