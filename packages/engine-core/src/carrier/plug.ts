// The ball carrier as a tick-resolver stage module (WP-23 ports, `StagePlug` id 'carrier').
//
// Until the contract carries them, three inputs fall back here and the handoff says so:
//   - designed-run back rules (F4 track, aiming point, read key): none, so a designed run is pressed
//     along the track the assignment gives him and then run by the look-ahead;
//   - the coach's carrier instructions (I8, K5) and return plan (F12, I4): none;
//   - personality (competitiveness for J8.4.3): neutral.
// The quarterback module reaches this one through `carrier.onRun` and `carrier.laneQuality`.
import type { PlayServices, PlugStages, StagePlug } from '../tick-resolver/ports.ts';
import { createCarrier, type Carrier, type CarrierOptions, type CarrierPlay } from './stage.ts';

export const CARRIER_VERSION = '0.1.0';

export interface CarrierPlugExtras {
  /** Per-play inputs the content port does not carry yet. Called in `setPlay`. */
  readonly play?: ((services: PlayServices) => CarrierPlay | null) | null;
  readonly instruction?: CarrierOptions['instruction'];
  readonly style?: CarrierOptions['style'];
  readonly mind?: CarrierOptions['mind'];
}

export type CarrierPlugStages = PlugStages & { readonly carrier: Carrier };

/** Builds the carrier's stages over the play's shared perception, movement, player AI and contests. */
export function carrierStages(services: PlayServices, extras: CarrierPlugExtras = {}): CarrierPlugStages {
  const carrier = createCarrier({
    view: (slot) => services.perception.view(slot),
    contests: () => services.contests(),
    movement: services.movement,
    playerAi: services.playerAi,
    instruction: extras.instruction ?? null,
    style: extras.style ?? null,
    mind: extras.mind ?? null,
  });
  return {
    stages: [carrier.decide, carrier.interact],
    setPlay() { carrier.setPlay(extras.play ? extras.play(services) : null); },
    hitLoad: (slot) => carrier.hitLoad(slot),
    explain: () => carrier.lanes(),
    carrier,
  };
}

export function carrierPlug(extras: CarrierPlugExtras = {}): StagePlug {
  return { id: 'carrier', version: CARRIER_VERSION, create: (services) => carrierStages(services, extras) };
}
