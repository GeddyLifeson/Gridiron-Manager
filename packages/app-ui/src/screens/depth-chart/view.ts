// The parts of the depth chart read model (app-services read-models/depth-chart) this screen shows, and
// the edits it sends back. Declared here because app-ui imports only the app-services entry point.
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const dcTextIds = (): string[] => Object.keys(STRINGS);
export function dt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export interface UiEntry { personId: number; name: string; position: string; out: boolean; active: boolean }
export interface UiJob { job: string; group: string; mapsTo: string | null; inherited: boolean; list: readonly UiEntry[]; onField: number | null }
export interface UiUnit {
  unitId: string; side: 'off' | 'def' | 'st'; base: string | null; core: boolean; jobs: readonly UiJob[]; gaps: readonly string[];
  shares: readonly { personId: number; share: number }[];
}
export interface UiBattle {
  unitId: string; job: string; decideBy: number; late: boolean; readinessPenalty: boolean;
  competitors: readonly { personId: number; name: string; split: number; reps: number; raw: number | null; weighted: number | null }[];
}
export interface DepthChartUi {
  clubId: number; week: number; locked: boolean; onField: number; units: readonly UiUnit[];
  problems: readonly { leaf: string; unitId: string; message: string }[];
  emergency: readonly { need: string; personId: number | null; name: string | null }[];
  specialTeams: readonly { personId: number; name: string; firsts: number }[];
  lowValueBackups: readonly number[]; battles: readonly UiBattle[]; simDepth: Readonly<Record<string, readonly number[]>>;
}

/** The roster the add and emergency pickers offer (name and position only). */
export interface UiRosterCard { personId: number; name: string; position: string }

export type DepthIntent =
  | { kind: 'move'; unitId: string; job: string; personId: number; toIndex: number }
  | { kind: 'add'; unitId: string; job: string; personId: number }
  | { kind: 'remove'; unitId: string; job: string; personId: number }
  | { kind: 'inherit'; unitId: string; job: string }
  | { kind: 'emergency'; need: string; personId: number | null }
  | { kind: 'decide_battle'; unitId: string; job: string; winner: number };

export const TABS = ['off', 'def', 'st', 'emergency', 'battles', 'problems'] as const;
export type Tab = (typeof TABS)[number];
