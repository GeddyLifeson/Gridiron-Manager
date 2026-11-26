// X11.1.4 bosses, executives, and reporters over the decades. Owners only arrive through an ownership
// change (C10); other top chairs are filled from people already in the world first, and a new person is
// generated only when fewer than 3 qualified candidates exist. Reporter entrants match last year's exits
// plus net new outlets, retirees first. No draw is made to suit the user (rule 6): callers pass only the
// team's culture and population, never anything about the user.
import type { RandomStream } from '@gm/schema';
import { param } from './params.ts';

export type BossChair = 'owner' | 'athletic_director' | 'general_manager' | 'front_office' | 'president';

export type BossFill =
  | { readonly kind: 'from_world'; readonly personId: number }
  | { readonly kind: 'generate'; readonly ageYears: number }
  | { readonly kind: 'not_scheduled'; readonly reason: string };

/**
 * X11.1.4 rules 1 and 2. `ownershipChange` is true only when C10 drew an ownership change for this
 * club. `qualified` is the appointer's K7 shortlist from the world, best first (K7 ranks it).
 */
export function fillBossChair(chair: BossChair, qualified: readonly number[], s: RandomStream, ownershipChange = false): BossFill {
  if (chair === 'owner' && !ownershipChange) return { kind: 'not_scheduled', reason: 'X11.1.4 rule 1: a new owner exists only through an ownership change' };
  if (chair !== 'owner' && qualified.length >= param('bossMinQualifiedPool')) return { kind: 'from_world', personId: qualified[0]! };
  return { kind: 'generate', ageYears: s.int(param('bossNewAgeMin'), param('bossNewAgeMax')) };
}

export interface ReporterPlan {
  readonly total: number;
  /** Retired players and fired coaches who move into media this year (ids, chosen first). */
  readonly fromRetirees: readonly number[];
  /** Ages of generated newcomers. */
  readonly generatedAges: readonly number[];
}

/** X11.1.4 rule 3. `retirees` are this year's retired players and fired coaches, in a seeded order. */
export function planReporters(lastYearExits: number, netNewOutlets: number, retirees: readonly number[], s: RandomStream): ReporterPlan {
  const total = Math.max(0, lastYearExits + netNewOutlets);
  const p = param('reporterFromRetireesShare');
  const fromRetirees = retirees.filter(() => s.chance(p)).slice(0, total);
  const generatedAges: number[] = [];
  for (let i = fromRetirees.length; i < total; i++) generatedAges.push(s.int(param('reporterNewAgeMin'), param('reporterNewAgeMax')));
  return { total, fromRetirees, generatedAges };
}

/** X11.1.4 acceptance: every chair held at season start and nobody in a top boss chair past the age bound. */
export function bossChairProblems(chairs: readonly { chair: BossChair; holderId: number | null; holderAge: number | null }[]): string[] {
  const out: string[] = [];
  for (const c of chairs) {
    if (c.holderId === null) out.push(`${c.chair}: empty at season start`);
    else if (c.holderAge !== null && c.holderAge > param('bossMaxAge')) out.push(`${c.chair}: holder ${c.holderId} aged ${c.holderAge}`);
  }
  return out;
}
