// After the game (I10): the handshake (I10.1.1), game balls (I10.2.2), the postgame injury update (I10.3.1),
// the news conference (I10.4.1), first notes (I10.5.1), the day after (I10.5.2), plays sent to the league
// office (I10.5.3) and the staff's film grading (I10.5.4). The postgame talk is talks.ts. Sizes of media and
// relationship effects belong to L6 and L1 (G-46); this module emits signed events for them.
import { gp } from './params.ts';
import { chance, clamp, intBetween, type Draw } from './math.ts';
import type { BreakableAct } from './roster.ts';

// ---------------------------------------------------------------------------------------------- I10.1.1

export type Manner = 'normal' | 'warm' | 'cold' | 'skipped';

export interface HandshakeInput {
  readonly own: Manner;
  readonly other: Manner;
  /** A tie already exists between the two coaches (former colleagues, same tree, shared school). */
  readonly tieExists: boolean;
  /** A provoking event happened (run-up score, ejection for a hit on a key player, a public remark that week). */
  readonly provoked: boolean;
  /** The game ended in a scuffle: the choice is skipped and league discipline follows (C11). */
  readonly scuffle?: boolean;
}

export interface HandshakeResult {
  /** Change to the L4 tie strength; 0 for normal or with no tie (warm). */
  readonly tieDelta: number;
  /** Whether media noticed it (it becomes a podium question). */
  readonly mediaNotice: boolean;
  /** One relationship event is written for a non-default choice (acceptance). */
  readonly writesEvent: boolean;
}

/** I10.1.1: a run-up in the provoking sense: a score or timeout while leading by 21 or more in the last 5 minutes. */
export function isRunUp(leadWhenActed: number, minutesLeft: number): boolean {
  return leadWhenActed >= gp('shake.runUpLead') && minutesLeft <= gp('shake.runUpLastMin');
}

export function handshake(i: HandshakeInput, draw: Draw): HandshakeResult {
  if (i.scuffle) return { tieDelta: 0, mediaNotice: false, writesEvent: false };
  let tieDelta = 0;
  if (i.own === 'warm' && i.tieExists) tieDelta = gp('shake.warmTie');
  if (i.own === 'cold') tieDelta = gp('shake.coldTie');
  let p = 0;
  if (i.own === 'skipped') p = gp('shake.noticeSkipped');
  else if (i.own === 'cold' && i.other === 'cold') p = gp('shake.noticeBothCold');
  else if (i.own === 'cold' || i.other === 'cold') p = i.provoked ? gp('shake.noticeProvoked') : gp('shake.noticeCalm');
  const mediaNotice = p > 0 && chance(p, draw);
  return { tieDelta, mediaNotice, writesEvent: i.own !== 'normal' && !(i.own === 'warm' && !i.tieExists) };
}

// ---------------------------------------------------------------------------------------------- I10.2.2

export interface BallReceiver {
  readonly id: string;
  readonly kind: 'player' | 'unit' | 'assistant' | 'staff';
  /** Lineman, special teams player, practice squad elevation, or backup who started (player only). */
  readonly lowProfile?: boolean;
  /** Weeks since this receiver last got a ball; null if never. */
  readonly weeksSinceLast?: number | null;
  readonly reason: string;
}

export interface RecognitionEvent {
  readonly receiver: string;
  readonly kind: BallReceiver['kind'];
  /** D12 role satisfaction gain (players) or L4 loyalty (assistant, staff); 0 for a unit (recorded only). */
  readonly gain: number;
  readonly reason: string;
}

export type BallRefusal = 'too_many' | 'loss_needs_milestone' | 'duplicate';

/**
 * I10.2.2: up to three balls after a win; after a loss only for a personal milestone. Each writes one
 * recognition event. A second ball within four weeks gives 0.6 of the gain.
 */
export function giveGameBalls(won: boolean, receivers: readonly BallReceiver[], milestone = false): RecognitionEvent[] | BallRefusal {
  if (receivers.length > gp('ball.max')) return 'too_many';
  if (!won && receivers.length > 0 && !milestone) return 'loss_needs_milestone';
  if (new Set(receivers.map((r) => r.id)).size !== receivers.length) return 'duplicate';
  return receivers.map((r) => {
    let gain = 0;
    if (r.kind === 'player') gain = r.lowProfile ? gp('ball.lowProfileGain') : gp('ball.starGain');
    if (r.kind === 'assistant' || r.kind === 'staff') gain = gp('ball.assistantLoyalty');
    if (r.weeksSinceLast !== undefined && r.weeksSinceLast !== null && r.weeksSinceLast < gp('ball.repeatWeeks')) gain *= gp('ball.repeatFactor');
    return { receiver: r.id, kind: r.kind, gain, reason: r.reason };
  });
}

/**
 * I10.2.2 rule 4: a player in his unit's top two by staff grade in two straight wins without a ball loses a
 * little. `streak` is consecutive wins he has been top two without a ball, counting today.
 */
export function passedOverLoss(streak: number): number {
  return streak >= gp('ball.passedOverWins') ? gp('ball.passedOverLoss') : 0;
}

/** I10.2.2 rule 6: a ball from the players to the head coach (a described reputation event, never a number). */
export function ballFromPlayers(won: boolean, coachStandingTopThird: boolean, notable: boolean, draw: Draw): boolean {
  return won && coachStandingTopThird && notable && chance(gp('ball.fromPlayersChance'), draw);
}

/** I10.2.2 default suggestion: one per side, plus special teams when a kick or return decided it. */
export function suggestedBallCount(kickDecided: boolean): number {
  return kickDecided ? gp('ball.max') : gp('ball.max') - 1;
}

// ---------------------------------------------------------------------------------------------- I10.3.1

export const INJURY_READS = ['day_to_day', 'imaging', 'likely_miss_time', 'serious'] as const;
export type InjuryRead = (typeof INJURY_READS)[number];

export interface GameInjury {
  readonly playerId: string;
  readonly bodyPart: string;
  /** The true category drawn at the injury (D11), revealed in steps. */
  readonly trueCategory: InjuryRead;
  readonly concussionEvaluation: boolean;
  readonly finishedGame: boolean;
  readonly hospital?: boolean;
}

export interface InjuryLine {
  readonly playerId: string;
  readonly bodyPart: string;
  /** The trainer's first read, or 'hospital' with no detail (edge case). */
  readonly firstRead: InjuryRead | 'hospital';
  readonly inProtocol: boolean;
  readonly finishedGame: boolean;
  /** Every concussion evaluation gets a follow-up exam the next day. */
  readonly followUpNextDay: boolean;
}

/** I10.3.1: read accuracy by medical staff tier. */
export function readAccuracy(tier: 'weak' | 'typical' | 'strong'): number {
  return tier === 'weak' ? gp('injury.readWeak') : tier === 'strong' ? gp('injury.readStrong') : gp('injury.readTypical');
}

/**
 * I10.3.1: every injury event appears; the first read is right in category with the tier's probability, else
 * one category off (toward the nearer end when at an end).
 */
export function injuryUpdate(injuries: readonly GameInjury[], tier: 'weak' | 'typical' | 'strong', draw: Draw): InjuryLine[] {
  const p = readAccuracy(tier);
  return injuries.map((j) => {
    let firstRead: InjuryLine['firstRead'] = j.trueCategory;
    if (j.hospital) firstRead = 'hospital';
    else if (!chance(p, draw)) {
      const k = INJURY_READS.indexOf(j.trueCategory);
      const up = k === 0 ? true : k === INJURY_READS.length - 1 ? false : draw() < 0.5;
      firstRead = INJURY_READS[up ? k + 1 : k - 1]!;
    }
    return { playerId: j.playerId, bodyPart: j.bodyPart, firstRead, inProtocol: j.concussionEvaluation, finishedGame: j.finishedGame, followUpNextDay: j.concussionEvaluation };
  });
}

// ---------------------------------------------------------------------------------------------- I10.4.1

export type QuestionTopic = 'decision' | 'benching' | 'injury' | 'opponent' | 'official_call' | 'direction' | 'handshake';

export interface GameEvent {
  readonly id: string;
  readonly topic: QuestionTopic;
  /** How unusual (0 to 1) and how costly (0 to 1) the event was. */
  readonly unusual: number;
  readonly cost: number;
  /** A decision the analytics view disagreed with (I5.11.1). */
  readonly analyticsDisagreed?: boolean;
  readonly playerId?: string;
}

export interface Question {
  readonly n: number;
  readonly eventId: string;
  readonly topic: QuestionTopic;
  readonly playerId?: string;
}

/**
 * I10.4.1: 4 to 8 questions, each citing a real event of the game (acceptance), drawn without replacement with
 * weight unusual x cost; a decision the analytics disagreed with weighs triple after a loss. With fewer events
 * than questions every event is asked about.
 */
export function drawQuestions(events: readonly GameEvent[], lost: boolean, draw: Draw): Question[] {
  const n = intBetween(gp('media.questionsFewest'), gp('media.questionsMost'), draw);
  const pool = [...events].sort((a, b) => a.id.localeCompare(b.id));
  const weight = (e: GameEvent) => (e.unusual * e.cost + 1e-6) * (lost && e.analyticsDisagreed ? gp('media.disagreedAfterLossWeight') : 1);
  const out: Question[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((s, e) => s + weight(e), 0);
    let r = draw() * total, k = 0;
    while (k < pool.length - 1 && r >= weight(pool[k]!)) { r -= weight(pool[k]!); k++; }
    const e = pool.splice(k, 1)[0]!;
    out.push({ n: out.length + 1, eventId: e.id, topic: e.topic, ...(e.playerId !== undefined ? { playerId: e.playerId } : {}) });
  }
  return out;
}

export type AnswerStyle = 'accountable' | 'protect_player' | 'deflect' | 'praise' | 'criticise_player' | 'criticise_officials' | 'criticise_self' | 'decline';

export interface Answer {
  readonly question: number;
  readonly style: AnswerStyle;
  /** For an injury question: what was said against the required disclosure (H5, C11). */
  readonly injuryDisclosure?: 'as_required' | 'beyond' | 'misstated';
}

export type MediaEffect =
  | { readonly kind: 'public_standing'; readonly sign: 1 | -1 }
  | { readonly kind: 'player_trust'; readonly playerId: string | null; readonly sign: 1 | -1 }
  | { readonly kind: 'room_memory'; readonly playerId: string | null }
  | { readonly kind: 'fine_risk'; readonly reason: 'officials' }
  | { readonly kind: 'media_mood'; readonly sign: 1 | -1 };

/** I10.4.1 answer effects: relationships and narrative only, never attributes; sizes are L6's and L1's. */
export function answerEffects(q: Question, a: Answer): { effects: MediaEffect[]; acts: BreakableAct[] } {
  const effects: MediaEffect[] = [];
  const acts: BreakableAct[] = [];
  const pid = q.playerId ?? null;
  switch (a.style) {
    case 'accountable': case 'criticise_self':
      effects.push({ kind: 'public_standing', sign: -1 }, { kind: 'player_trust', playerId: pid, sign: 1 }); break;
    case 'protect_player': effects.push({ kind: 'player_trust', playerId: pid, sign: 1 }); break;
    case 'praise': if (pid !== null) effects.push({ kind: 'player_trust', playerId: pid, sign: 1 }); break;
    case 'criticise_player':
      effects.push({ kind: 'public_standing', sign: 1 }, { kind: 'player_trust', playerId: pid, sign: -1 }, { kind: 'room_memory', playerId: pid }); break;
    case 'criticise_officials': effects.push({ kind: 'fine_risk', reason: 'officials' }); acts.push({ classId: 'media_policy', leaf: 'I10.4.1' }); break;
    case 'deflect': break;
    case 'decline': effects.push({ kind: 'media_mood', sign: -1 }); break;
  }
  if (q.topic === 'injury' && a.injuryDisclosure === 'misstated') acts.push({ classId: 'injury_report_shading', ...(pid !== null ? { playerId: pid } : {}), leaf: 'I10.4.1' });
  if (q.topic === 'injury' && a.injuryDisclosure === 'beyond') effects.push({ kind: 'player_trust', playerId: pid, sign: -1 });
  return { effects, acts };
}

export interface MediaSession {
  readonly held: boolean;
  readonly questions: readonly Question[];
  readonly answers: readonly Answer[];
  readonly effects: readonly MediaEffect[];
  readonly acts: readonly BreakableAct[];
}

/**
 * I10.4.1: the session. Skipping is a breakable act (media policy). Declining more than
 * `media.declineSoursAfter` times sours the media model once more.
 */
export function runMediaSession(questions: readonly Question[], answers: readonly Answer[] | 'skip'): MediaSession {
  if (answers === 'skip') return { held: false, questions: [], answers: [], effects: [], acts: [{ classId: 'media_policy', leaf: 'I10.4.1' }] };
  const effects: MediaEffect[] = [];
  const acts: BreakableAct[] = [];
  for (const a of answers) {
    const q = questions.find((x) => x.n === a.question);
    if (!q) continue;
    const r = answerEffects(q, a);
    effects.push(...r.effects); acts.push(...r.acts);
  }
  if (answers.filter((a) => a.style === 'decline').length > gp('media.declineSoursAfter')) effects.push({ kind: 'media_mood', sign: -1 });
  return { held: true, questions, answers, effects, acts };
}

/** I10.4.1: who the club must bring (head coach, quarterback, one other key player), never a concussed player. */
export function interviewArea(quarterback: string | null, keyPlayers: readonly string[], concussed: readonly string[]): string[] {
  const out: string[] = ['head_coach'];
  if (quarterback !== null && !concussed.includes(quarterback)) out.push(quarterback);
  const other = keyPlayers.find((p) => p !== quarterback && !concussed.includes(p));
  if (other !== undefined) out.push(other);
  return out;
}

// ---------------------------------------------------------------------------------------------- I10.5.1

export interface FirstNotes {
  readonly text: string;
  readonly mustSee: readonly string[];
  readonly unitRatings: Readonly<Record<string, number>>;
  /** Tags for resurfacing: this opponent, its coaches, the officials crew (E11). */
  readonly tags: readonly string[];
}

/** I10.5.1: at most five must-see plays; ratings from memory only (no assignment grades here). */
export function firstNotes(text: string, mustSee: readonly string[], unitRatings: Readonly<Record<string, number>>, tags: readonly string[]): FirstNotes {
  return { text, mustSee: mustSee.slice(0, 5), unitRatings, tags: [...new Set(tags)].sort() };
}

// ---------------------------------------------------------------------------------------------- I10.5.2

export type DayAfter = 'normal' | 'short' | 'off';
export type WeekType = 'normal' | 'short' | 'monday_game' | 'bye_next';

/** I10.5.2: which choices the screen shows. Short week: none. After a loss "off" is hidden (the coach can open it). */
export function dayAfterOptions(week: WeekType, won: boolean, showHidden = false): DayAfter[] {
  if (week === 'short') return [];
  return won || showHidden ? ['normal', 'short', 'off'] : ['normal', 'short'];
}

export interface DayAfterInput {
  readonly choice: DayAfter;
  readonly won: boolean;
  readonly sloppy: boolean;
  /** Victory Mondays granted in the last four weeks. */
  readonly offsInLastFourWeeks: number;
  /** Arrival home after a road game, hours after midnight (null when home or before midnight). */
  readonly arrivalHourAfterMidnight: number | null;
}

export interface DayAfterEffect {
  readonly correctionsEfficiency: number;
  readonly recoveryDays: number;
  readonly moraleZ: number;
  readonly credibilityDelta: number;
  /** Minutes of compressed corrections moved to Wednesday morning. */
  readonly wednesdaySessionMin: number;
  /** Hours the report time moves later after a late road return (and the lift is dropped). */
  readonly reportShiftH: number;
  readonly liftDropped: boolean;
}

export function dayAfter(i: DayAfterInput): DayAfterEffect {
  const late = i.arrivalHourAfterMidnight !== null && i.arrivalHourAfterMidnight >= gp('dayafter.lateReturnHour');
  const base = { reportShiftH: late ? gp('dayafter.lateReportShiftH') : 0, liftDropped: late };
  if (i.choice === 'normal') return { ...base, correctionsEfficiency: gp('dayafter.normalEfficiency'), recoveryDays: 0, moraleZ: 0, credibilityDelta: 0, wednesdaySessionMin: 0 };
  if (i.choice === 'short') return { ...base, correctionsEfficiency: gp('dayafter.shortEfficiency'), recoveryDays: gp('dayafter.shortRecoveryDays'), moraleZ: 0, credibilityDelta: 0, wednesdaySessionMin: 0 };
  let m = gp('dayafter.offMoraleZ');
  for (let k = 0; k < i.offsInLastFourWeeks; k++) m *= gp('dayafter.offRepeatFactor');
  const cred = !i.won || i.sloppy ? gp('dayafter.sloppyCredibility') : 0;
  return { ...base, correctionsEfficiency: gp('dayafter.offEfficiency'), recoveryDays: gp('dayafter.offRecoveryDays'), moraleZ: m, credibilityDelta: cred, wednesdaySessionMin: gp('dayafter.offWednesdayMin') };
}

// ---------------------------------------------------------------------------------------------- I10.5.3

export interface OfficeSubmission {
  readonly playId: string;
  readonly question: string;
}

export type OfficeReply = 'correct' | 'incorrect' | 'no_comment';

export interface OfficeTruth {
  /** Whether the officials' call on the play was right by the engine's record (B8, J10). */
  readonly callWasRight: boolean;
  /** The office cannot judge this play from its film. */
  readonly unjudgeable?: boolean;
}

/** I10.5.3 rule 5: the weekly cap; a play beyond it is refused. A level with no channel (0) refuses all. */
export function submitPlays(already: readonly OfficeSubmission[], add: readonly OfficeSubmission[], maxPlays: number): { accepted: OfficeSubmission[]; refused: OfficeSubmission[] } {
  const room = maxPlays - already.length;
  const fresh = add.filter((s) => !already.some((a) => a.playId === s.playId));
  return { accepted: fresh.slice(0, room > 0 ? room : 0), refused: fresh.slice(room > 0 ? room : 0) };
}

/** I10.5.3 rules 2, 3 and 10: one reply from the true record, wrong with the office error. No engine number leaves. */
export function officeReply(t: OfficeTruth, draw: Draw): OfficeReply {
  if (t.unjudgeable) return 'no_comment';
  const right = t.callWasRight;
  const flipped = chance(gp('office.error'), draw);
  return right !== flipped ? 'correct' : 'incorrect';
}

/** I10.5.3 rule 9: the change in a rule's foul hazard (z) for players shown the league video that week. */
export function videoFoulHazardZ(shown: boolean): number {
  return shown ? -gp('office.videoHazardZ') : 0;
}

// ---------------------------------------------------------------------------------------------- I10.5.4

export interface GradingLoad {
  readonly coachId: string;
  readonly playerSnaps: number;
  readonly minutesLow: number;
  readonly minutesHigh: number;
}

/** I10.5.4 rule 2: work per position coach: player-snaps at 0.5 to 1.0 minutes each. */
export function gradingLoad(coachId: string, snapsByPlayer: Readonly<Record<string, number>>): GradingLoad {
  const playerSnaps = Object.values(snapsByPlayer).reduce((s, n) => s + n, 0);
  return { coachId, playerSnaps, minutesLow: playerSnaps * gp('grade.minPerPlayerSnapLow'), minutesHigh: playerSnaps * gp('grade.minPerPlayerSnapHigh') };
}

/**
 * I10.5.4 rule 3: one staff grade for one player-snap. It matches the engine's result with the coach's hidden
 * observation quality (0 to 1; at 0 the grade is a coin flip); lost film multiplies the error by 1.5.
 */
export function staffGrade(trueWon: boolean, observation: number, lostFilm: boolean, draw: Draw): boolean {
  const worst = gp('grade.errorAtZero');
  let err = worst * (1 - clamp(observation, 0, 1));
  if (lostFilm) err = clamp(err * gp('grade.lostFilmErrorFactor'), 0, worst);
  return chance(err, draw) ? !trueWon : trueWon;
}

/** I10.5.4 rule 5: grading is dropped on a short week unless the head coach keeps starters only (3 planning hours). */
export function gradingPlan(week: WeekType, keepStarters: boolean): { graded: 'all' | 'starters' | 'none'; planningHoursLost: number } {
  if (week !== 'short') return { graded: 'all', planningHoursLost: 0 };
  return keepStarters ? { graded: 'starters', planningHoursLost: gp('grade.reducedShortWeekH') } : { graded: 'none', planningHoursLost: 0 };
}
