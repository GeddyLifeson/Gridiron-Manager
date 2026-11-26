// Input shapes of the film screens (G-63). app-ui may import only the public entry of app-services
// (P1.2.1), which does not yet re-export the film read models, so the shapes the screens read are
// declared here structurally. The tests prove the app-services read-model data fits them. Request
// CR-G63-2 asks for the barrel line so these copies can go.

export type SideLike = 0 | 1;
export type CauseLike = 'physical' | 'technique' | 'mental' | 'communication' | 'alignment' | 'effort' | 'scheme' | 'freelance' | 'adjustment';
export type FieldSourceLike = 'call' | 'staff' | 'user' | 'uncharted';
export interface PointLike { readonly x: number; readonly y: number }

export interface FilmEventLike {
  readonly kind: 'snap' | 'throw' | 'catch' | 'drop' | 'tackle' | 'fumble' | 'flag' | 'whistle' | 'outOfBounds' | 'kickLanding';
  readonly tick: number; readonly x: number; readonly y: number; readonly slots?: readonly number[];
}

export interface OverlayLineLike { readonly slot: number; readonly words: string; readonly points: readonly PointLike[]; readonly author: string }

export interface BaseSetLike {
  readonly quarter: number; readonly odk: 'O' | 'D' | 'K'; readonly down: number | null; readonly distance: number | null;
  readonly yardLine: number; readonly hash: 'left' | 'middle' | 'right'; readonly gainLoss: number; readonly playType: string;
  readonly playDirection: 'left' | 'middle' | 'right' | null; readonly result: string; readonly motionDirection: string | null;
  readonly offFormation: string | null; readonly backfield: string | null; readonly offStrength: string | null; readonly series: number;
  readonly efficiency: boolean | null;
}

export interface CoachingSetLike { readonly values: Readonly<Record<string, string | null>>; readonly sources: Readonly<Record<string, FieldSourceLike>> }

/** The film record of one play as the filmPlay read model sends it (trajectory bytes as base64). */
export interface FilmRecordWireLike {
  readonly playId: string; readonly gameId: number; readonly playNumber: number; readonly kind: 'game' | 'practice';
  readonly teams: readonly [number, number]; readonly viewerSide: SideLike | null; readonly ticksPerSecond: number;
  readonly trajectory: { readonly formatVersion: number; readonly firstTick: number; readonly tickCount: number; readonly base64: string };
  readonly slots: readonly { readonly slot: number; readonly side: SideLike; readonly personId: number; readonly jersey: number; readonly role: string }[];
  readonly events: readonly FilmEventLike[];
  readonly situation: { readonly lineOfScrimmageX: number; readonly lineToGainX: number | null; readonly attackDir: 1 | -1; readonly offenseSide: SideLike };
  readonly base: BaseSetLike; readonly coaching: CoachingSetLike; readonly assignments: readonly OverlayLineLike[];
  readonly epa: number | null; readonly clockTenths: number; readonly offenseMargin: number;
}

export interface AnnotationLike {
  readonly playId: string; readonly tags: readonly string[]; readonly causeTags: readonly CauseLike[]; readonly note: string;
  readonly noteOverSoftLimit: boolean; readonly drawings: readonly { readonly shape: 'line' | 'circle' | 'arrow'; readonly points: readonly PointLike[] }[];
}

export interface BreakdownLike {
  readonly playId: string; readonly call: 'good' | 'neutral' | 'poor' | null;
  readonly execution: readonly { readonly personId: number; readonly won: boolean }[];
  readonly outcome: { readonly result: string; readonly yards: number; readonly epa: number | null; readonly visibleLuck: readonly string[] };
  readonly changedAtLine: boolean;
}

export interface ResponsibilityLike { readonly playId: string; readonly personId: number | null; readonly cause: CauseLike; readonly by: string }

export interface FilmPlayDataLike {
  readonly record: FilmRecordWireLike; readonly annotation: AnnotationLike;
  readonly breakdown: BreakdownLike | null; readonly responsibility: ResponsibilityLike | null;
}

export interface SnapMarkLike {
  readonly playId: string; readonly assignment: 'right' | 'wrong'; readonly technique: 'plus' | 'zero' | 'minus';
  readonly lostContest: boolean; readonly loaf: boolean; readonly loafCandidate: boolean; readonly note: string;
}
export interface GradeSheetLike {
  readonly gameId: number; readonly personId: number; readonly grader: string; readonly rows: readonly SnapMarkLike[];
  readonly snaps: number; readonly gameScore: number; readonly assignmentShare: number; readonly loafs: number; readonly zeroToFour: number;
  readonly comments: { readonly coachingPoints: string; readonly workOn: string; readonly summary: string };
}
export interface GradeSheetDataLike { readonly sheet: GradeSheetLike | null; readonly display: string; readonly scale: string }

export interface CorrectionLike {
  readonly id: string; readonly unit: 'offense' | 'defense' | 'special_teams'; readonly concept: string; readonly personIds: readonly number[];
  readonly cause: CauseLike; readonly count: number; readonly meanEpLost: number; readonly repeats: number; readonly priority: number;
  readonly fix: string; readonly forCoach: boolean; readonly state: 'open' | 'accepted' | 'dismissed'; readonly playIds: readonly string[];
}
export interface CorrectionsDataLike { readonly shown: readonly CorrectionLike[]; readonly more: readonly CorrectionLike[] }

export interface CutUpLike {
  readonly id: string; readonly title: string; readonly playIds: readonly string[]; readonly notes: Readonly<Record<string, string>>;
  readonly audience: { readonly kind: 'room' | 'player' | 'staff' | 'none'; readonly id: string | null };
  readonly unchartedPlays: number; readonly overAttention: boolean;
}
export interface CutUpsDataLike { readonly cutups: readonly CutUpLike[]; readonly templates: readonly { readonly id: string; readonly title: string }[] }

export interface PlayRowLike {
  readonly playId: string; readonly gameId: number; readonly playNumber: number; readonly teams: readonly [number, number];
  readonly base: BaseSetLike; readonly coaching: CoachingSetLike; readonly clockTenths: number; readonly tags: readonly string[];
  readonly slotsPersonIds: readonly number[];
}
export interface PlayListDataLike { readonly rows: readonly PlayRowLike[]; readonly total: number }

/**
 * What the film screens read and send. The shell supplies it from the read-model hub and the command
 * bus once the integrator wires the film read models (CR-G63-2).
 */
export interface FilmScreenSource {
  play(playId: string): FilmPlayDataLike;
  list(filterJson: string): PlayListDataLike;
  sheet(gameId: number, personId: number, scale: string): GradeSheetDataLike;
  corrections(gameId: number): CorrectionsDataLike;
  cutups(): CutUpsDataLike;
  /** Sends a film command (FilmTagPlay, FilmGradeSnap, ...). Throws with the reason when refused. */
  send(type: string, payload: unknown): void;
}
