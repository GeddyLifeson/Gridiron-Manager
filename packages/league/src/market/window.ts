// C8.2.1 the negotiating window and the opening: who may talk to whom and when, when a contract may be
// executed, the market rounds, and agreements made in the window. Contact rules come from CBA Art. 9
// s.1(b)(iv)-(v) and the 2026 call resolution; breaking them is breakable tampering (C11.6.2): warned,
// allowed, logged and sent through L8.2.5, for AI clubs too.
import { addMinutes, compareInstant } from '../calendar/date.ts';
import { fitsUnderCap, type TeamCapPosition } from '../cap/charges.ts';
import type { MarketRules } from './keys.ts';
import { addDays, atOrAfter, before, type MarketDates } from './dates.ts';
import { MINUTES_PER_HOUR, P } from './params.ts';
import { refuse, type BreakableAct, type Instant, type Refusal } from './types.ts';

/** Who at the club makes the contact. The CBA lets only front-office officials talk in the window. */
export type ContactActor = 'front_office' | 'head_coach' | 'coaching_staff';
/** What the contact is: talks with the player's certified agent, or a direct call with the player. */
export type ContactKind = 'agent_talks' | 'player_call';

/** The player's standing toward the contacting club. */
export type ContactTarget =
  /** On the contacting club's own roster or expiring list. */
  | 'own_player'
  /** Under contract elsewhere and not about to be unrestricted this league year. */
  | 'under_contract_elsewhere'
  /** About to become unrestricted when the league year opens (contract with another club expiring). */
  | 'pending_ufa'
  /** Signable now by this club (rights allow it, C8.1.1). */
  | 'free_agent';

export interface ContactInput {
  readonly clubId: number;
  readonly personId: number;
  readonly actor: ContactActor;
  readonly kind: ContactKind;
  readonly target: ContactTarget;
  /** Window calls this club has already held this year (`league_rules.free_agency.window_calls`). */
  readonly callsUsed: number;
}

export interface ContactVerdict {
  readonly legal: boolean;
  /** Counts as one of the club's window calls. */
  readonly usesWindowCall: boolean;
  readonly breakable: BreakableAct | null;
  readonly reason: string;
}

const tamper = (c: ContactInput, act: string): ContactVerdict => ({
  legal: false, usesWindowCall: false, reason: act,
  breakable: { rule: 'C11.6.2', act, clubId: c.clubId, personId: c.personId },
});

/**
 * Checks a contact (C8.2.1 rules 1 and 6, M5.2.1 rule 5). Illegal contact is never refused: the act goes
 * ahead and carries a breakable act for the compliance pipeline (G-28). Reading of the open question
 * R16a-4: the head coach may not join the window call, because CBA Art. 9 s.1(b)(iv) excludes him from the
 * window; a later ruling changes only this function.
 */
export function checkContact(c: ContactInput, now: Instant, dates: MarketDates, mr: MarketRules): ContactVerdict {
  if (c.target === 'own_player') return { legal: true, usesWindowCall: false, breakable: null, reason: 'own player' };
  if (c.target === 'free_agent') return { legal: true, usesWindowCall: false, breakable: null, reason: 'free agent the club may sign' };
  if (c.target === 'under_contract_elsewhere') return tamper(c, 'contact with a player under contract to another club');
  // Pending unrestricted free agent.
  const inWindow = atOrAfter(now, dates.negotiatingOpen) && before(now, dates.leagueYearStart);
  if (!inWindow) return tamper(c, 'contact with a pending free agent outside the negotiating window');
  if (c.actor !== 'front_office') return tamper(c, c.actor === 'head_coach' ? 'head coach in negotiating-window contact' : 'coaching staff in negotiating-window contact');
  if (c.kind === 'agent_talks') return { legal: true, usesWindowCall: false, breakable: null, reason: 'front office with the certified agent in the window (CBA Art. 9 s.1(b)(iv))' };
  const calls = mr.windowCalls ?? 0;
  if (c.callsUsed < calls) return { legal: true, usesWindowCall: true, breakable: null, reason: `window call ${c.callsUsed + 1} of ${calls}` };
  return tamper(c, 'direct contact with a pending free agent beyond the window calls allowed');
}

/** No contract carries a signing time before the league year opens (C8.2.1 rule 1, acceptance). Blocked, not breakable. */
export function mayExecuteContract(now: Instant, dates: MarketDates): { readonly ok: true } | Refusal {
  return before(now, dates.leagueYearStart)
    ? refuse('C8.2.1', 'phase', 'no contract may be executed before the league year opens at 4 p.m. New York time (CBA Art. 9 s.1(b)(iv))', 'record an agreement in principle; it posts when the league year opens')
    : { ok: true };
}

/** True while the first wave runs (C8.2.1 rule 4): from the league year opening for `firstWaveHours`. */
export function inFirstWave(now: Instant, dates: MarketDates): boolean {
  return before(now, addMinutes(dates.leagueYearStart, P.firstWaveHours * MINUTES_PER_HOUR)) && atOrAfter(now, dates.negotiatingOpen);
}

/**
 * Market round times from the window opening to `until` (C8.2.1 rule 3): every `roundIntervalHours` through
 * the window and the first days after the opening, then once a day at `dailyRoundHour`.
 */
export function marketRounds(dates: MarketDates, until: Instant): Instant[] {
  const out: Instant[] = [];
  const step = P.roundIntervalHours * MINUTES_PER_HOUR;
  const hourlyEnd = addDays(dates.leagueYearStart, P.hourlyRoundDaysAfterOpen);
  for (let t = dates.negotiatingOpen; before(t, hourlyEnd) && compareInstant(t, until) <= 0; t = addMinutes(t, step)) out.push(t);
  let day = hourlyEnd.day + (hourlyEnd.minute > P.dailyRoundHour * MINUTES_PER_HOUR ? 1 : 0);
  for (let t: Instant = { day, minute: P.dailyRoundHour * MINUTES_PER_HOUR }; compareInstant(t, until) <= 0; t = { day: ++day, minute: P.dailyRoundHour * MINUTES_PER_HOUR }) out.push(t);
  return out;
}

/** An agreement in principle reached in the window (C8.2.1, "agreed in principle" items). */
export interface Agreement {
  readonly personId: number;
  readonly clubId: number;
  readonly agreedAt: Instant;
  /** Cap charge the contract adds in the league year (C6.2.1). */
  readonly chargeCents: number;
}

export type AgreementPosting =
  | { readonly kind: 'posted'; readonly at: Instant }
  /** The player backed out before signing: a logged event (C8.2.1 edge case). */
  | { readonly kind: 'backed_out' }
  /** The club is over the cap: the deal waits until it clears room (C8.2.1 edge case; C6.2.1 rule 4). */
  | { readonly kind: 'waits_for_room'; readonly shortCents: number };

/**
 * Posts an agreement when the league year opens. `draw` is a uniform [0, 1) value from the caller's seeded
 * stream (league source holds no randomness); the player backs out when it falls below the backout chance.
 */
export function postAgreement(a: Agreement, cap: TeamCapPosition, now: Instant, dates: MarketDates, draw: number): AgreementPosting {
  if (draw < P.backoutChance) return { kind: 'backed_out' };
  if (!fitsUnderCap(cap, a.chargeCents)) return { kind: 'waits_for_room', shortCents: a.chargeCents - cap.roomCents };
  return { kind: 'posted', at: before(now, dates.leagueYearStart) ? dates.leagueYearStart : now };
}


