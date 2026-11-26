// The parts of the cap sheet read model (app-services read-models/cap-sheet) this screen shows, and the
// intents it sends back. Declared here because app-ui imports only the app-services entry point, which
// re-exports the read model once the integrator adds its barrel line.
import TEXT from './text.json';
import { money } from '../career/text.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const capTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function ct(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
export { money };

export interface UiProvenance { key: string; factId: string | null; status: string | null }
export interface UiCharge { baseCents: number; prorationCents: number; rosterBonusCents: number; workoutBonusCents: number; likelyIncentivesCents: number; totalCents: number }
export type MoveKind = 'release' | 'release_june1' | 'trade';
export interface UiMove {
  kind: MoveKind; refused: string | null; deadThisYearCents: number; deadNextYearCents: number; guaranteedOwedCents: number;
  savingCents: number; roomAfterCents: number; chargeUntilJune2Cents: number | null;
}
export interface UiTranche { source: string; amountCents: number; paidLeagueYear: number; byYear: readonly { leagueYear: number; cents: number }[] }
export interface UiRookie { round: number | null; length: number; lengthSource: UiProvenance; increaseBreachYear: number | null }
export interface UiContract {
  contractId: number; personId: number; name: string; position: string; form: string; thisYear: UiCharge; countedInFull: boolean; countsCents: number;
  byYear: readonly { leagueYear: number; chargeCents: number }[]; lastLeagueYear: number; remainingProrationCents: number;
  tranches: readonly UiTranche[]; rookie: UiRookie | null; minimumSalaryCents: number; moves: readonly UiMove[];
}
export interface UiYear { leagueYear: number; capCents: number | null; capSource: UiProvenance; committedCents: number; deadCents: number; roomCents: number | null }
export interface UiOther { label: string; amountCents: number; kind: string }
export interface ProCapUi {
  level: 'pro'; clubId: number; leagueYear: number; phase: 'offseason' | 'season'; timing: 'on_or_before_june1' | 'after_june1';
  capCents: number; capSource: UiProvenance; adjustmentCents: number; teamSalaryCents: number; roomCents: number; countedInFull: number;
  topN: number; topNSource: UiProvenance; june1: { allowed: number; used: number; source: UiProvenance };
  prorationMaxYears: number; prorationSource: UiProvenance; years: readonly UiYear[]; rows: readonly UiContract[]; other: readonly UiOther[];
}
export interface UiPayLine { personId: number; name: string; position: string; amountCents: number }
export interface CollegeBudgetUi {
  level: 'college'; clubId: number; academicYear: number; tier: string; capCents: number; capSource: UiProvenance;
  scholarshipCreditCents: number; creditSource: UiProvenance; paymentRoomCents: number; schoolPoolCents: number; footballCents: number;
  reserveCents: number; reserveReleasedCents: number; aidLimit: number; aidSource: UiProvenance; reportThresholdCents: number; reportSource: UiProvenance;
  lines: readonly UiPayLine[]; totalCents: number; leftCents: number | null; refused: string | null; paidPlayers: number;
  byPosition: readonly { position: string; cents: number }[]; quarterbackShare: number;
}
export type CapUi = ProCapUi | CollegeBudgetUi;

/** What the screen asks the host to do. The host turns each into an app-services command (roster engine, college pay). */
export type CapIntent =
  | { kind: 'release'; contractId: number; june1: boolean }
  | { kind: 'shop'; contractId: number }
  | { kind: 'set_pay'; personId: number; amountCents: number };

export const TABS = ['contracts', 'years', 'dead'] as const;
export type Tab = (typeof TABS)[number];

/** Triple verification flag (Q6): only "Verified" passes. */
export const verified = (p: UiProvenance): boolean => p.status === 'Verified';
