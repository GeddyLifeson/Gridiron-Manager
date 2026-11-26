// The list of bridges from truth to views (K9.3.1 rule 4). A bridge is code that reads world state
// and hands out something an AI decision or a screen may hold. Bridges are few, reviewed, and each has
// a field whitelist test. Everything else (read-model builders, AI view code) reads an ObservedWorld
// and so cannot reach truth at all.
import { param } from './params.ts';

export interface Bridge {
  readonly name: string;
  /** Bible leaf that allows this source of information (K9.1.1 items 1 to 6). */
  readonly leaf: string;
  /** Module that holds the bridge. */
  readonly module: string;
  /** Test file that proves its field whitelist. */
  readonly whitelistTest: string;
}

const BRIDGES: Bridge[] = [];

export function registerBridge(b: Bridge): void {
  if (BRIDGES.some((x) => x.name === b.name)) throw new Error(`observer: bridge ${b.name} is registered twice`);
  if (BRIDGES.length >= param('observer.bridge.max_count')) {
    throw new Error(`observer: more than ${param('observer.bridge.max_count')} bridges; K9.3.1 keeps the list short so each can be reviewed`);
  }
  if (!b.whitelistTest) throw new Error(`observer: bridge ${b.name} names no whitelist test (K9.3.1)`);
  BRIDGES.push(Object.freeze({ ...b }));
}

export function bridges(): readonly Bridge[] { return BRIDGES; }

registerBridge({
  name: 'observer.filter',
  leaf: 'K9.1.1 items 1, 2, 5 and 6; P1.1.4',
  module: 'app-services/src/observer/filter.ts',
  whitelistTest: 'packages/app-services/test/observer/filter.test.ts',
});
