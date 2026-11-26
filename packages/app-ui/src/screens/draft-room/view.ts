// The parts of the draft room read model (app-services read-models/draft-room) this screen shows, and the
// intents it sends back. Declared here because app-ui imports only the app-services entry point, which
// re-exports the read model once the integrator adds its barrel line.
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const drTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function dt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export type UiAuthority = 'decide' | 'delegated' | 'advise';
export type UiGrade =
  | { state: 'graded'; text: string; label: string; confidence: string; bandText: string; grader: string; n: number; asOf: { seasonYear: number; dayIndex: number } }
  | { state: 'unwatched' };
export type StanceKind = 'made' | 'mention' | 'recommend' | 'insist' | 'silent';
export type UiStance = { kind: 'made' } | { kind: 'mention' | 'recommend' | 'insist'; personId: number | null; trade: boolean } | { kind: 'silent' };

export interface UiClock { overall: number; round: number; inRound: number; kind: string; clubId: number; clubName: string; userOnClock: boolean; secondsLeft: number; limitSec: number; day: number }
export interface UiBoardLine {
  rank: number; personId: number; name: string; position: string; school: string | null; grade: UiGrade; potential: { text: string; evaluator: string } | null; consensusRank: number;
  taken: { overall: number; clubId: number; clubName: string } | null;
}
export interface UiPickLine { overall: number; round: number; inRound: number; clubId: number; clubName: string; personId: number; name: string; position: string; late: boolean; mine: boolean }
export interface UiHeldPick { pickId: string; year: number; round: number; overall: number | null; kind: string; status: string; fromClubName: string | null; locked: boolean }
export interface UiNeed { position: string; word: 'high' | 'some' | 'low'; frame: string; coachAsked: boolean }
export interface UiPickLabel { pickId: string; year: number; round: number; overall: number | null }
export interface UiOffer {
  id: string; withClubId: number; withClubName: string; give: readonly UiPickLabel[]; get: readonly UiPickLabel[]; giveTotal: number; getTotal: number;
  personnelLean: 'take' | 'pass'; beforeClockEnds: boolean;
}
export interface UiTicker { seq: number; atSec: number; kind: string; clubName: string | null; overall: number | null; personName: string | null; withClubName: string | null }
export interface UiLog { overall: number; personName: string; stance: StanceKind; decidedBy: string; late: boolean }

export interface DraftRoomUi {
  clubId: number; year: number;
  authority: { field: string; authority: UiAuthority; holder: string };
  clock: UiClock | null; waitingForDay: number | null; complete: boolean; userExpired: boolean;
  board: readonly UiBoardLine[]; lean: readonly { personId: number; name: string; position: string }[];
  picks: readonly UiPickLine[]; held: readonly UiHeldPick[]; needs: readonly UiNeed[]; offers: readonly UiOffer[];
  ticker: readonly UiTicker[]; log: readonly UiLog[]; stance: UiStance | null; insistsMade: number; nextInsist: 'full' | 'reduced';
}

/** What the screen asks the host to do. The host turns each into an app-services draft room command. */
export type DraftIntent =
  | { kind: 'pick'; personId: number }
  | { kind: 'voice'; strength: 'mention' | 'recommend' | 'insist'; personId: number; trade: boolean }
  | { kind: 'silent' }
  | { kind: 'answer_offer'; offerId: string; take: boolean }
  /** C7.3.1: between the club's picks, advance to the next relevant moment (the clock keeps running). */
  | { kind: 'advance' };

export const TABS = ['board', 'picks', 'offers'] as const;
export type Tab = (typeof TABS)[number];

/** Clock text, minutes and seconds. */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** The pick a user may act on now: on the clock, or an expired slot he may still fill (C7.3.1 rule 2). */
export const userMayAct = (v: DraftRoomUi): boolean => !!v.clock?.userOnClock || v.userExpired;
