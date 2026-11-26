// The call cycle as the console draws it (I2.1.1, I2.1.3, I3.1.1, I2.4.1). These are the caller's estimates for
// the latest-call marker and the warning colour; the engine's own deadline (DecisionRequest) and the J5 pre-snap
// phase decide what really happens. Values are play-clock readings in tenths: a marker at 180 means "confirm
// before the play clock shows 18.0".
import { param } from './params.ts';
import type { Relay } from './sheet.ts';

type Table = Parameters<typeof param>[1];
export type ConsoleTempo = 'huddle' | 'no_huddle' | 'hurry_up' | 'check_with_me' | 'slow';
export const TEMPOS: readonly ConsoleTempo[] = ['huddle', 'no_huddle', 'hurry_up', 'check_with_me', 'slow'];
export const RELAYS: readonly Relay[] = ['radio', 'wristband', 'signals', 'messenger'];

export interface OffenseTiming {
  readonly spokenTenths: number;
  readonly relay: Relay;
  readonly tempo: ConsoleTempo;
  /** The call's personnel differs from the group on the field (I2.3.3). */
  readonly substitution: boolean;
  /** After a timeout the huddle is at the sideline and the relay stage is zero (I2.1.1 edge). */
  readonly afterTimeout: boolean;
  /** Radio cutoff in tenths from the rule set, null when there is no radio (keys.ts). */
  readonly radioCutoffTenths: number | null;
}

/** Stage 3, relay (I2.4.1). A wristband number replaces the spoken call. */
export function relayTenths(relay: Relay, spokenTenths: number, t?: Table): number {
  switch (relay) {
    case 'radio': return param('radioBaseTenths', t) + spokenTenths;
    case 'wristband': return param('wristbandBaseTenths', t) + param('wristbandReadTenths', t);
    case 'signals': return param('signalTenths', t);
    case 'messenger': return param('messengerTenths', t);
  }
}

/** Stages 3 to 5 after the confirm: relay, huddle and break, align and set. */
export function stagesAfterConfirm(o: OffenseTiming, t?: Table): number {
  const relay = o.afterTimeout ? 0 : relayTenths(o.relay, o.spokenTenths, t);
  const huddle = o.tempo === 'huddle' || o.tempo === 'slow' ? param('huddleBaseTenths', t) + o.spokenTenths : 0;
  const align = param('alignTenths', t) + (o.substitution ? param('substitutionTenths', t) : 0);
  return relay + huddle + align;
}

export interface Markers {
  /** Latest play-clock reading at which a confirm still leaves the minimum pre-snap time. */
  readonly latestTenths: number;
  /** Radio cutoff marker, drawn only when the relay is the radio and the rule set has one. */
  readonly radioTenths: number | null;
}

/** The latest-call marker (I2.1.1): moves earlier with a longer call or a substitution (acceptance 2). */
export function offenseMarkers(o: OffenseTiming, t?: Table): Markers {
  let latest = stagesAfterConfirm(o, t) + param('minPresnapTenths', t);
  let radio: number | null = null;
  if (o.relay === 'radio' && o.radioCutoffTenths !== null && !o.afterTimeout) {
    radio = o.radioCutoffTenths;
    // The spoken call must finish before the cutoff (I2.4.1 acceptance).
    latest = Math.max(latest, o.radioCutoffTenths + relayTenths('radio', o.spokenTenths, t));
  }
  return { latestTenths: latest, radioTenths: radio };
}

export type LateOutcome = 'normal' | 'rushed' | 'timeout' | 'delay_of_game';

/** I2.1.3: what a confirm at this play-clock reading leads to, by the console's estimate. */
export function lateOutcome(confirmAtTenths: number, o: OffenseTiming, standing: { readonly burnTimeoutToSaveYards: boolean; readonly timeoutsLeft: number; readonly timeoutTakenThisDeadBall: boolean }, t?: Table): LateOutcome {
  const left = confirmAtTenths - stagesAfterConfirm(o, t);
  if (left >= param('minPresnapTenths', t)) return 'normal';
  if (left >= 0) return 'rushed';
  return standing.burnTimeoutToSaveYards && standing.timeoutsLeft > 0 && !standing.timeoutTakenThisDeadBall ? 'timeout' : 'delay_of_game';
}

export interface DefenseTiming {
  readonly spokenTenths: number;
  readonly relay: Relay;
  /** Play-clock reading at which the offense is expected to be set for its tempo (from the engine's pre-snap times). */
  readonly offenseSetTenths: number;
  readonly substitution: boolean;
  /** After a timeout or change of possession both sides are at the sideline: relay and tell are zero (I3.1.1 edge). */
  readonly atSideline: boolean;
}

/** The defensive latest-call marker (I3.1.1): the call must reach all eleven before the offense can snap. */
export function defenseMarkers(d: DefenseTiming, t?: Table): Markers {
  const relay = d.atSideline ? 0 : relayTenths(d.relay, d.spokenTenths, t);
  const tell = d.atSideline ? 0 : param('defTellTenths', t) + d.spokenTenths;
  const sub = d.substitution ? param('defSubTenths', t) : 0;
  return { latestTenths: d.offenseSetTenths + Math.max(relay + tell, sub) + param('defAlignTenths', t), radioTenths: null };
}
