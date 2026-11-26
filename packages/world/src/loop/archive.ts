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

/**
 * True when a person's playing block can never be read again. Inactive people too (X12.1.3 rule 1: they
 * are kept at tier 3 detail and run no weekly system); one who returns does so when hired, as staff, and
 * no roster move signs a player without a playing block.
 */
export function slimmable(world: LiveWorld, p: PersonRecord, onRoster: ReadonlySet<number>): boolean {
  if (p.playing === undefined) return false;
  const status = world.status.get(p.id);
  if (status === 'deceased') return true;
  if (status === 'inactive' && !onRoster.has(p.id)) return true;
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

// ---------- the archive: people with no history in this world ----------
// A recruit no program signed, a walk-on nobody kept, an entrant no league took: he leaves football with no
// event naming him, so no page, record, tree or memory can reach him. Keeping his full record would make
// the people table grow by every year's whole recruiting board (X11.2.1 tracks 3 recruits per signee) for
// as long as they live. He moves to one compact row instead: id, name, birth year, the year he left, and
// his generator seed (enough to rebuild his record exactly, G-17 provenance). The row is in systemState, so
// a save keeps it. This is storage, not a lighter sim: nobody in the archive plays, coaches or is searched.

export const ARCHIVE_KEY = 'world.archive';

/** Saved form: parallel arrays, one entry per archived person, in archive order. */
export interface ArchiveState {
  readonly v: 1;
  readonly ids: number[];
  /** first, last, birth season, year left football, generator seed hex; tab separated. */
  readonly rows: string[];
}

export interface ArchivedPerson {
  readonly id: number;
  readonly first: string;
  readonly last: string;
  readonly birthYear: number;
  readonly leftYear: number;
  readonly seedHex: string;
}

function archiveState(world: LiveWorld): ArchiveState {
  let a = world.systemState.get(ARCHIVE_KEY) as ArchiveState | undefined;
  if (!a) { a = { v: 1, ids: [], rows: [] }; world.systemState.set(ARCHIVE_KEY, a); }
  return a;
}

const clean = (x: string): string => x.replace(/\t/g, ' ');

/** Move one person from the people table to the archive. His status and out-of-football entry go too. */
export function archivePerson(world: LiveWorld, p: PersonRecord, leftYear: number): void {
  const a = archiveState(world);
  a.ids.push(p.id);
  a.rows.push([clean(p.name.first), clean(p.name.last), p.birthDate.seasonYear, leftYear, p.provenance?.seedHex ?? ''].join('\t'));
  world.people.delete(p.id);
  world.status.delete(p.id);
  world.outOfFootballSince.delete(p.id);
}

export function archivedCount(world: LiveWorld): number {
  return (world.systemState.get(ARCHIVE_KEY) as ArchiveState | undefined)?.ids.length ?? 0;
}

/** One archived person, or undefined. A linear search: the archive is for the rare lookup, not the sim. */
export function archivedPerson(world: LiveWorld, id: number): ArchivedPerson | undefined {
  const a = world.systemState.get(ARCHIVE_KEY) as ArchiveState | undefined;
  const i = a ? a.ids.indexOf(id) : -1;
  if (!a || i < 0) return undefined;
  const [first, last, birth, left, seedHex] = a.rows[i]!.split('\t');
  return { id, first: first!, last: last!, birthYear: Number(birth), leftYear: Number(left), seedHex: seedHex! };
}
