// Resolver registry for batches and diffs (J1.6.3, Q1.3.2). The reference resolver is here now; the
// tick resolver (WP-23) joins when it lands: the integrator adds one line to BUILT_IN below. A factory
// may supply its own resolvers (tests, experiments) and those win over the built-in ones.
import type { Resolver } from '@gm/schema';
import { resolver as reference } from '@gm/resolver-reference';
import type { GameFactory } from './spec.ts';

const BUILT_IN: Partial<Record<Resolver['id'], () => Resolver>> = {
  reference: () => reference.REFERENCE_RESOLVER,
  // tick: () => TICK_RESOLVER,   // WP-23; integrator wires it on merge
};

/** Resolver ids a batch can run right now. */
export function availableResolvers(factory?: Pick<GameFactory, 'resolver'>): string[] {
  const ids = new Set<string>(Object.keys(BUILT_IN));
  for (const id of ['reference', 'tick'] as const) if (factory?.resolver?.(id)) ids.add(id);
  return [...ids].sort();
}

export function resolverFor(id: Resolver['id'], factory?: Pick<GameFactory, 'resolver'>): Resolver {
  const own = factory?.resolver?.(id);
  if (own) return own;
  const make = BUILT_IN[id];
  if (!make) throw new Error(`resolver '${id}' is not available in this build (available: ${availableResolvers(factory).join(', ')}); the tick resolver arrives with WP-23`);
  return make();
}
