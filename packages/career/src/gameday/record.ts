// The game-day records: pregame (I1.7.1), adjustments (I8.3.1 rows come from halftime.ts) and postgame
// (I10.6.1). Append-only blocks for the event log (P5): replaying the log rebuilds the same record. Hidden truth
// (true readiness, true kicking lines, truth grades) is kept beside the reported values and is shown only in
// the coaching school (N5); `careerView` strips it. Internal postgame items reach media only by a leak (L6).
import { gp } from './params.ts';
import { chance, type Draw } from './math.ts';
import type { TimelineEvent } from './timeline.ts';
import type { WorkoutReport } from './roster.ts';
import type { KickingLines } from './conditions.ts';
import type { TossResult, CaptainChoice } from './toss.ts';
import type { PregameTalkEffect, PostgameTalkEffect } from './talks.ts';
import type { AdjustmentRow } from './halftime.ts';
import type { HandshakeResult, RecognitionEvent, InjuryLine, MediaSession, FirstNotes, DayAfter, OfficeReply } from './postgame.ts';

export interface PregameRecord {
  readonly gameId: string;
  readonly rulesetId: string;
  /** The user's job and game-day role (S5.1.1); review shows only the decisions he owned. */
  readonly userRole: string;
  readonly timeline: readonly TimelineEvent[];
  readonly workouts: readonly { readonly report: WorkoutReport; readonly trueReadiness: number; readonly decision: 'active' | 'inactive' }[];
  readonly active: readonly string[];
  readonly inactive: readonly string[];
  readonly staffProposedActive: readonly string[];
  readonly emergencyQb: string | null;
  readonly radio: { readonly offense: readonly string[]; readonly defensePrimary: string | null; readonly defenseBackup: string | null };
  readonly kickingLines: KickingLines | null;
  readonly sheetEdits: readonly string[];
  readonly decisionBookAccepted: boolean;
  readonly instructions: readonly string[];
  readonly captains: CaptainChoice | null;
  readonly toss: TossResult | null;
  readonly talk: { readonly theme: string; readonly effect: PregameTalkEffect } | null;
  readonly challengeDesignee: string | null;
}

/** The pregame record as a career shows it: reported values only, the truth removed (I1.7.1, audit FR-33). */
export function pregameCareerView(r: PregameRecord): Omit<PregameRecord, 'workouts' | 'kickingLines'> & {
  workouts: readonly { report: WorkoutReport; decision: 'active' | 'inactive' }[];
  kickingLines: KickingLines['reported'] | null;
} {
  return {
    ...r,
    workouts: r.workouts.map((w) => ({ report: w.report, decision: w.decision })),
    kickingLines: r.kickingLines ? r.kickingLines.reported : null,
  };
}

/** The adjustment list as a career shows it: the staff verdict and visible results, truth grades removed. */
export function adjustmentCareerView(rows: readonly AdjustmentRow[]): Omit<AdjustmentRow, 'truth'>[] {
  return rows.map(({ truth: _t, ...rest }) => rest);
}

export interface PostgameRecord {
  readonly gameId: string;
  /** 1. Handshake choice of each coach and any media notice. */
  readonly handshake: { readonly own: string; readonly other: string; readonly result: HandshakeResult } | null;
  /** 2. Talk (internal). */
  readonly talk: { readonly tone: string; readonly points: readonly string[]; readonly effect: PostgameTalkEffect; readonly captainSpoke: boolean } | null;
  /** 3. Game balls (internal), and any ball given to the coach. */
  readonly gameBalls: readonly RecognitionEvent[];
  readonly ballToCoach: boolean;
  /** 4. Injury list as first reported. Later revisions are new rows (`revisions`), never edits. */
  readonly injuries: readonly InjuryLine[];
  readonly revisions: readonly InjuryRevision[];
  /** 5. Media session with the facts known at that moment. */
  readonly media: MediaSession | null;
  /** 6. First notes (private to the user). */
  readonly notes: FirstNotes | null;
  /** 7. Day-after choice. */
  readonly dayAfter: DayAfter | null;
  /** 8. Plays sent to the league and replies (appended later in the week). */
  readonly office: readonly { readonly playId: string; readonly reply: OfficeReply }[];
  /** 9. Grading summary (internal), appended when grades are done; empty on a short week with grading dropped. */
  readonly grading: Readonly<Record<string, string>> | null;
}

export interface InjuryRevision {
  readonly playerId: string;
  /** Index of the first-report row this revises. */
  readonly revises: number;
  readonly category: string;
  readonly when: string;
}

export function emptyPostgame(gameId: string): PostgameRecord {
  return { gameId, handshake: null, talk: null, gameBalls: [], ballToCoach: false, injuries: [], revisions: [], media: null, notes: null, dayAfter: null, office: [], grading: null };
}

/** Append a revised injury category as a new linked row; the first row is unchanged (I10.6.1 acceptance). */
export function reviseInjury(r: PostgameRecord, playerId: string, category: string, when: string): PostgameRecord {
  const revises = r.injuries.findIndex((l) => l.playerId === playerId);
  if (revises < 0) return r;
  return { ...r, revisions: [...r.revisions, { playerId, revises, category, when }] };
}

/** Internal items (talk, game balls, notes, grading) never appear in a media item without a leak event. */
export function mediaVisible(r: PostgameRecord, leaked: readonly ('talk' | 'gameBalls' | 'notes' | 'grading')[] = []): Partial<PostgameRecord> {
  const out: Partial<PostgameRecord> = { gameId: r.gameId, handshake: r.handshake, injuries: r.injuries, media: r.media, dayAfter: r.dayAfter };
  return {
    ...out,
    ...(leaked.includes('talk') ? { talk: r.talk } : {}),
    ...(leaked.includes('gameBalls') ? { gameBalls: r.gameBalls } : {}),
    ...(leaked.includes('notes') ? { notes: r.notes } : {}),
    ...(leaked.includes('grading') ? { grading: r.grading } : {}),
  };
}

export interface Contradiction {
  readonly kind: 'day_to_day_missed' | 'quarterback_change';
  readonly playerId: string | null;
  readonly gameId: string;
}

/**
 * I10.6.1 contradiction rule: a player called "day to day" who then misses 3 or more games, or a "no change at
 * quarterback" answer followed by a change within 2 weeks.
 */
export function findContradictions(r: PostgameRecord, missedGames: Readonly<Record<string, number>>, qbNoChangeAnswered: boolean, qbChangedWithinWeeks: number | null): Contradiction[] {
  const out: Contradiction[] = [];
  for (const l of r.injuries) {
    if (l.firstRead === 'day_to_day' && (missedGames[l.playerId] ?? 0) >= gp('record.dayToDayMissedGames')) out.push({ kind: 'day_to_day_missed', playerId: l.playerId, gameId: r.gameId });
  }
  if (qbNoChangeAnswered && qbChangedWithinWeeks !== null && qbChangedWithinWeeks <= gp('record.qbChangeWeeks')) out.push({ kind: 'quarterback_change', playerId: null, gameId: r.gameId });
  return out;
}

/** Reporters raise a contradiction at the next session with probability 0.5, more with an adversarial profile. */
export function raisedAtNextSession(adversarialBoost: number, draw: Draw): boolean {
  const p = gp('record.contradictionRaise') + adversarialBoost;
  return chance(p > 1 ? 1 : p, draw);
}
