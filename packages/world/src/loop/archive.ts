// Keeping a 157-season world in memory (handoff item 3). A person's record is about 13 KB in the heap, and
// most of it is the playing block: the true physical, technique and mental values (D2 to D4). A world
// that runs from 1869 holds hundreds of thousands of people who will never play again: the dead, and old
// men long retired. Their playing block is never read again (true values are never shown, MA-48), so the
// season point drops it. Everything else stays: name, dates, origin, history, traits, so the record
// book, the hall, coaching trees and teammates of the past keep every person.
//
// Who is slimmed: the deceased, and anyone past `archive.playingAgeMax` who is on no roster. Nobody that
// old plays again, so no decision in the sim can read the dropped values. The schema already allows a
// person with no playing block (coaches and bosses have none). This is storage, not a lighter sim: every
// game is still the full engine (A3 row 20), and nothing about a living player changes.
import type { PersonRecord } from '@gm/schema';
import { param } from './params.ts';
import type { LiveWorld, StepHandler } from './types.ts';

/** Person ids on any current roster. */
function rostered(world: LiveWorld): Set<number> {
  const out = new Set<number>();
  for (const ids of world.rosters.values()) for (const id of ids) out.add(id);
  return out;
}

/** True when a person's playing block can never be read again. */
export function slimmable(world: LiveWorld, p: PersonRecord, onRoster: ReadonlySet<number>): boolean {
  if (p.playing === undefined) return false;
  if (world.status.get(p.id) === 'deceased') return true;
  return world.date.seasonYear - p.birthDate.seasonYear >= param('archive.playingAgeMax') && !onRoster.has(p.id);
}

/** Drop the playing block of every slimmable person. Returns how many were slimmed. */
export function slimRetired(world: LiveWorld): number {
  const onRoster = rostered(world);
  let n = 0;
  for (const [id, p] of world.people) {
    if (!slimmable(world, p, onRoster)) continue;
    const { playing: _drop, ...rest } = p;
    world.people.set(id, rest as PersonRecord);
    n++;
  }
  return n;
}

/** Season-point handler: slim the retired. Bound beside compaction (see `withSlimming`). */
export function slimStep(): StepHandler {
  return (ctx) => ({ slimmed: slimRetired(ctx.world) });
}

/** Run a step and then the slimming, folding both digests (for the `compaction` slot). */
export function withSlimming(step: StepHandler): StepHandler {
  return (ctx) => {
    const a = step(ctx) ?? {};
    return { ...a, slimmed: slimRetired(ctx.world) };
  };
}
