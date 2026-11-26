// Special-teams call menu types (F12, I4, G7.7.2). A menu entry is content: it names the call, the unit that
// runs it, the kick or return kind the engine resolves, the rule-set values it needs, and the claims it
// rests on with their status words (A5.2.1), in the same Basis shape as the starter and full sets.
import type { KickKind, OffensePlayKind } from '@gm/schema';
import type { Basis } from '../starter/types.ts';

export type { Basis };

/** The box of the special-teams sheet the call belongs in (G7.7.2 kinds), plus `try` for two-point plays. */
export type SheetKind = 'kickoff' | 'kickoff_return' | 'punt' | 'punt_return' | 'field_goal' | 'field_goal_block' | 'onside' | 'hands_team' | 'try';

export type ReturnKind = 'punt_return' | 'punt_block' | 'kick_return' | 'hands_team' | 'field_goal_block' | 'try_block';

/** A rule-set value the call needs: read by key, never by level (P1.1.2). A boolean `is` reads `bool`, a string `opt`. */
export interface RuleCond { readonly key: string; readonly is: string | boolean }

/** Ball flight the kicker aims for (F12.2.2 `trajectory`, F12.4.2 punt types); J9 turns it into launch values. */
export type Trajectory = 'deep' | 'high' | 'line' | 'ground' | 'rugby' | 'pooch' | 'onside_high_bounce' | 'onside_drive' | 'onside_dribble';

interface Common {
  readonly id: string;
  readonly name: string;
  readonly sheetKind: SheetKind;
  /** One plain sentence on what the call does. */
  readonly summary: string;
  /** Rule values the call needs; all must hold. Empty: legal under every rule set. */
  readonly when: readonly RuleCond[];
  /** Rule fact rows (facts/rule.json) the call depends on. */
  readonly ruleFacts: readonly string[];
  readonly basis: readonly Basis[];
}

/** A kick by the kicking unit: punt, field goal, try kick, kickoff, onside kick (KickCall). */
export interface KickDef extends Common {
  readonly unit: 'kick';
  readonly kickKind: KickKind;
  readonly direction: 'left' | 'middle' | 'right' | null;
  readonly trajectory: Trajectory | null;
  /** Punt formation or protection label (F12.4.1); null for other kicks. */
  readonly protection?: 'spread' | 'shield' | null;
}

/** A call by the receiving or kick-defending unit (ReturnCall). */
export interface ReturnDef extends Common {
  readonly unit: 'return';
  readonly returnKind: ReturnKind;
  readonly direction: 'left' | 'middle' | 'right' | null;
  /** Fakes this call is sound against (F12.5.1 safe, F12.6.2 safe). */
  readonly safe: boolean;
}

/**
 * A scrimmage play out of a kicking look: a fake punt or field goal (F12.7.1) or a two-point play. The engine
 * runs it as an offensive play (J11.6.1: the unit called decides); `from` names the look it starts in.
 */
export interface ScrimmageDef extends Common {
  readonly unit: 'offense';
  readonly from: 'punt' | 'field_goal' | 'try';
  readonly fake: boolean;
  /** OffensePlayKind the play resolves as. */
  readonly playKind: OffensePlayKind;
  /** The look that must be present to run it (G7.7.2 fakes), in words for the sheet. Null for two-point plays. */
  readonly requiredLook: string | null;
  /**
   * The same look as terms the engine checks (I4.6.1 trigger read): every term must hold. Null for two-point
   * plays. The content port binds the roles to the formation's team slots (engine-core `bindFakeLook`).
   */
  readonly look: readonly FakeLookTerm[] | null;
  /** Coordinator floor share for a fake (K4.6.1 `fakeShare`); a design value, never an outcome. */
  readonly fakeShare: number | null;
}

export type SpecialCallDef = KickDef | ReturnDef | ScrimmageDef;

/** The men a fake's look can name (engine-core `FakeRole`; app-services test fake-looks checks the menu against it). */
export type FakeRole = 'wing' | 'end' | 'gunner' | 'slot';

/** One term of a fake's look by role (engine-core `FakeLookTerm`). Thresholds are design values. */
export type FakeLookTerm =
  /** One of the men in `who` is uncovered: nobody within `lateralYd` of him across and `depthYd` downfield. */
  | { readonly kind: 'uncovered'; readonly who: readonly FakeRole[]; readonly lateralYd: number; readonly depthYd: number }
  /** On the side of one man playing `outsideOf`, nobody is lined up more than `marginYd` outside him within `depthYd`. */
  | { readonly kind: 'edgeOpen'; readonly outsideOf: FakeRole; readonly marginYd: number; readonly depthYd: number }
  /** The defense does not match an overloaded side: fewer defenders than offensive men beyond `gapYd` on that side within `depthYd`. */
  | { readonly kind: 'outnumbered'; readonly gapYd: number; readonly depthYd: number }
  | { readonly kind: 'boxAtMost'; readonly count: number; readonly halfWidthYd: number; readonly depthYd: number };
