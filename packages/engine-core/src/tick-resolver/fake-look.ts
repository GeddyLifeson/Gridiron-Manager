// I4.6.1 / G7.7.2 a fake's trigger look as the special-teams menu writes it, by role ("the wing is
// uncovered"), bound to the team slots and spots of the formation the unit lines up in. The menu
// (`@gm/football-content` special-teams `ScrimmageDef.look`) cannot know slot numbers, and this package
// may not import it (P1.2.1), so the shape is declared here too and the two are kept equal by a test in
// app-services. The content port calls `bindFakeLook` and puts the result in `KickLookCheck.look`.
import type { Assignment } from '@gm/schema';
import type { LookCondition } from './kick-check.ts';

/** The men a fake's look can name. The content port says which team slot plays which. */
export type FakeRole = 'wing' | 'end' | 'gunner' | 'slot';

/** One term of a fake's look by role; every term must hold. Thresholds are content (design values). */
export type FakeLookTerm =
  /** One of the men in `who` is uncovered: nobody within `lateralYd` of him across and `depthYd` downfield. */
  | { readonly kind: 'uncovered'; readonly who: readonly FakeRole[]; readonly lateralYd: number; readonly depthYd: number }
  /** On the side of one man playing `outsideOf`, nobody is lined up more than `marginYd` outside him within `depthYd`. */
  | { readonly kind: 'edgeOpen'; readonly outsideOf: FakeRole; readonly marginYd: number; readonly depthYd: number }
  /** The defense does not match an overloaded side: on the side with more offensive men beyond `gapYd`, fewer defenders than offensive men stand beyond it within `depthYd`. */
  | { readonly kind: 'outnumbered'; readonly gapYd: number; readonly depthYd: number }
  | { readonly kind: 'boxAtMost'; readonly count: number; readonly halfWidthYd: number; readonly depthYd: number };

/**
 * The engine's look for a menu look, on this formation. `O` is team-slot order with `preSnap.align`;
 * `roleOf` names each slot's role, or null. A term naming a role nobody plays throws: the fake cannot
 * be run from that formation.
 */
export function bindFakeLook(terms: readonly FakeLookTerm[], O: readonly Assignment[], roleOf: (teamSlot: number) => FakeRole | null): LookCondition[] {
  const slotsOf = (roles: readonly FakeRole[]): number[] => {
    const out: number[] = [];
    for (let i = 0; i < O.length; i++) { const r = roleOf(i); if (r !== null && roles.includes(r)) out.push(i); }
    if (out.length === 0) throw new Error(`fake look: the formation has no ${roles.join(' or ')}`);
    return out;
  };
  const py = (s: number): number => O[s]!.preSnap.align.py;
  const sideOf = (y: number): 1 | -1 => (y >= 0 ? 1 : -1);
  return terms.map((t): LookCondition => {
    if (t.kind === 'boxAtMost') return { kind: 'boxAtMost', count: t.count, halfWidthYd: t.halfWidthYd, depthYd: t.depthYd };
    if (t.kind === 'uncovered') {
      return { kind: 'either', of: slotsOf(t.who).map((s) => ({ kind: 'uncovered' as const, teamSlot: s, lateralYd: t.lateralYd, depthYd: t.depthYd })) };
    }
    if (t.kind === 'edgeOpen') {
      return { kind: 'either', of: slotsOf([t.outsideOf]).map((s) => ({ kind: 'edgeOpen' as const, side: sideOf(py(s)), outsidePy: Math.abs(py(s)) + t.marginYd, depthYd: t.depthYd })) };
    }
    let left = 0, right = 0;
    for (let i = 0; i < O.length; i++) { const y = py(i); if (y > t.gapYd) left++; else if (y < -t.gapYd) right++; }
    const side: 1 | -1 = left >= right ? 1 : -1, men = side === 1 ? left : right;
    if (men === 0) throw new Error('fake look: no offensive man stands beyond the gap, so nothing can be outnumbered');
    return { kind: 'sideAtMost', side, beyondPy: t.gapYd, count: men - 1, depthYd: t.depthYd };
  });
}
