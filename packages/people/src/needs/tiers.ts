// Update frequency by tier and the protected-person profile (X5.5.1, X13.1.2, X14.1.1).
import type { PersonOrigin, WorldTier } from '@gm/schema';

/** Tier 1 updates on each relevant event, tier 2 weekly from a summary, tier 3 at season points (X5.5.1). */
export type UpdateCadence = 'event' | 'weekly' | 'season';

export function updateCadence(tier: WorldTier): UpdateCadence {
  return tier === 1 ? 'event' : tier === 2 ? 'weekly' : 'season';
}

/** What triggered a possible update. */
export type UpdateTrigger = 'event' | 'week_end' | 'season_point';

/** Whether a person of this tier updates on this trigger. A higher cadence also runs the lower ones' triggers. */
export function shouldUpdate(tier: WorldTier, trigger: UpdateTrigger): boolean {
  const c = updateCadence(tier);
  if (c === 'event') return trigger === 'event' || trigger === 'week_end';
  if (c === 'weekly') return trigger === 'week_end' || trigger === 'season_point';
  return trigger === 'season_point';
}

/**
 * Imported real people are protected (X14.1.1): their trait block is neutral, so need weights are the class
 * row only; overruled hits, coping that invents conduct, `effort_dropped` and any conduct outcome never apply.
 */
export function isProtected(person: { origin: PersonOrigin }): boolean {
  return person.origin === 'imported';
}

/** The facet and value maps the engine reads for a person: neutral for protected people (X5.5.1, X14.1.1). */
export function engineTraits(person: { origin: PersonOrigin; traitBlock: { facets: Record<string, number>; values: Record<string, number> } }): { facets: Record<string, number>; values: Record<string, number> } {
  if (isProtected(person)) return { facets: {}, values: {} }; // missing keys read as the middle of each scale
  return { facets: person.traitBlock.facets, values: person.traitBlock.values };
}
