// The parts of the free agency read model (app-services read-models/free-agency) this screen shows, and
// the intents it sends back. Declared here because app-ui imports only the app-services entry point, which
// re-exports the read model once the integrator adds its barrel line.
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const faTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function ft(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export type UiGrade =
  | { state: 'graded'; text: string; label: string; confidence: string; bandText: string; grader: string; n: number; asOf: { seasonYear: number; dayIndex: number } }
  | { state: 'unwatched' };
export interface UiRange { low: number; mid: number; high: number }
export type Emphasis = 'role' | 'winning' | 'relationships' | 'scheme' | 'location';
export const EMPHASES: readonly Emphasis[] = ['role', 'scheme', 'winning', 'relationships', 'location'];

export interface UiMarketRow {
  personId: number; name: string; position: string; age: number; priorClubName: string; cls: string; rights: string; rightsReason: string;
  canSign: boolean; offerSheet: boolean; tenderLevel: string | null; grade: UiGrade; askYears: number; askApyCents: UiRange; askGuaranteeCents: UiRange;
  publicSuitors: number; saysHeWants: Emphasis | null; agentName: string | null; agentStance: string | null;
  offer: { years: number; apyCents: number; guaranteedCents: number; status: string } | null; agentRead: 'close' | 'talking' | 'far_apart' | null;
  call: { legal: boolean; reason: string; usesWindowCall: boolean; blockedByAgent: boolean };
}
export interface UiTenderOption { level: string; salaryCents: number | null; ok: boolean; reason: string | null }
export interface UiTagOption { kind: string; ok: boolean; reason: string | null }
export interface UiOwnRow {
  personId: number; name: string; position: string; age: number; cls: string; grade: UiGrade; tender: { level: string; salaryCents: number } | null;
  tenders: readonly UiTenderOption[]; tags: readonly UiTagOption[]; askYears: number; askApyCents: UiRange;
}
export interface FreeAgencyUi {
  clubId: number; authority: { field: string; authority: 'decide' | 'delegated' | 'advise'; holder: string };
  phase: 'before_window' | 'negotiating_window' | 'open'; firstWave: boolean; mayExecute: boolean;
  capRoomCents: number; committedCents: number; roomAfterOffersCents: number; rosterCount: number; rosterLimit: number;
  windowCallsUsed: number; windowCalls: number | null; market: readonly UiMarketRow[]; own: readonly UiOwnRow[]; tagsUsed: number;
}

/** What the screen asks the host to do. The host turns each into an app-services free agency command. */
export type FaIntent =
  | { kind: 'offer'; personId: number; years: number; apyCents: number; guaranteedCents: number }
  | { kind: 'call'; personId: number; emphasis: Emphasis; specificPromise: boolean }
  | { kind: 'tender'; personId: number; level: string }
  | { kind: 'tag'; personId: number; tag: string };

export const TABS = ['market', 'own'] as const;
export type Tab = (typeof TABS)[number];

/** Money in millions with one decimal, from cents ("$9.5M"); under a million in thousands. */
export function money(cents: number): string {
  const usd = cents / 100;
  if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(usd / 1000)}K`;
}
