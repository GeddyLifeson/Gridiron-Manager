// The parts of the roster moves read model (app-services read-models/roster-moves) this screen shows,
// and the intents it sends back. Declared here because app-ui imports only the app-services entry
// point, which re-exports the read model once the integrator adds its barrel line (CR-G70-3).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const hasRmText = (id: string): boolean => Object.prototype.hasOwnProperty.call(STRINGS, id);
export const rmTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function rt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

type Level = 'ok' | 'amber' | 'red';
type Button = 'do_it' | 'ask';

export interface UiMarker { type: string; status: string; hoursLeft: number; target: string; button: Button | null }
export interface UiPlayer {
  personId: number; name: string; position: string; elevated: boolean; designation: string | null; out: boolean;
  quarterback: boolean; jobs: readonly string[]; specialTeamsFirsts: number; candidate: boolean; active: boolean;
}
export interface UiCoverage { unitId: string; role: string; starter: number | null; backup: number | null; emergency: number | null; level: Level }
export interface UiUnit { unitId: string; named: number; needed: number; level: Level }
export interface UiActive {
  actives: readonly number[]; emergencyQb: number | null; count: number; limit: number; linemenActive: number; minLinemen: number; floor: number;
  inactives: readonly number[]; refusal: { rule: string; message: string; fix: string } | null; locked: boolean; minutesToLock: number;
  redGaps: readonly string[]; amberGaps: readonly string[]; outDressed: readonly number[]; staffDraft: readonly number[];
  staffReasons: Readonly<Record<string, string>>; emergencyQbOffered: boolean;
}
export interface UiElevation { personId: number; name: string; position: string; used: number; left: number | null; elevated: boolean; blocked: string | null }
export interface RosterMovesUi {
  clubId: number; hasGameDayLimit: boolean; hasPracticeSquad: boolean;
  markers: readonly UiMarker[]; players: readonly UiPlayer[]; coverage: readonly UiCoverage[]; units: readonly UiUnit[];
  active: UiActive | null; elevations: { perGame: number; usedThisGame: number; rows: readonly UiElevation[] } | null;
  buttons: Readonly<Record<string, Button>>;
}

/** What the screen asks the host to do. The host turns each into an app-services command. */
export type RosterIntent =
  | { kind: 'set_active'; personId: number; active: boolean }
  | { kind: 'emergency_qb'; personId: number | null }
  | { kind: 'use_staff_list' }
  | { kind: 'submit_list'; confirmedGaps: string[] }
  | { kind: 'elevate'; personId: number };

export const TABS = ['strip', 'active_list', 'elevations'] as const;
export type Tab = (typeof TABS)[number];
