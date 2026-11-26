// The promise ledger (L1.3.1). Every promise has a machine-checkable test that runs at its due date; the
// warning before a breaking action fires before it commits; injury and the player's own discipline case
// void a promise. G-24 moves the ties of people who know of the outcome (people/relationships/promises.ts);
// this file judges kept, broken or void and writes the memories and the coach_word change.
import type { WorldDate } from '@gm/schema';
import { daysBetween } from './math.ts';
import { pp } from './params.ts';

/** Promise types and their tests (L1.3.1 starting set). */
export type PromiseType =
  | 'start' | 'snap_share' | 'touches' | 'targets' | 'compete' | 'position'
  | 'speak_to_gm' | 'redshirt' | 'no_redshirt' | 'hear_first';

/** What the promise measures. Each field is used only by the types that need it. */
export interface PromiseMeasure {
  /** snap_share: share 0 to 1 over `games`. touches/targets: per game over `games`. */
  readonly threshold?: number;
  readonly games?: number;
  /** position: the position key he lines up at. */
  readonly position?: string;
}

export type PromiseStatus = 'open' | 'kept' | 'broken' | 'released' | 'void' | 'left';

/** `{to, type, measurable, due, made_on, status}` (L1.3.1) plus who made it and at what rung (L1.5.2). */
export interface LedgerPromise {
  readonly id: number;
  readonly fromPersonId: number;
  readonly toPersonId: number;
  readonly type: PromiseType;
  readonly measure: PromiseMeasure;
  readonly madeOn: WorldDate;
  readonly due: WorldDate;
  readonly status: PromiseStatus;
  /** Position room key, for the conflict warning. */
  readonly room: string;
  /** Made by an assistant for the head coach: counts as the head coach's (L1.3.1 edge case). */
  readonly onBehalfOf: number | null;
  /** The maker's rung when made, and whether it was beyond his authority (L1.5.2). */
  readonly rung: string;
  readonly beyondAuthority: boolean;
  /** Entered at signing from recruiting (L1.5.1). */
  readonly fromRecruiting: boolean;
  /** Part of a path-back talk (L1.2.3): kept gives the +20 path-back memory instead of the plain +15. */
  readonly pathBack: boolean;
}

/** The facts the test reads at the due date, gathered by the caller from the game log and depth chart. */
export interface PromiseFacts {
  readonly startedOpeningSnap?: boolean;
  /** Per game, oldest first. */
  readonly snapShares?: readonly number[];
  readonly touchesPerGame?: readonly number[];
  readonly targetsPerGame?: readonly number[];
  readonly firstTeamPracticeReps?: number;
  /** Share of his snaps at the promised position. */
  readonly positionSnapShare?: number;
  readonly raisedInRosterMeeting?: boolean;
  readonly redshirted?: boolean;
  /** A role change posted before he was told. */
  readonly roleChangePostedBeforeTalk?: boolean;
  /** Void conditions (L1.3.1 rule 4). */
  readonly injured?: boolean;
  readonly ownDisciplineCase?: boolean;
}

function mean(xs: readonly number[] | undefined, n: number | undefined): number | null {
  if (!xs || xs.length === 0) return null;
  const tail = n === undefined ? xs : xs.slice(-n);
  if (n !== undefined && tail.length < n) return null;
  let s = 0;
  for (const x of tail) s += x;
  return s / tail.length;
}

/** The test of one promise against the facts: true kept, false broken, null when the facts are missing. */
export function testPromise(p: LedgerPromise, f: PromiseFacts): boolean | null {
  const m = p.measure;
  switch (p.type) {
    case 'start': return f.startedOpeningSnap ?? null;
    case 'snap_share': { const v = mean(f.snapShares, m.games); return v === null ? null : v >= (m.threshold ?? 0); }
    case 'touches': { const v = mean(f.touchesPerGame, m.games); return v === null ? null : v >= (m.threshold ?? 0); }
    case 'targets': { const v = mean(f.targetsPerGame, m.games); return v === null ? null : v >= (m.threshold ?? 0); }
    case 'compete': return f.firstTeamPracticeReps === undefined ? null : f.firstTeamPracticeReps >= pp('promise.competePractices');
    case 'position': return f.positionSnapShare === undefined ? null : f.positionSnapShare >= pp('promise.positionShare');
    case 'speak_to_gm': return f.raisedInRosterMeeting ?? null;
    case 'redshirt': return f.redshirted ?? null;
    case 'no_redshirt': return f.redshirted === undefined ? null : !f.redshirted;
    case 'hear_first': return f.roleChangePostedBeforeTalk === undefined ? null : !f.roleChangePostedBeforeTalk;
  }
}

export interface PromiseOutcome {
  readonly promise: LedgerPromise;
  readonly outcome: 'kept' | 'broken' | 'void' | 'pending';
  /** The holder's memory kind and the coach_word change; null when nothing is written. */
  readonly memoryKind: string | null;
  readonly wordChange: number;
}

/**
 * Run a promise's test (L1.3.1). Not yet due, or facts missing: pending. Injury or his own discipline case:
 * void with no penalty. Otherwise kept (+15 memory, coach_word +1) or broken (-30, coach_word -3).
 */
export function judgePromise(p: LedgerPromise, f: PromiseFacts, today: WorldDate): PromiseOutcome {
  if (p.status !== 'open') return { promise: p, outcome: 'pending', memoryKind: null, wordChange: 0 };
  if (f.injured || f.ownDisciplineCase) return { promise: { ...p, status: 'void' }, outcome: 'void', memoryKind: null, wordChange: 0 };
  if (daysBetween(p.due, today) < 0) return { promise: p, outcome: 'pending', memoryKind: null, wordChange: 0 };
  const r = testPromise(p, f);
  if (r === null) return { promise: p, outcome: 'pending', memoryKind: null, wordChange: 0 };
  if (r) return { promise: { ...p, status: 'kept' }, outcome: 'kept', memoryKind: p.pathBack ? 'path_back_honoured' : 'promise_kept', wordChange: pp('word.kept') };
  return { promise: { ...p, status: 'broken' }, outcome: 'broken', memoryKind: 'promise_broken', wordChange: pp('word.broken') };
}

/** The player lets the coach off in a later talk: no penalty (L1.3.1). */
export function releasePromise(p: LedgerPromise): LedgerPromise {
  return p.status === 'open' ? { ...p, status: 'released' } : p;
}

export interface LeftResult {
  readonly promises: LedgerPromise[];
  /** Players he recruited who get the small "left" memory; `transferTrigger` adds a T6 trigger. */
  readonly recruitMemories: { playerId: number; memoryKind: string; scale: number; transferTrigger: boolean }[];
}

/**
 * The coach is fired or leaves (L1.3.1 edge case, L1.5.1): open promises close as "left", players he
 * recruited take a small negative memory, larger and with a transfer trigger where players can transfer.
 */
export function closeOnLeaving(all: readonly LedgerPromise[], coachId: number, recruitedIds: readonly number[], playersCanTransfer: boolean): LeftResult {
  const promises = all.map((p) => (p.status === 'open' && (p.fromPersonId === coachId || p.onBehalfOf === coachId) ? { ...p, status: 'left' as const } : p));
  const scale = playersCanTransfer ? pp('promise.leftRecruitedTransferScale') : 1;
  return {
    promises,
    recruitMemories: recruitedIds.map((playerId) => ({ playerId, memoryKind: 'coach_left_recruit', scale, transferTrigger: playersCanTransfer })),
  };
}

/** Who answers for a promise: the head coach when an assistant made it for him (L1.3.1). */
export function answerableCoach(p: LedgerPromise): number {
  return p.onBehalfOf ?? p.fromPersonId;
}

export interface RoomWarning { readonly room: string; readonly open: number; readonly textKey: string }

/** More than five open promises in one position room: promises conflict (L1.3.1). */
export function roomWarnings(all: readonly LedgerPromise[]): RoomWarning[] {
  const count = new Map<string, number>();
  for (const p of all) if (p.status === 'open') count.set(p.room, (count.get(p.room) ?? 0) + 1);
  const out: RoomWarning[] = [];
  for (const [room, open] of [...count.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (open > pp('promise.roomWarnOver')) out.push({ room, open, textKey: 'players.promise.room_conflict' });
  }
  return out;
}

/** A planned depth chart or role change, before it commits. */
export interface PlannedChange {
  /** Players who will start the next game. */
  readonly starters: ReadonlySet<number>;
  /** Planned main position per player. */
  readonly positions: ReadonlyMap<number, string>;
  /** Players whose role drops in this change, and whether each has been told. */
  readonly roleDrops: ReadonlyMap<number, boolean>;
  /** The next game's date. */
  readonly nextGame: WorldDate;
}

export interface BreakWarning { readonly promiseId: number; readonly toPersonId: number; readonly type: PromiseType; readonly textKey: string }

/**
 * The warning before an action that would break a promise ("this depth chart breaks your word to #54",
 * L1.3.1). Runs before the change commits. The user may go ahead anyway: nothing here blocks.
 */
export function warnBeforeChange(all: readonly LedgerPromise[], plan: PlannedChange): BreakWarning[] {
  const out: BreakWarning[] = [];
  for (const p of all) {
    if (p.status !== 'open') continue;
    let breaks = false;
    if (p.type === 'start') breaks = daysBetween(plan.nextGame, p.due) === 0 && !plan.starters.has(p.toPersonId);
    else if (p.type === 'position') { const pos = plan.positions.get(p.toPersonId); breaks = pos !== undefined && pos !== p.measure.position; }
    else if (p.type === 'hear_first') breaks = plan.roleDrops.get(p.toPersonId) === false;
    if (breaks) out.push({ promiseId: p.id, toPersonId: p.toPersonId, type: p.type, textKey: 'players.promise.would_break' });
  }
  return out;
}

/** A stated starter who plays under 30 percent of snaps in two straight healthy games (L1.2.2 acceptance). */
export function starterCheckDue(healthySnapShares: readonly number[]): boolean {
  const n = pp('role.starterCheckGames');
  if (healthySnapShares.length < n) return false;
  return healthySnapShares.slice(-n).every((s) => s < pp('role.starterCheckSnapShare'));
}
