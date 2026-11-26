// From the console's commands to the engine's answers (J11.6.1). The call template from the sheet gets the
// tempo, tags, personnel and the players the depth chart sends; the play-clock value at the confirm travels with
// it, so replay never reads a wall clock (P5, J13.3.2). Illegal choices are sent as made: the engine runs them
// and the officials flag them (J4.6.1); nothing here refuses a football choice.
import type { Decision, DecisionRequest, FieldedPlayer, OpposingCall, SnappingCall } from '@gm/schema';
import type { SentCall } from './console.ts';
import type { ConsoleTempo } from './cycle.ts';

/** The engine's tempo values; check-with-me lines up fast like no-huddle, slow huddles (I2.4.3). */
export function engineTempo(t: ConsoleTempo): 'huddle' | 'no_huddle' | 'hurry_up' {
  return t === 'check_with_me' ? 'no_huddle' : t === 'slow' ? 'huddle' : t;
}

/** Who goes on the field for a unit and personnel group: the host's depth chart (I6). */
/** Who takes the field for a call. `detail` is the kick or return kind of a kick or return call (punt, field_goal, kick_return ...). */
export type LineupFor = (unit: SnappingCall['unit'] | OpposingCall['unit'], personnelCode: string | null, detail?: string | null) => FieldedPlayer[];

export interface Actor { readonly kind: 'user' | 'staff'; readonly personId: number | null }

export function callDecision(request: DecisionRequest, sent: SentCall, lineup: LineupFor, actor: Actor = { kind: 'user', personId: null }): Decision {
  const c = sent.entry.call;
  const base = { requestId: request.requestId, type: request.type, side: request.side, optionId: null, acceptedAtPlayClockTenths: sent.acceptedAtPlayClockTenths, actor };
  const extra = [...sent.tags, ...(sent.tempo === 'slow' || sent.tempo === 'check_with_me' ? [`tempo:${sent.tempo}`] : []), ...(sent.cadence ? [`cadence:${sent.cadence}`] : []), `relay:${sent.relay}`];
  if (c.unit === 'offense') {
    const personnelCode = sent.personnel ?? c.personnelCode;
    const snappingCall: SnappingCall = { ...c, personnelCode, tags: [...c.tags, ...extra], tempo: engineTempo(sent.tempo), players: lineup('offense', personnelCode) };
    return { ...base, snappingCall, opposingCall: null };
  }
  if (c.unit === 'kick') return { ...base, snappingCall: { ...c, players: lineup('kick', null, c.kickKind) }, opposingCall: null };
  if (c.unit === 'defense') return { ...base, snappingCall: null, opposingCall: { ...c, players: lineup('defense', sent.personnel) } };
  return { ...base, snappingCall: null, opposingCall: { ...c, players: lineup('return', null, c.returnKind) } };
}

export function optionDecision(request: DecisionRequest, optionId: string, acceptedAtPlayClockTenths: number, actor: Actor = { kind: 'user', personId: null }): Decision {
  return { requestId: request.requestId, type: request.type, side: request.side, optionId, snappingCall: null, opposingCall: null, acceptedAtPlayClockTenths, actor };
}

/** The answer when the deadline passed with no call: the engine applies the default (J11.6.1, I3.1.3). */
export function defaultDecision(request: DecisionRequest): Decision {
  return {
    requestId: request.requestId, type: request.type, side: request.side, optionId: null, snappingCall: null, opposingCall: null,
    acceptedAtPlayClockTenths: null, actor: { kind: 'default', personId: null },
  };
}
