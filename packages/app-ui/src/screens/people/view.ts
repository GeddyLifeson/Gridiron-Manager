// The parts of the people read models (app-services read-models/people) these screens show, and the
// intents they send back. Declared here because app-ui imports only the app-services entry point, which
// re-exports the read models once the integrator adds the barrel line (CR-G72-4). Every value is a word,
// a grade a staff member assigned, a measured value or a fact: no true rating has a field here.
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const ppTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function pt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

/** Resolves a content text key from a read model (reads, reasons, goals); the host supplies it. */
export type TextOf = (key: string) => string;

type D = { readonly seasonYear: number; readonly dayIndex: number };
export const dateText = (d: D): string => pt('pp.date', { year: d.seasonYear, day: d.dayIndex });

export interface UiRead { readonly textKey: string; readonly reasons: readonly { readonly textKey: string; readonly eventId: number }[]; readonly trend: 'up' | 'steady' | 'down' | null }

export const CARD_TABS = ['overview', 'grades', 'performance', 'knowledge', 'health', 'person', 'history', 'notes'] as const;
export type CardTab = (typeof CARD_TABS)[number];

export type UiGrade =
  | { readonly state: 'graded'; readonly attribute: string; readonly text: string; readonly label: string; readonly confidence: string; readonly bandText: string; readonly grader: string; readonly n: number; readonly asOf: D }
  | { readonly state: 'unwatched'; readonly attribute: string; readonly text: string };

export interface UiHealthRow { readonly injuryId: number; readonly typeId: string; readonly bodyRegion: string; readonly designation: string | null; readonly returnDays: readonly [number, number] | null; readonly status: string; readonly occurred: D }

export interface UiCard {
  readonly personId: number; readonly clubId: number; readonly ownPlayer: boolean;
  readonly header: {
    readonly name: string; readonly jersey: number | null; readonly position: string; readonly altPositions: readonly string[]; readonly age: number | null;
    readonly heightIn: number | null; readonly weightLb: number | null; readonly experience: number | null; readonly status: string | null;
    readonly contract: { readonly years: number; readonly throughYear: number; readonly thisYearCents: number | null } | null;
    readonly designed: boolean; readonly imported: boolean;
  };
  readonly grades: readonly UiGrade[];
  readonly gradesNoteKey: string | null;
  readonly measured: readonly { readonly key: string; readonly value: number; readonly unit: string }[];
  readonly knowledge: readonly { readonly conceptId: string; readonly word: string; readonly lastPractised: D | null; readonly mentalErrors: readonly unknown[]; readonly readyThisWeek: boolean }[] | null;
  readonly health: {
    readonly current: readonly UiHealthRow[]; readonly history: readonly UiHealthRow[];
    readonly medical: { readonly clearance: string; readonly limits: readonly string[]; readonly reinjuryRiskKey: string; readonly loadBandKey: string } | null;
  };
  readonly person: {
    readonly rolePromisedKey: string | null; readonly roleGivenKey: string | null; readonly morale: UiRead | null; readonly trust: UiRead | null; readonly respect: UiRead | null;
    readonly openPromises: readonly { readonly promiseId: number; readonly subjectKey: string; readonly due: D | null }[];
    readonly personality?: readonly { readonly traitKey: string; readonly readKey: string; readonly confidenceKey: string }[];
    readonly standingKey: string | null; readonly meetings: readonly { readonly date: D; readonly subjectKey: string; readonly outcomeKey: string }[];
    readonly offField?: readonly { readonly eventId: number; readonly textKey: string }[];
  } | null;
  readonly notes: readonly { readonly date: D; readonly textKey: string; readonly byStaffId: number }[];
}

export interface UiRoster {
  readonly clubId: number; readonly lists: readonly string[];
  readonly rows: readonly { readonly personId: number; readonly name: string; readonly position: string; readonly list: string; readonly jersey: number | null; readonly age: number | null; readonly experience: number | null; readonly designation: string | null }[];
  readonly limits: readonly { readonly list: string; readonly limit: number | null; readonly count: number; readonly over: boolean }[];
  readonly subtotals: readonly { readonly position: string; readonly count: number; readonly planned: number | null }[];
  readonly requests: readonly { readonly requestId: number; readonly moveKey: string; readonly personId: number | null; readonly state: 'requested' | 'done' | 'refused'; readonly reasonKey: string | null }[];
}

export interface UiStaff {
  readonly clubId: number;
  readonly seats: readonly {
    readonly jobId: number; readonly catalogueId: string; readonly rung: number; readonly reportsToJobId: number | null; readonly holderPersonId: number | null;
    readonly holderName: string | null; readonly holding: string; readonly coveringPersonId: number | null; readonly coverCostKey: string | null;
  }[];
}

export interface UiCoachCard {
  readonly personId: number; readonly name: string; readonly catalogueId: string | null; readonly positionGroupTaught: string | null;
  readonly systems: readonly { readonly familyId: string; readonly seasons: number }[]; readonly background: readonly string[];
  readonly record: readonly { readonly key: string; readonly eventIds: readonly number[]; readonly labelKey: string | null }[]; readonly noBook: boolean;
  readonly relationship: { readonly trust: UiRead | null; readonly loyalty: UiRead | null } | null;
  readonly ambitionKeys: readonly string[];
  readonly contract: { readonly years: number; readonly throughYear: number; readonly thisYearCents: number | null } | null;
  readonly proposals: readonly { readonly taskKey: string; readonly date: D; readonly resultKey: string; readonly eventId: number }[];
}

export interface UiLockerRoom {
  readonly clubId: number;
  readonly groups: readonly { readonly kind: 'leaders' | 'followers' | 'clique' | 'isolated'; readonly leaderId: number | null; readonly memberIds: readonly number[] }[];
  readonly culture: UiRead | null; readonly buyIn: UiRead | null;
  readonly issues: readonly { readonly issueId: number; readonly kindKey: string; readonly personIds: readonly number[]; readonly sourcePersonId: number; readonly sourceKey: string; readonly reportedOn: D; readonly responseLinks: readonly string[] }[];
  readonly lostRoom: { readonly causeKeys: readonly string[] } | null;
}

export interface UiOwner {
  readonly clubId: number;
  readonly owner: { readonly personId: number | null; readonly name: string | null; readonly goalKeys: readonly string[]; readonly confidence: UiRead | null; readonly comments: readonly { readonly date: D; readonly textKey: string; readonly eventId: number }[]; readonly nextMeeting: D | null };
  readonly gm: {
    readonly personId: number | null; readonly name: string | null; readonly relationship: UiRead | null;
    readonly say: readonly { readonly moveKey: string; readonly holderKey: 'coach' | 'general_manager' | 'owner' | 'shared' }[];
    readonly requests: readonly { readonly requestId: number; readonly moveKey: string; readonly phaseKey: string; readonly state: 'requested' | 'approved' | 'refused' | 'done'; readonly reasonKey: string | null }[];
    readonly upcoming: readonly { readonly decisionKey: string; readonly toldKey: string | null }[];
  };
}

/** What the screens ask the host to do. The host turns each into an app-services command. */
export type PeopleIntent =
  | { kind: 'reevaluate'; personId: number }
  | { kind: 'note'; personId: number; text: string }
  | { kind: 'meeting'; personId: number; subjectKey: string }
  | { kind: 'open'; to: string };
