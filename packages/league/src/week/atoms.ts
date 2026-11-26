// Who is in a block, and when two blocks clash (H1.1.1 rule 4: blocks for the same attendee may not overlap).
import { instantValue } from '../calendar/date.ts';
import { ATTENDEE_GROUPS, type Atom, type Block, type Clash, type LeaderRole, type Week } from './types.ts';
import { allBlocks } from './build.ts';

/** Leaders belong to the block even when the attendee list does not name their group. */
const LEADER_ATOMS: Readonly<Record<LeaderRole, readonly Atom[]>> = {
  head_coach: ['head_coach'], off_coordinator: ['off_staff'], def_coordinator: ['def_staff'], st_coordinator: ['st_staff'],
  position_coaches: [], play_caller: [], strength_coach: ['support'], trainer: ['support'], operations: ['support'],
  analyst: ['support'], quality_control: ['support'], staff_default: [], none: [],
};

export function atomsOf(b: Block): Set<Atom> {
  const out = new Set<Atom>();
  for (const g of b.attendees) for (const a of ATTENDEE_GROUPS[g]) out.add(a);
  for (const a of LEADER_ATOMS[b.leader]) out.add(a);
  // Support staff run treatment and lifts in parallel with practice; they are not a clash source.
  out.delete('support');
  return out;
}

export function blockEnd(b: Block): number { return instantValue(b.start) + b.minutes; }

export function overlaps(a: Block, b: Block): boolean {
  return instantValue(a.start) < blockEnd(b) && instantValue(b.start) < blockEnd(a);
}

/** The first shared atom of two overlapping blocks, or null when they can coexist. */
export function clashAtom(a: Block, b: Block): Atom | null {
  if (a.id === b.id || !overlaps(a, b)) return null;
  const sa = atomsOf(a);
  for (const x of atomsOf(b)) if (sa.has(x)) return x;
  return null;
}

export const clashFree = (a: Block, b: Block): boolean => clashAtom(a, b) === null;

/** Every clash in a week (acceptance H1.1.1 criterion 1 expects none). */
export function clashes(week: Week): Clash[] {
  const bs = allBlocks(week);
  const out: Clash[] = [];
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!, b = bs[j]!;
      if (instantValue(b.start) >= blockEnd(a) && b.start.day > a.start.day) break;
      const atom = clashAtom(a, b);
      if (atom) out.push({ a: a.id, b: b.id, atom });
    }
  }
  return out;
}

/** True when the block involves players as a team obligation (not injured-only, not quarterbacks-only). */
export function isPlayerObligation(b: Block): boolean {
  if (!b.mandatory) return false;
  if (b.type === 'game') return true;
  const groups = b.attendees.filter((g) => g !== 'quarterbacks' && g !== 'injured');
  return groups.some((g) => (ATTENDEE_GROUPS[g] as readonly Atom[]).some((a) => a === 'offense' || a === 'defense'));
}

/** The user (head coach) is in the block: attends it or leads it (H1.4.2 rule 1). */
export function involvesAtom(b: Block, atom: Atom): boolean {
  if (atom === 'support') return LEADER_ATOMS[b.leader].includes('support');
  return atomsOf(b).has(atom);
}
