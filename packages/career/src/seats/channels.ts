// Headset channels (S5.1.1, O7.4.2). The user hears only his own channel unless his role says otherwise. The
// head coach can hear every channel but listens to one at a time: messages from the selected channel show on
// the booth line; others queue with their age. Lower seats have one fixed channel. Every report arrives at the
// time it was sent plus its sender's delay (runner, phone, or a slow booth coach).
import type { Channel, GamedayRole } from './sheet.ts';

export interface ChannelMessage {
  readonly id: number;
  readonly fromSeat: number;
  readonly channel: Channel;
  readonly sentAtS: number;
  /** Seconds before it reaches the channel: the sender's own delay plus his seat's runner delay. */
  readonly delayS: number;
  readonly kind: 'report' | 'advice' | 'instruction' | 'flag' | 'call' | 'line';
  readonly body: Readonly<Record<string, string | number | boolean | null>>;
}

export const arrivalS = (m: ChannelMessage): number => m.sentAtS + m.delayS;

/** Channels a role may listen to. Only the head coach may pick (O7.4.2 edge case). */
export function listenable(role: GamedayRole): readonly Channel[] {
  if (role.role === 'head_coach') return ['offense', 'defense', 'special_teams', 'analyst', 'head_coach'];
  return [role.channel];
}

export interface ListenerState { readonly role: GamedayRole; readonly selected: Channel; readonly log: readonly { atS: number; channel: Channel }[] }

export function startListening(role: GamedayRole): ListenerState {
  return { role, selected: role.role === 'head_coach' ? 'offense' : role.channel, log: [] };
}

/** Pick a channel (head coach only). The choice is logged for N3 film review. Others keep their fixed channel. */
export function selectChannel(s: ListenerState, ch: Channel, atS: number): ListenerState {
  if (!listenable(s.role).includes(ch) || ch === s.selected) return s;
  return { ...s, selected: ch, log: [...s.log, { atS, channel: ch }] };
}

export interface BoothLine {
  readonly shown: readonly ChannelMessage[];
  readonly queued: readonly { message: ChannelMessage; ageS: number }[];
}

/**
 * What the listener has at `nowS`: messages on the selected channel that have arrived (O2.1.3 booth line), and
 * arrived messages on other channels he may hear, queued with their age. Messages from channels he cannot hear
 * never appear (O7.4.2 acceptance).
 */
export function boothLine(s: ListenerState, messages: readonly ChannelMessage[], nowS: number): BoothLine {
  const can = new Set(listenable(s.role));
  const arrived = messages.filter((m) => arrivalS(m) <= nowS && can.has(m.channel)).sort((a, b) => arrivalS(a) - arrivalS(b) || a.id - b.id);
  return {
    shown: arrived.filter((m) => m.channel === s.selected),
    queued: arrived.filter((m) => m.channel !== s.selected).map((message) => ({ message, ageS: nowS - arrivalS(message) })),
  };
}

/** Post a message from a seat on its own channel, with that seat's runner delay added to the sender's delay. */
export function post(from: GamedayRole, id: number, sentAtS: number, ownDelayS: number, kind: ChannelMessage['kind'], body: ChannelMessage['body']): ChannelMessage {
  return { id, fromSeat: from.seatId, channel: from.channel, sentAtS, delayS: ownDelayS + from.reportDelayS, kind, body };
}
