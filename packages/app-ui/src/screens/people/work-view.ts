// The parts of the delegation and meeting read models (app-services read-models/delegation and
// read-models/meeting) these screens show, and the intents they send back. Declared here because app-ui
// imports only the app-services entry point. No hidden value has a field here: an assistant's record is his
// products, morale is a word read, and the coach's word is the list of logged events (L1.3.2).
import TEXT from './work-text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const workTextIds = (): string[] => Object.keys(STRINGS);
export function wt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

type D = { readonly seasonYear: number; readonly dayIndex: number };
export const dayText = (d: D): string => `${d.seasonYear} day ${d.dayIndex}`;

// --- delegation (O4.3.2) -------------------------------------------------------------------------------------

export type Autonomy = 'decides' | 'proposes' | 'keeps';
export const AUTONOMIES: readonly Autonomy[] = ['decides', 'proposes', 'keeps'];
export type PresetId = 'ceo' | 'offense_caller' | 'defense_caller' | 'do_everything';

export interface UiTaskRecord { readonly products: number; readonly held: number; readonly replaced: number; readonly eventIds: readonly number[] }

export interface UiDelegationRow {
  readonly taskId: string; readonly side: string; readonly holderId: number | null; readonly holderName: string | null; readonly autonomy: Autonomy;
  readonly isDefault: boolean; readonly defaultOwnerId: number | null; readonly coachHours: number; readonly hoursSaved: number; readonly reviewStep: boolean;
  readonly record: UiTaskRecord | null; readonly candidates: readonly { readonly personId: number; readonly name: string }[]; readonly blockedKey: string | null;
}

export interface UiDelegation {
  readonly readOnly: boolean;
  readonly rows: readonly UiDelegationRow[];
  readonly staff: readonly { readonly personId: number; readonly name: string; readonly titleKey: string; readonly available: boolean; readonly loadHours: number; readonly capacityHours: number; readonly delegatedHours: number; readonly overloaded: boolean }[];
  readonly statements: readonly { readonly personId: number; readonly textKey: string; readonly eventId: number; readonly wants: 'more' | 'less' }[];
  readonly totals: { readonly budgetHours: number; readonly fixedHours: number; readonly taskHours: number; readonly projectedHours: number; readonly overBudget: boolean; readonly savedHours: number };
  readonly presets: readonly PresetId[];
}

export interface UiAssignment { readonly holderId: number | null; readonly autonomy: Autonomy }

export type DelegationIntent =
  | { readonly kind: 'saveDelegation'; readonly assignments: Readonly<Record<string, UiAssignment>> }
  | { readonly kind: 'preset'; readonly preset: PresetId };

// --- meetings (O4.4.2) and the staff one-on-one --------------------------------------------------------------

export type Stance = 'honest' | 'encouraging' | 'demanding' | 'promise' | 'hand_off';

export interface UiResponse {
  readonly responseId: string; readonly typeId: string; readonly approach: string; readonly stance: Stance; readonly sayKey: string; readonly minutes: number;
  readonly promiseType: string | null; readonly lieRisk: boolean; readonly beyondAuthority: boolean;
}

export interface UiPromiseRow {
  readonly promiseId: number; readonly toPersonId: number; readonly toName: string | null; readonly type: string; readonly madeOn: D; readonly due: D;
  readonly status: 'open' | 'kept' | 'broken' | 'released' | 'void' | 'left'; readonly overdue: boolean; readonly madeByAssistant: boolean; readonly beyondAuthority: boolean;
}

export interface UiWordRead { readonly textKey: string; readonly reasons: readonly { readonly textKey: string; readonly eventId: number }[]; readonly trend: 'up' | 'steady' | 'down' | null }

export interface UiMeeting {
  readonly subject: {
    readonly personId: number; readonly name: string; readonly roleKey: string; readonly mood: UiWordRead | null;
    readonly lastTalk: { readonly date: D; readonly typeId: string; readonly bandKey: string } | null; readonly imported: boolean;
    readonly openPromises: readonly UiPromiseRow[];
  } | null;
  readonly subjects: readonly { readonly typeId: string; readonly textKey: string; readonly major: boolean; readonly responses: readonly UiResponse[] }[];
  readonly tracker: readonly UiPromiseRow[];
  readonly honesty: { readonly kept: number; readonly broken: number; readonly caughtOut: number; readonly contradictedInPublic: number; readonly eventIds: readonly number[] };
  readonly mayPromise: boolean;
}

export interface UiStaffOneOnOne {
  readonly staffId: number; readonly name: string; readonly titleKey: string; readonly hours: number;
  readonly learned: readonly { readonly typeKey: string; readonly bucketKey: string; readonly chosenKey: string; readonly times: number; readonly of: number; readonly decisionIds: readonly string[] }[];
  readonly suggestions: readonly { readonly index: number; readonly typeKey: string; readonly bucketKey: string; readonly habitKey: string; readonly pickKey: string; readonly times: number; readonly of: number; readonly decisionIds: readonly string[] }[];
  readonly sheetSuggestions: readonly { readonly boxId: string; readonly callKey: string; readonly removedWeeks: number }[];
}

/** How the head coach answers a suggestion (L4.3.3 candor responses the core reads). */
export type SuggestionAnswer = 'accepted' | 'overruled_with_reason' | 'overruled_without_reason';

export const MEETING_TABS = ['player', 'staff', 'promises'] as const;
export type MeetingTab = (typeof MEETING_TABS)[number];

export type MeetingIntent =
  | { readonly kind: 'say'; readonly personId: number; readonly responseId: string }
  | { readonly kind: 'answerSuggestion'; readonly staffId: number; readonly index: number; readonly answer: SuggestionAnswer }
  | { readonly kind: 'answerSheetSuggestion'; readonly staffId: number; readonly boxId: string; readonly add: boolean }
  | { readonly kind: 'pickStaff'; readonly staffId: number }
  | { readonly kind: 'open'; readonly to: string };
