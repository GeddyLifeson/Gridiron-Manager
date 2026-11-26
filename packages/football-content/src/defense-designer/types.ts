// The defensive call object (G2.1.1) and its parts. A call is stored as RULES relative to the offense
// (G2.1.1: "never as fixed field positions, because the formation is unknown at design time"); resolve.ts
// turns it into eleven aligned defenders with one job each against any formation. Lateral values are
// authored right-positive from the offense's view (G1.1.1); compile.ts flips them once into the play frame.

export type Side = 'left' | 'right';
/** A side named by a declaration (G2.1.2): run strength, passing strength, field/boundary, or fixed. */
export type RelSide = Side | 'strong' | 'weak' | 'passStrong' | 'passWeak' | 'field' | 'boundary';
/** Blocker the lineman aligns on, counted outward from the center along the line: G, T, then Y (first man outside the tackle) and W (next one, or a wing). */
export type Blocker = 'C' | 'G' | 'T' | 'Y' | 'W';
export type Shade = 'inside' | 'head' | 'outside';
/** Gaps lettered A outward from the center (G2.2.2); E and beyond exist when the offense adds blockers. */
export type Gap = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Position = 'DE' | 'DT' | 'NT' | 'OLB' | 'ILB' | 'CB' | 'NB' | 'S';

export type Align =
  | { readonly kind: 'tech'; readonly blocker: Blocker; readonly shade: Shade; readonly side: RelSide }
  | { readonly kind: 'lb'; readonly gap: Gap | 'over'; readonly side: RelSide; readonly depthYd?: number }
  | { readonly kind: 'overhang'; readonly side: RelSide }
  | { readonly kind: 'rcv'; readonly n: number; readonly side: RelSide; readonly depthYd: number; readonly leverage: 'inside' | 'outside' | 'head' }
  | { readonly kind: 'deep'; readonly side: RelSide | 'middle'; readonly depthYd: number; readonly outsideHashYd: number }
  | { readonly kind: 'spot'; readonly px: number; readonly py: number };

export type ZoneArea = 'deepMiddle' | 'deepHalf' | 'deepThird' | 'deepQuarter' | 'insideQuarter' | 'flat' | 'curlFlat' | 'hook' | 'hole';
export type ManTarget = { readonly n: number; readonly side: RelSide } | 'back' | 'tightEnd';

export type Job =
  | { readonly kind: 'rush'; readonly gap: Gap; readonly side: RelSide; readonly delayS?: number }
  | { readonly kind: 'man'; readonly target: ManTarget; readonly technique?: 'press' | 'off' | 'bail' }
  | { readonly kind: 'zone'; readonly area: ZoneArea; readonly side?: RelSide }
  | { readonly kind: 'spy' };

export interface CallSlot {
  /** Letter (G2.1.2): renamable; the call's slots are addressed by it. */
  readonly id: string;
  readonly pos: Position;
  readonly align: Align;
  readonly job: Job;
  /** G2.2.2: one-gap attacks one gap, two-gap controls a blocker and plays both sides. */
  readonly gapControl?: 'one' | 'two';
  /** Teaching load units for this slot's job (G5). */
  readonly load?: number;
}

export interface Package {
  readonly id: string;
  readonly name: string;
  readonly dl: number;
  readonly lb: number;
  readonly db: number;
}

export type StrengthRule = 'tightEnd' | 'moreBlockers' | 'back' | 'field';
export interface Declarations {
  readonly runStrength: StrengthRule;
  /** Balanced formations (G2.1.2 edge case): field, the quarterback's throwing-arm side, or left. */
  readonly tie: 'field' | 'arm' | 'left';
  /** Slot that makes the strength call. */
  readonly caller: string;
}

export type TechConvention = 'oddOutside' | 'fiveHeadUp' | 'free';
export interface Front {
  readonly id: string;
  readonly name: string;
  readonly convention: TechConvention;
  /** Free-label mode: the user's label for each slot's alignment. */
  readonly labels?: Readonly<Record<string, string>>;
}

export type StuntKind = 'twist' | 'slant' | 'pinch' | 'loop';
export interface Stunt {
  readonly kind: StuntKind;
  readonly penetrator: string;
  readonly looper: string | null;
  readonly penetratorGap: Gap;
  readonly looperGap: Gap | null;
  readonly side: RelSide;
  readonly delayS: number;
  readonly downs: 'pass' | 'any';
}

export type PressureFamily = 'manFree' | 'allOut' | 'zone' | 'simulated';
export interface Pressure {
  readonly name: string;
  readonly family: PressureFamily;
  /** Rule for a man rusher whose man stays in to block (G2.3.2). */
  readonly blockedMan: 'greenDog' | 'peel';
}

export type MotionAnswer = 'lock' | 'switch' | 'track' | 'spin' | 'bump' | 'hold';
export interface MatchRule {
  readonly slot: string;
  /** Ordered triggers on one receiver's release; the first that fires sets the job (G2.4.2). */
  readonly triggers: readonly { readonly n: number; readonly side: RelSide; readonly release: Release; readonly job: 'man' | 'pass' }[];
  /** Fallback when nothing fires. */
  readonly otherwise: 'zone' | 'deep';
}
export type Release = 'vertical' | 'in' | 'out' | 'under';

export interface Coverage {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly shell: 'twoHigh' | 'oneHigh' | 'zeroHigh';
  readonly match: readonly MatchRule[];
  readonly motion: { readonly normal: MotionAnswer; readonly jet?: MotionAnswer; readonly teTrade?: MotionAnswer };
}

export type PullerAnswer = 'box' | 'spill' | 'dent';
export type RunFamily = 'insideZone' | 'wideZone' | 'power' | 'counter' | 'toss' | 'option';
export type FitJob = { readonly kind: 'gap'; readonly gap: Gap; readonly side: Side } | { readonly kind: 'force' | 'alley' | 'spill' | 'box' | 'bounce' | 'cutback' | 'pursuit' | 'passFirst'; readonly side: Side | null };
export interface RunFits {
  readonly onePuller: Readonly<Record<'strong' | 'weak', PullerAnswer>>;
  readonly twoPuller: Readonly<Record<'strong' | 'weak', PullerAnswer>>;
  /** User edits: family, then slot, then job; replaces the derived job. */
  readonly overrides: Readonly<Partial<Record<RunFamily, Readonly<Record<string, FitJob>>>>>;
}

export type Look = 'empty' | 'trips' | 'bunch' | 'stack' | 'unbalanced' | 'teWing' | 'heavy' | 'twoByTwo' | 'threeByOne' | 'motion';
export interface CheckPatch {
  readonly coverage?: Coverage;
  readonly cancelPressure?: boolean;
  readonly slots?: Readonly<Record<string, { readonly align?: Align; readonly job?: Job }>>;
}
export interface Check { readonly id: string; readonly when: readonly Look[]; readonly patch: CheckPatch; readonly note: string }

export interface Disguise {
  readonly shell: 'twoHigh' | 'oneHigh' | 'press' | 'blitzLook';
  readonly moment: 'snap' | 'late' | 'early';
  readonly positions: Readonly<Record<string, Align>>;
}

export type MatchupRule =
  | { readonly kind: 'sides'; readonly by: 'leftRight' | 'fieldBoundary' }
  | { readonly kind: 'travel'; readonly corner: string; readonly target: string; readonly priority: number }
  | { readonly kind: 'bracket'; readonly target: string; readonly outside: string; readonly inside: string; readonly dir: 'inOut' | 'underOver'; readonly priority: number }
  | { readonly kind: 'noHelp'; readonly corner: string; readonly target: string; readonly priority: number };

export interface RuleFailure { readonly ruleKey: string; readonly slot: string | null; readonly formationId: string | null; readonly message: string }

export interface DefensiveCall {
  readonly id: string;
  readonly name: string;
  readonly package: Package;
  readonly slots: readonly CallSlot[];
  readonly declarations: Declarations;
  readonly front: Front;
  readonly movement: { readonly stunts: readonly Stunt[]; readonly pressure: Pressure | null };
  readonly coverage: Coverage;
  readonly runFits: RunFits;
  readonly checks: readonly Check[];
  readonly disguise: Disguise | null;
  readonly matchups: readonly MatchupRule[];
  readonly tempo: { readonly isTempoCall: boolean; readonly word: string | null };
  readonly intent: { readonly beats: readonly string[]; readonly weakTo: readonly string[] };
  readonly source: 'starter' | 'user' | 'ai' | 'imported';
  readonly status: 'valid' | 'draft' | 'illegal_as_drawn';
  readonly ruleFailures: readonly RuleFailure[];
}

/** An offensive look on the board: players authored right-positive; px negative is the backfield. */
export interface OffPlayer { readonly role: string; readonly px: number; readonly py: number; readonly onLine: boolean; readonly eligible: boolean }
export interface OffMotion { readonly role: string; readonly toPy: number; readonly kind: 'normal' | 'jet' | 'teTrade'; readonly timeS: number }
export interface OffLook {
  readonly id: string;
  readonly name: string;
  readonly personnel: string;
  readonly players: readonly OffPlayer[];
  readonly motion: OffMotion | null;
}

/** Where the ball is and who throws: the board situation. */
export interface BoardSituation {
  /** Ball lateral from the midline, right-positive. */
  readonly ballYd: number;
  readonly qbArm: Side;
}
