// The parts of the install board read model (app-services read-models/install) this screen shows, and the
// intents it sends back. Declared here because app-ui imports only the app-services entry point, which
// re-exports the read model once the integrator adds its barrel line. Shapes match the read model field
// for field; every knowledge figure is the staff's estimate (G5.4.1, MA-48).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const ibTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function ib(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export interface UiLock { allowed: boolean; heldBy: string | null; suggest: boolean }
export interface UiPeriod { kind: 'meeting' | 'film' | 'walkthrough' | 'practice'; label: string; minutes: number | null; reps: number | null }
export interface UiCard {
  unitId: string; label: string; kind: 'part' | 'play';
  groups: readonly { group: string; units: number }[]; load: number;
  periods: readonly UiPeriod[]; missing: readonly string[]; installed: boolean; alwaysUp: boolean;
  tray: 'unplaced' | 'day_removed' | null;
}
export interface UiLoad { group: string; units: number; limit: number; over: number; lostShare: number }
export interface UiDay { id: string; label: string; cards: readonly UiCard[]; load: readonly UiLoad[]; overloaded: boolean }
export interface UiLagger { player: number; name: string; position: string; estimate: number; errorChance: number; delayS: number }
export interface UiGroupReadiness { group: string; players: number; readiness: number; weakest: number; unjudged: boolean; laggers: readonly UiLagger[] }
export interface UiUnitReadiness { unitId: string; label: string; installed: boolean; groups: readonly UiGroupReadiness[] }
export interface InstallUi {
  teamId: number; side: 'offense' | 'defense' | 'special_teams'; mode: 'week' | 'camp';
  days: readonly UiDay[]; tray: readonly UiCard[]; readiness: readonly UiUnitReadiness[];
  order: readonly string[]; orderProblem: string | null;
  numbers: { threshold: number; dailyLimit: number; overLimitYield: number; shortWeek: boolean };
  totals: { placed: number; unplaced: number; installed: number };
  locks: { edit: UiLock };
}

/** What the screen asks the host to do; the host turns each into an app-services install command. A locked
 * control sends the same intent and the command layer turns it into a suggestion to the holder. */
export type InstallIntent =
  | { kind: 'place'; unitId: string; dayId: string | null }
  | { kind: 'fill' }
  | { kind: 'always_up'; unitId: string; on: boolean };

export const MODES = ['week', 'camp'] as const;
export type Mode = (typeof MODES)[number];
export const SIDES = ['offense', 'defense', 'special_teams'] as const;
export type Side = (typeof SIDES)[number];

/** D9.4.1 chance per snap as "about n in 100", rounded, never below 1 when it is above zero. */
export function per100(p: number): number {
  if (p <= 0) return 0;
  return Math.max(1, Math.round(p * 100));
}
