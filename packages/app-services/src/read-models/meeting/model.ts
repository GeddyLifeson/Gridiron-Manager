// Meeting and conversation screen (O4.4.2) on L1 (player conversations, promises, honesty), with the
// game-week staff one-on-one (Marlon 2026-11-26 07:08; K6, L4.3.3, H4). It shows what the coach knows
// going in, the responses he can give with their stance, and the ledger of what he has promised and
// what came of it. Outcomes are computed in the core (career players `holdConversation`); this read
// model only offers what is true or possible and flags the rest.
//
// Morale arrives only as the word read the world side made through D12.5 channels (practice notes, who
// stays after, a knock on the door), never a number. coach_word is never shown (L1.3.2): the honesty
// panel lists the logged events themselves (kept, broken, caught out), which the player saw too.
import { players } from '@gm/career';
import type { staff as staffNs } from '@gm/coach-ai';

type LedgerPromise = players.LedgerPromise;
type Role = players.Role;
type WordEvent = players.WordEvent;

export interface DateLike { readonly seasonYear: number; readonly dayIndex: number }
const cmp = (a: DateLike, b: DateLike): number => a.seasonYear - b.seasonYear || a.dayIndex - b.dayIndex;

export interface WordRead { readonly textKey: string; readonly reasons: readonly { readonly textKey: string; readonly eventId: number }[]; readonly trend: 'up' | 'steady' | 'down' | null }

/** Football-only subjects for imported real-roster players (A6, O4.4.2 edge case). */
export const FOOTBALL_SUBJECTS: readonly string[] = ['correction', 'injury_check', 'playing_time', 'praise', 'qb_weekly', 'role_definition'];
/** Conversation types where a promise can be attached (L1.3.1: role, snaps, touches). */
const PROMISE_SUBJECTS: Readonly<Record<string, readonly players.PromiseType[]>> = {
  role_definition: ['start', 'compete', 'position'],
  playing_time: ['snap_share', 'touches', 'targets', 'start'],
};

export type Stance = 'honest' | 'encouraging' | 'demanding' | 'promise' | 'hand_off';
const STANCE: Readonly<Record<players.Approach, Stance>> = { direct: 'honest', supportive: 'encouraging', challenging: 'demanding', delegate: 'hand_off' };

export interface MeetingSubject {
  readonly personId: number;
  readonly name: string;
  readonly roleKey: string;
  /** His role on the depth chart today (L1.2.2 role steps), for the lie-risk check on promises. */
  readonly depthChartRole: Role;
  readonly mood: WordRead | null;
  readonly lastTalk: { readonly date: DateLike; readonly typeId: string; readonly bandKey: string } | null;
  readonly imported: boolean;
  /** A position coach who can hold the talk for him (L1.2.1 delegate); null when there is none. */
  readonly positionCoachId: number | null;
}

export interface MeetingInputs {
  readonly userId: number;
  /** The user's rung (career players RUNGS) and whether the level has player contracts (L1.4.4). */
  readonly rung: string;
  readonly playerContracts: boolean;
  readonly today: DateLike;
  readonly subject: MeetingSubject | null;
  /** Every promise on the ledger the user answers for (made by him, or for him by an assistant). */
  readonly promises: readonly (LedgerPromise & { readonly toName?: string })[];
  /** coach_word log rows (L1.3.2), oldest first: events only. */
  readonly wordEvents: readonly WordEvent[];
}

export interface Response {
  readonly responseId: string;
  readonly typeId: string;
  readonly approach: players.Approach;
  readonly stance: Stance;
  /** What the coach says, as a content text key. */
  readonly sayKey: string;
  readonly minutes: number;
  readonly promiseType: players.PromiseType | null;
  /** The promise contradicts the depth chart today: saying it is a lie risk (O4.4.2 rules). */
  readonly lieRisk: boolean;
  /** Beyond his rung's authority: allowed and recorded, but not a promise he can be held to (L1.5.2). */
  readonly beyondAuthority: boolean;
}

export interface Subject { readonly typeId: string; readonly textKey: string; readonly major: boolean; readonly responses: readonly Response[] }

export interface PromiseRow {
  readonly promiseId: number;
  readonly toPersonId: number;
  readonly toName: string | null;
  readonly type: players.PromiseType;
  readonly madeOn: DateLike;
  readonly due: DateLike;
  readonly status: players.PromiseStatus;
  readonly overdue: boolean;
  readonly madeByAssistant: boolean;
  readonly beyondAuthority: boolean;
}

export interface HonestyRecord {
  readonly kept: number; readonly broken: number; readonly caughtOut: number; readonly contradictedInPublic: number;
  readonly eventIds: readonly number[];
}

export interface MeetingView {
  readonly subject: (MeetingSubject & { readonly openPromises: readonly PromiseRow[] }) | null;
  readonly subjects: readonly Subject[];
  readonly tracker: readonly PromiseRow[];
  readonly honesty: HonestyRecord;
  readonly mayPromise: boolean;
}

const ROLE_RANK = (r: Role): number => players.ROLE_STEPS.indexOf(r);

/** True when the promise says more than the depth chart supports today. */
function contradicts(type: players.PromiseType, role: Role): boolean {
  switch (type) {
    case 'start': return role !== 'starter';
    case 'snap_share': case 'touches': case 'targets': return ROLE_RANK(role) < ROLE_RANK('rotation');
    default: return false;
  }
}

function promiseRow(p: LedgerPromise & { readonly toName?: string }, userId: number, today: DateLike): PromiseRow {
  return {
    promiseId: p.id, toPersonId: p.toPersonId, toName: p.toName ?? null, type: p.type, madeOn: p.madeOn, due: p.due, status: p.status,
    overdue: p.status === 'open' && cmp(p.due, today) < 0, madeByAssistant: p.fromPersonId !== userId, beyondAuthority: p.beyondAuthority,
  };
}

function responsesFor(typeId: string, i: MeetingInputs, s: MeetingSubject): Response[] {
  const t = players.conversationType(typeId);
  const mayPromise = players.mayPromise(i.rung);
  const out: Response[] = [];
  for (const a of ['direct', 'supportive', 'challenging'] as const) {
    out.push({ responseId: `${typeId}:${a}`, typeId, approach: a, stance: STANCE[a], sayKey: `${t.textKey}.say.${a}`, minutes: t.minutes, promiseType: null, lieRisk: false, beyondAuthority: false });
  }
  for (const pt of PROMISE_SUBJECTS[typeId] ?? []) {
    out.push({
      responseId: `${typeId}:promise:${pt}`, typeId, approach: 'direct', stance: 'promise', sayKey: `${t.textKey}.say.promise.${pt}`, minutes: t.minutes,
      promiseType: pt, lieRisk: contradicts(pt, s.depthChartRole), beyondAuthority: !mayPromise,
    });
  }
  if (s.positionCoachId !== null && s.positionCoachId !== i.userId) {
    out.push({ responseId: `${typeId}:delegate`, typeId, approach: 'delegate', stance: 'hand_off', sayKey: `${t.textKey}.say.delegate`, minutes: 0, promiseType: null, lieRisk: false, beyondAuthority: false });
  }
  return out;
}

export function buildMeeting(i: MeetingInputs): MeetingView {
  const mine = i.promises.filter((p) => p.fromPersonId === i.userId || p.onBehalfOf === i.userId);
  const tracker = mine.map((p) => promiseRow(p, i.userId, i.today))
    .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || cmp(a.due, b.due) || a.promiseId - b.promiseId);
  const s = i.subject;
  const offered = s ? players.typesOffered(i.rung, i.playerContracts).filter((id) => !s.imported || FOOTBALL_SUBJECTS.includes(id)) : [];
  const subjects: Subject[] = s ? offered.map((typeId) => {
    const t = players.conversationType(typeId);
    return { typeId, textKey: t.textKey, major: t.major, responses: responsesFor(typeId, i, s) };
  }) : [];
  const count = (k: players.WordEventKind) => i.wordEvents.filter((e) => e.kind === k).length;
  return {
    subject: s ? { ...s, openPromises: tracker.filter((p) => p.toPersonId === s.personId && p.status === 'open') } : null,
    subjects,
    tracker,
    honesty: {
      kept: count('promise_kept'), broken: count('promise_broken'), caughtOut: count('caught_falsehood'), contradictedInPublic: count('public_contradicted'),
      eventIds: i.wordEvents.map((e) => e.sourceEventId),
    },
    mayPromise: players.mayPromise(i.rung),
  };
}

// --- staff one-on-one (Marlon 2026-11-26) -----------------------------------------------------------------

/** Labels for what the agenda names by id (decision types, situation buckets, option ids): content text keys from the host. */
export interface AgendaLabels {
  type(type: string): string;
  bucket(bucket: string): string;
  option(type: string, optionId: string): string;
}

export interface StaffOneOnOneView {
  readonly staffId: number;
  readonly name: string;
  readonly titleKey: string;
  /** Hours the meeting costs the head coach (E7.2.1 people.staffTalk, the long option). */
  readonly hours: number;
  readonly learned: readonly { readonly typeKey: string; readonly bucketKey: string; readonly chosenKey: string; readonly times: number; readonly of: number; readonly decisionIds: readonly string[] }[];
  readonly suggestions: readonly { readonly index: number; readonly typeKey: string; readonly bucketKey: string; readonly habitKey: string; readonly pickKey: string; readonly times: number; readonly of: number; readonly decisionIds: readonly string[] }[];
  /** Calls the staff would put back on the sheet that the head coach's edits keep taking out (the sheet bridge's staff draft). */
  readonly sheetSuggestions: readonly SheetSuggestion[];
}

/** One call-sheet suggestion from the staff-drafted sheet: the box, the call, and for how many weeks his edits took it out. */
export interface SheetSuggestion { readonly boxId: string; readonly callKey: string; readonly removedWeeks: number }

/** The one-on-one view. `hours` is the E7.2.1 long staff talk, passed in by the caller. `sheetSuggestions` come from the staff-drafted call sheet. */
export function buildStaffOneOnOne(
  member: { readonly personId: number; readonly name: string; readonly titleKey: string }, agenda: staffNs.OneOnOneAgenda, labels: AgendaLabels, hours: number,
  sheetSuggestions: readonly SheetSuggestion[] = [],
): StaffOneOnOneView {
  return {
    staffId: member.personId, name: member.name, titleKey: member.titleKey, hours,
    learned: agenda.learned.map((p) => ({ typeKey: labels.type(p.type), bucketKey: labels.bucket(p.bucket), chosenKey: labels.option(p.type, p.chosen), times: p.times, of: p.of, decisionIds: p.decisionIds })),
    suggestions: agenda.suggestions.map((s, index) => ({
      index, typeKey: labels.type(s.type), bucketKey: labels.bucket(s.bucket), habitKey: labels.option(s.type, s.yourHabit), pickKey: labels.option(s.type, s.hisPick),
      times: s.times, of: s.of, decisionIds: s.decisionIds,
    })),
    sheetSuggestions: [...sheetSuggestions].sort((a, b) => b.removedWeeks - a.removedWeeks || (a.boxId < b.boxId ? -1 : a.boxId > b.boxId ? 1 : 0)),
  };
}
