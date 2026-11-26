// The sideline seat (E7.5.1 one thing at a time; plans/head-coach-nuance.md item 2). "There is no separate
// attention meter. The clock is the meter." A head coach who calls plays himself is on the call sheet when a
// management item comes up (a challenge, a penalty choice, the try, a fourth down): it waits until his call is in,
// then he switches channel. With a pre-set decision book line he reads the answer; with none he works it out.
// A game-management assistant who has the line ready says it on the headset, so the head coach only switches.
// A head coach who gave the calling away has the whole stoppage for it.
import { gp } from './params.ts';

export type ManagementItem = 'fourth_down' | 'challenge' | 'penalty' | 'try' | 'timeout';

export interface SidelineSeat {
  /** He calls the unit on the field himself (offense or defense, L4.1.2). */
  readonly callsOnField: boolean;
  /** A decision book line covers this item (I1.4.2): fourth downs and tries can be pre-set. */
  readonly bookLine: boolean;
  /** A game-management assistant has the line ready and says it on the headset (L4.1.2, K6.2.2). */
  readonly assistantLine: boolean;
}

/** Tenths of a second after the item comes up before he is on it: the call first, then the switch. */
export function itemArrivalTenths(seat: SidelineSeat): number {
  return seat.callsOnField ? gp('attention.onCallTenths') + gp('attention.switchTenths') : 0;
}

/** Tenths he needs once on it: hear the assistant's line, read the book, or work it out. */
export function itemThinkTenths(item: ManagementItem, seat: SidelineSeat): number {
  if (seat.assistantLine) return gp('attention.switchTenths');
  if (seat.bookLine && (item === 'fourth_down' || item === 'try')) return gp('attention.bookReadTenths');
  return gp('attention.thinkTenths');
}

/**
 * Tenths of the window left once he has decided, given the window the rules leave (play clock or challenge
 * window). Negative means the window closed first: staff handle it or it expires (E7.5.1 rule 3).
 */
export function windowLeftTenths(item: ManagementItem, seat: SidelineSeat, windowTenths: number): number {
  return windowTenths - itemArrivalTenths(seat) - itemThinkTenths(item, seat);
}
