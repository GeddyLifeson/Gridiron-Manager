// Fouls and injuries from play (bible J10, work package WP-22).
//
// Wiring for the tick resolver (WP-23): `foulsInjuriesPlug()` is a `StagePlug` with id 'foulsInjuries'.
// Its `create` takes the play's shared perception (for J3.5.1 "located the ball") and player AI (for
// K1.3.3 deliberate fouls) and returns one Interact stage plus `hitLoad`, `wantsAfterWhistle` and
// `explain`. `createFoulsInjuries(options)` is the same module without the port types, for tests and
// for callers that hold the shared instances themselves.
//
// Not re-exported from the engine-core barrel: the integrator owns barrels.
import type { PlayServices, StagePlug } from '../tick-resolver/ports.ts';
import { FOULS_INJURIES_VERSION, createFoulsInjuries, type FoulsInjuriesOptions } from './stage.ts';

export * from './params.ts';
export * from './formulas.ts';
export * from './stage.ts';

/** Game-layer inputs the shared services do not carry (team discipline, instructions, load, surface). */
export type FoulsInjuriesExtras = Omit<FoulsInjuriesOptions, 'landingEstimate' | 'foulIntent'>;

export function foulsInjuriesPlug(extras: FoulsInjuriesExtras = {}): StagePlug {
  return {
    id: 'foulsInjuries',
    version: FOULS_INJURIES_VERSION,
    create(services: PlayServices) {
      const m = createFoulsInjuries({
        ...extras,
        landingEstimate: (w, s, out) => services.perception.landingEstimate(w, s, out),
        foulIntent: (s) => services.playerAi.foulIntent(s),
      });
      return { stages: m.stages, hitLoad: m.hitLoad, wantsAfterWhistle: m.wantsAfterWhistle, explain: m.explain };
    },
  };
}
