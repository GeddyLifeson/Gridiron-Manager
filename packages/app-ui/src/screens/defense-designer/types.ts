// The defensive call designer view as the screen draws it. Same shapes as the read model in
// app-services/src/read-models/defense-designer/ (defenseDesignerView); app-ui imports only the
// app-services entry point, so the shapes are written here too (pattern of screens/analytics/types.ts).

export type Side = 'left' | 'right';
export type Severity = 'refuse' | 'rule_failure' | 'warning';
export interface PortRect { readonly y0: number; readonly y1: number; readonly d0: number; readonly d1: number }
export interface PortPlayer { readonly role: string; readonly px: number; readonly py: number; readonly onLine: boolean; readonly eligible: boolean }

export type RunFamilyId = 'insideZone' | 'wideZone' | 'power' | 'counter' | 'toss' | 'option';
export const RUN_FAMILY_IDS: readonly RunFamilyId[] = ['insideZone', 'wideZone', 'power', 'counter', 'toss', 'option'];

/** One responsibility, as words-ready parts: the screen turns `kind` into text and adds the parts. */
export interface DutyView { readonly kind: string; readonly gap: string | null; readonly side: Side | null; readonly target: string | null; readonly area: string | null; readonly technique: string | null; readonly delayS: number | null }

export interface DefenderView {
  readonly slot: string; readonly pos: string;
  /** Depth past the line (yd) and lateral from the midline, right-positive (yd). */
  readonly px: number; readonly py: number;
  readonly onLine: boolean;
  /** Technique label under the front's convention, linemen only. */
  readonly technique: string | null;
  /** Blocker the lineman aligns on (his key in a read front); null when the call does not set one. */
  readonly key: string | null;
  readonly gapControl: 'one' | 'two' | null;
  readonly runTo: DutyView | null;
  readonly runAway: DutyView | null;
  readonly pass: DutyView;
  /** Zone window for a zone dropper, for the canvas. */
  readonly zone: PortRect | null;
  readonly inBox: boolean;
  readonly conflict: boolean;
}

export interface GapLabelView { readonly side: Side; readonly gap: string; readonly y: number; readonly owners: readonly string[]; readonly flag: 'ok' | 'none' | 'double' }
export interface CheckRowView { readonly lookId: string; readonly lookName: string; readonly box: number; readonly checkId: string | null; readonly note: string | null }
export interface FindingView { readonly severity: Severity; readonly code: string; readonly lookId: string | null; readonly slot: string | null; readonly message: string; readonly ruleKey: string | null }
export interface LayerView {
  readonly package: string; readonly personnel: string;
  readonly front: string; readonly convention: string;
  readonly stunts: readonly string[];
  readonly pressure: { readonly name: string; readonly family: string } | null;
  readonly coverage: { readonly name: string; readonly shell: string };
  readonly checks: number;
  readonly disguise: { readonly shell: string; readonly moment: string } | null;
}
export interface HoursStripView { readonly usedH: number; readonly leftH: number; readonly owner: 'coach' | 'assistant'; readonly ownerName: string; readonly delegable: boolean }

export interface DefenseDesignerView {
  readonly callId: string; readonly callName: string;
  readonly status: string;
  readonly look: { readonly id: string; readonly name: string; readonly personnel: string };
  readonly looks: readonly { readonly id: string; readonly name: string }[];
  readonly field: { readonly halfWidthYd: number; readonly hashYd: number; readonly ballYd: number };
  readonly offense: readonly PortPlayer[];
  readonly motion: { readonly role: string; readonly toPy: number; readonly kind: string } | null;
  readonly strong: Side; readonly passStrong: Side;
  readonly defenders: readonly DefenderView[];
  readonly selected: string | null;
  readonly family: RunFamilyId;
  readonly gaps: readonly GapLabelView[];
  readonly box: number;
  readonly pressure: { readonly rushers: number; readonly family: string; readonly deep: number; readonly freeLeft: number; readonly freeRight: number; readonly hotUnanswered: readonly string[] };
  readonly uncovered: readonly string[];
  readonly checkApplied: { readonly id: string; readonly note: string } | null;
  readonly layers: LayerView;
  readonly checks: readonly CheckRowView[];
  /** Validator findings: those for the shown look first, then the call-wide ones, then other looks. */
  readonly findings: readonly FindingView[];
  readonly matchupNotes: readonly string[];
  readonly hours: HoursStripView | null;
}

