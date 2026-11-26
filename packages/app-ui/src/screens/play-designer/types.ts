// The play designer read model as the screen draws it, and the commands it sends. Same shapes as
// app-services/src/play-designer (view.ts, session.ts); app-ui imports only the app-services entry
// point, so the shapes are written here too (the G-71 pattern).

export type Yd2 = readonly [depth: number, lateral: number];
export type HashSpot = 'left' | 'middle' | 'right';
export type DesignerTab = 'draw' | 'rules' | 'against' | 'bench' | 'notes';
export const DESIGNER_TABS: readonly DesignerTab[] = ['draw', 'rules', 'against', 'bench', 'notes'];
export type MessageLevel = 'refused' | 'illegal' | 'unsound' | 'note';
export type PartKind = 'personnel' | 'formation' | 'motion' | 'protection' | 'concept' | 'tags' | 'qb';
export type PointKind = 'through' | 'cut' | 'settle';

export interface MarkerView {
  readonly role: string; readonly letter: string; readonly at: Yd2; readonly onLine: boolean;
  readonly selected: boolean; readonly highlighted: boolean; readonly lineman: boolean;
  readonly path: readonly Yd2[]; readonly behavior: string; readonly routeName: string | null;
}
export interface MessageView {
  readonly level: MessageLevel; readonly code: string; readonly roles: readonly string[]; readonly citation: string;
  readonly leaf: string; readonly foul: string | null; readonly messageKey: string; readonly dismissed: boolean;
  readonly detail: string; readonly step: number | null;
}
export interface FieldLines { readonly sidelines: readonly [number, number]; readonly hashes: readonly [number, number]; readonly numbers: readonly [number, number] | null }
export interface PropertiesView {
  readonly role: string; readonly letter: string; readonly at: Yd2; readonly onLine: boolean; readonly readout: string;
  readonly stance: string; readonly reportsEligible: boolean; readonly extraTackle: boolean;
  readonly behavior: string; readonly behaviors: readonly string[]; readonly routeName: string | null; readonly pathPoints: number;
  readonly rules: readonly string[]; readonly keys: readonly string[]; readonly concept: string; readonly coachingPoint: string;
}
export interface BenchForm {
  readonly defenseIds: readonly string[]; readonly down: number; readonly distanceYd: number; readonly yardsToGoal: number;
  readonly hash: HashSpot; readonly runs: number; readonly seed: number; readonly knowledge: 'fully_installed' | 'current_readiness';
}
export interface RateView { readonly count: number; readonly of: number; readonly rate: number | null; readonly low: number | null; readonly high: number | null }
export interface BenchBlockView {
  readonly opponent: string; readonly runs: number;
  readonly yards: { readonly n: number; readonly mean: number | null; readonly low: number | null; readonly high: number | null };
  readonly histogram: { readonly minYd: number; readonly counts: readonly number[] };
  readonly completion: RateView; readonly pressure: RateView; readonly turnovers: RateView;
  readonly targets: Readonly<Record<string, number>>;
  readonly failures: readonly { readonly contest: string; readonly count: number }[];
  readonly samples: readonly number[];
}
export interface BenchReportView {
  readonly refusedBecause: string | null; readonly runsRequested: number; readonly runsDone: number; readonly partial: boolean; readonly seed: number;
  readonly overall: BenchBlockView | null; readonly byOpponent: readonly BenchBlockView[];
  readonly hourCharge: { readonly actionClass: string; readonly hours: number };
}
export interface HoursView {
  readonly usedThisWeekH: number; readonly leftThisWeekH: number; readonly warnAboveH: number;
  readonly owner: { readonly kind: 'coach' } | { readonly kind: 'assistant'; readonly name: string };
  readonly assistants: readonly { readonly id: string; readonly name: string }[];
}

export interface DesignerViewData {
  readonly playId: string; readonly tab: DesignerTab; readonly hash: HashSpot;
  readonly canvas: {
    readonly behindYd: number; readonly pastYd: number; readonly lines: FieldLines; readonly markers: readonly MarkerView[];
    readonly drawing: { readonly role: string; readonly target: 'path' | 'motion'; readonly points: readonly Yd2[]; readonly legYd: number | null } | null;
    readonly look: { readonly id: string; readonly markers: readonly { readonly label: string; readonly at: Yd2 }[] } | null;
    readonly motions: readonly { readonly index: number; readonly role: string; readonly path: readonly Yd2[] }[];
  };
  readonly parts: readonly { readonly kind: PartKind; readonly value: string; readonly options: readonly { readonly id: string; readonly label: string }[] }[];
  readonly properties: PropertiesView | null;
  readonly messages: readonly MessageView[];
  readonly counts: Readonly<Record<MessageLevel, number>>;
  readonly debounceMs: number;
  readonly missingPositions: readonly string[];
  readonly looks: readonly { readonly id: string; readonly label: string }[];
  readonly rules: {
    readonly kind: string; readonly personnel: string; readonly shotgun: boolean; readonly runDirection: string | null; readonly protection: string | null;
    readonly qb: { readonly action: string; readonly dropSteps: number; readonly readType: string; readonly progression: readonly { readonly role: string; readonly eyesAtS: number }[]; readonly throwAway: string };
    readonly intent: { readonly role: string; readonly beats: readonly string[]; readonly checkOutOf: readonly string[] };
    readonly status: string;
    readonly presnap: readonly { readonly index: number; readonly kind: 'shift' | 'motion'; readonly roles: readonly string[] }[];
    readonly ruleFailures: readonly { readonly ruleId: string; readonly role: string | null }[];
  };
  readonly notes: string;
  readonly dismissed: readonly { readonly code: string; readonly role: string | null; readonly reason: string }[];
  readonly editor: { readonly canUndo: boolean; readonly canRedo: boolean; readonly dirty: boolean; readonly versions: readonly { readonly n: number; readonly label: string }[]; readonly base: number };
  readonly publish: {
    readonly confirm: readonly MessageView[] | null; readonly refused: readonly MessageView[] | null;
    readonly last: { readonly version: number; readonly illegalAsDrawn: boolean; readonly newTeaching: readonly string[] } | null;
  };
  readonly hours: HoursView;
  readonly bench: { readonly available: boolean; readonly inGame: boolean; readonly defenses: readonly { readonly id: string; readonly label: string }[]; readonly form: BenchForm; readonly report: BenchReportView | null };
  readonly error: string | null;
}

/** Commands the screen sends (app-services `playDesigner.DesignerCommand`). `edit` carries a `designer.PlayEdit`. */
export type DesignerCommand =
  | { readonly type: 'edit'; readonly edit: { readonly type: string; readonly [k: string]: unknown } }
  | { readonly type: 'undo' } | { readonly type: 'redo' }
  | { readonly type: 'tab'; readonly tab: DesignerTab }
  | { readonly type: 'hash'; readonly hash: HashSpot }
  | { readonly type: 'select'; readonly role: string | null }
  | { readonly type: 'select_letter'; readonly letter: string }
  | { readonly type: 'select_next'; readonly step: 1 | -1 }
  | { readonly type: 'highlight'; readonly roles: readonly string[] }
  | { readonly type: 'look'; readonly id: string | null }
  | { readonly type: 'drag'; readonly role: string; readonly raw: Yd2; readonly free: boolean }
  | { readonly type: 'nudge'; readonly dDepth: number; readonly dLateral: number; readonly free: boolean }
  | { readonly type: 'toggle_line' }
  | { readonly type: 'draw_begin'; readonly target: 'path' | 'motion' }
  | { readonly type: 'draw_point'; readonly raw: Yd2; readonly kind: PointKind }
  | { readonly type: 'draw_leg_length'; readonly yd: number }
  | { readonly type: 'draw_leg'; readonly dir: number; readonly kind: PointKind }
  | { readonly type: 'draw_end'; readonly behavior: string | null; readonly free: boolean }
  | { readonly type: 'draw_cancel' }
  | { readonly type: 'set_behavior'; readonly behavior: string }
  | { readonly type: 'clear_path' }
  | { readonly type: 'remove_presnap'; readonly index: number }
  | { readonly type: 'mirror' }
  | { readonly type: 'choose_part'; readonly kind: PartKind; readonly id: string }
  | { readonly type: 'dismiss'; readonly code: string; readonly role: string | null; readonly reason: string }
  | { readonly type: 'restore_warning'; readonly code: string; readonly role: string | null }
  | { readonly type: 'notes'; readonly text: string }
  | { readonly type: 'publish'; readonly confirmIllegal: boolean }
  | { readonly type: 'cancel_publish' }
  | { readonly type: 'restore_version'; readonly n: number }
  | { readonly type: 'bench_form'; readonly patch: Partial<BenchForm> }
  | { readonly type: 'bench_run' }
  | { readonly type: 'delegate'; readonly assistantId: string };
