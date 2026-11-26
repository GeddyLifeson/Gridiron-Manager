// The parts of the office read model (app-services read-models/home) these screens show, and the intents
// they send back (CR-G72-4: the integrator re-exports the read model from the app-services entry point).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const ofTextIds = (): string[] => Object.keys(STRINGS);
export function ot(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
export type TextOf = (key: string) => string;

type D = { readonly seasonYear: number; readonly dayIndex: number };
export const dateText = (d: D): string => ot('of.date', { year: d.seasonYear, day: d.dayIndex });
export const minutesText = (n: number): string => ot('of.minutes', { h: Math.trunc(n / 60), m: Math.abs(n % 60) });

export type AdvanceTarget = 'next_block' | 'end_of_day' | 'next_must' | 'game_day';

export interface UiHome {
  readonly personId: number;
  readonly today: {
    readonly date: D; readonly phaseKey: string; readonly dayLabelKey: string | null; readonly daysToGame: number | null;
    readonly opponent: { readonly teamId: number; readonly name: string } | null; readonly mode: 'normal' | 'game_day' | 'empty';
    readonly blocks: readonly {
      readonly blockId: string; readonly labelKey: string; readonly startMinute: number; readonly minutes: number; readonly runBy: 'coach' | 'delegate';
      readonly coachMinutes: number | null; readonly delegateName: string | null; readonly delegateNoteKey: string | null; readonly requiredByRule: boolean; readonly screenId: string | null;
    }[];
    readonly nextEvent: { readonly date: D; readonly labelKey: string } | null;
    readonly minutesLeftThisWeek: number; readonly energyKey: string | null;
  };
  readonly inbox: readonly {
    readonly itemId: number; readonly weight: 'must' | 'should' | 'note'; readonly senderId: number | null; readonly senderName: string | null; readonly subjectKey: string;
    readonly deadline: D | null; readonly answerCommand: string | null; readonly defaultCommand: string | null; readonly links: readonly string[]; readonly unread: boolean;
    readonly answerMinutes: number | null; readonly conflictsWith: readonly number[];
  }[];
  readonly advance: readonly {
    readonly target: AdvanceTarget; readonly to: { readonly date: D; readonly minute: number } | null; readonly blockedBy: readonly number[];
    readonly runsWithout: readonly { readonly blockId: string; readonly labelKey: string; readonly date: D; readonly byName: string | null }[];
  }[];
}

export type HomeIntent =
  | { kind: 'open'; screenId: string }
  | { kind: 'answer'; itemId: number }
  | { kind: 'read'; itemId: number }
  | { kind: 'advance'; target: AdvanceTarget };
