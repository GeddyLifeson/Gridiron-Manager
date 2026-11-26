// The staff's reports: the self-scout cycle (G8.5.1), the play caller's card (H2.2.2) and unscouted
// looks (H2.2.3).
import type { RandomStream } from '@gm/schema';
import { param } from './params.ts';
import { isPressure, runOrPass } from './cuts.ts';
import type { ExposedTendency } from './exposure.ts';
import type { ChartedPlay } from './types.ts';

// ---- G8.5.1 cadence and cost ----

export type ReportKind = 'quick' | 'study' | 'deep';

export interface ReportCost { readonly kind: ReportKind; readonly staffHours: number; readonly meetingMinutes: number; readonly games: number | 'season' | 'all' }

export function reportCost(kind: ReportKind): ReportCost {
  if (kind === 'quick') return { kind, staffHours: param('report.quickHours'), meetingMinutes: param('report.quickMeetingMinutes'), games: param('report.quickGames') };
  if (kind === 'study') return { kind, staffHours: param('report.studyHours'), meetingMinutes: 0, games: 'season' };
  return { kind, staffHours: param('report.deepHours'), meetingMinutes: 0, games: 'all' };
}

export interface CalendarPoint {
  readonly gamesPlayed: number;
  readonly byeWeek: boolean;
  /** The week before the postseason; with no bye, the larger study moves to the shortest week (edge case). */
  readonly beforePostseason: boolean;
  readonly offseason: boolean;
  /** Mid-season by the schedule (C2). */
  readonly midSeason: boolean;
}

/** G8.5.1 cadence defaults: quick after every game, a study after game 3, mid-season or the bye, and before the postseason; deep in the offseason. */
export function reportsDue(c: CalendarPoint): ReportKind[] {
  if (c.offseason) return ['deep'];
  const out: ReportKind[] = [];
  if (c.gamesPlayed > 0) out.push('quick');
  if (c.gamesPlayed === param('report.studyAfterGame') || c.byeWeek || c.midSeason || c.beforePostseason) out.push('study');
  return out;
}

/** Games a before-postseason study compares against the season (G8.5.1: last five). */
export function postseasonStudyGames(): number { return param('report.postseasonGames'); }

// ---- G8.5.1 the report ----

export interface ReportAuthor {
  /** Self-scout skill 0 to 1 (K6 staff value). Hidden from the user; he sees only the report. */
  readonly skill: number;
}

export interface RankedFinding { readonly tendency: ExposedTendency; readonly perceived: number }

/**
 * The ranking a staff author writes from the raw tables: the exposure score seen through noise that
 * falls with skill and grows when the report gets fewer hours than its kind needs. One normal draw per
 * tendency, in the given order. When the user is the author he writes the ranking himself and this is
 * not called (G8.5.1).
 */
export function writeReport(exposed: readonly ExposedTendency[], author: ReportAuthor, hoursGiven: number, kind: ReportKind, rng: RandomStream): RankedFinding[] {
  const s = Math.min(1, Math.max(0, author.skill));
  const base = param('report.noiseAtZeroSkill') + (param('report.noiseAtFullSkill') - param('report.noiseAtZeroSkill')) * s;
  const need = reportCost(kind).staffHours;
  const shortfall = need > 0 ? Math.max(0, 1 - hoursGiven / need) : 0;
  const sd = base * (1 + param('report.shortHoursPenalty') * shortfall);
  return exposed.map((t) => ({ tendency: t, perceived: t.score + sd * rng.normal() }))
    .sort((a, b) => b.perceived - a.perceived || (a.tendency.cell.key < b.tendency.cell.key ? -1 : 1));
}

// ---- H2.2.2 the play caller's card ----

export interface CardLine { readonly measure: string; readonly rate: number | null; readonly count: number; readonly of: number }

export interface CallerCard {
  readonly callerId: number;
  readonly career: readonly CardLine[];
  readonly season: readonly CardLine[];
  /** Games in the sample, with prior-team games counted (H2.2.2 acceptance). */
  readonly games: number;
  readonly priorTeamGames: number;
  /** First-time play caller: show his tree and system family only (edge case). */
  readonly noHistory: boolean;
}

type Line = { id: string; side: 'offense' | 'defense'; den: (p: ChartedPlay) => boolean; num: (p: ChartedPlay) => boolean };
const CARD_LINES: readonly Line[] = [
  { id: 'third_down_pressure', side: 'defense', den: (p) => p.down === 3 && p.rushers !== null, num: (p) => isPressure(p.rushers) === true },
  { id: 'play_action', side: 'offense', den: (p) => runOrPass(p.playKind) === 'pass', num: (p) => p.playKind === 'play_action' },
  { id: 'tempo', side: 'offense', den: () => true, num: (p) => p.tempo !== 'huddle' },
  { id: 'pass_when_behind', side: 'offense', den: (p) => p.scoreDiff < 0 && runOrPass(p.playKind) !== null, num: (p) => runOrPass(p.playKind) === 'pass' },
  { id: 'run_first_down', side: 'offense', den: (p) => p.down === 1 && runOrPass(p.playKind) !== null, num: (p) => runOrPass(p.playKind) === 'run' },
];

function lines(rows: readonly ChartedPlay[], wPrior: (p: ChartedPlay) => number): CardLine[] {
  return CARD_LINES.map((l) => {
    let w = 0, wn = 0, n = 0, k = 0;
    for (const p of rows) {
      if (p.side !== l.side || p.forced || p.lookOnly || !l.den(p)) continue;
      const pw = wPrior(p);
      w += pw; n++;
      if (l.num(p)) { wn += pw; k++; }
    }
    return { measure: l.id, rate: n ? wn / w : null, count: k, of: n };
  }).filter((x) => x.of > 0);
}

/**
 * H2.2.2: career tendencies over every game the coach called, prior teams weighted 0.5; this season on
 * its own beside it. Each line shows its sample. Game-management lines (fourth down, timeouts) come
 * from the decision log (G-31) and join this card on screen.
 */
export function callerCard(plays: readonly ChartedPlay[], callerId: number, currentTeamId: number, season: number): CallerCard {
  const his = plays.filter((p) => p.callerId === callerId);
  const wPrior = (p: ChartedPlay) => (p.teamId === currentTeamId ? 1 : param('weight.previousTeam'));
  const games = new Set(his.map((p) => p.gameId));
  const prior = new Set(his.filter((p) => p.teamId !== currentTeamId).map((p) => p.gameId));
  return {
    callerId,
    career: lines(his, wPrior),
    season: lines(his.filter((p) => p.season === season && p.teamId === currentTeamId), () => 1),
    games: games.size, priorTeamGames: prior.size, noHistory: his.length === 0,
  };
}

// ---- H2.2.3 unscouted looks ----

export interface UnscoutedLook { readonly concept: string; readonly priorRate: number | null; readonly from: 'caller_history' | 'system_family' }

/**
 * H2.2.3: concepts in the caller's prior seasons or the system family with zero appearances in this
 * season's breakdown. The likelihood shown is the prior usage rate; the real chance is the opponent
 * AI's (K3), never read here.
 */
export function unscoutedLooks(thisSeason: readonly ChartedPlay[], priorSeasons: readonly ChartedPlay[], systemFamily: readonly string[] = []): UnscoutedLook[] {
  const seen = new Set(thisSeason.map((p) => p.concept).filter((c): c is string => c !== null));
  const prior = new Map<string, number>();
  let total = 0;
  for (const p of priorSeasons) { if (p.concept === null || p.forced || p.lookOnly) continue; total++; prior.set(p.concept, (prior.get(p.concept) ?? 0) + 1); }
  const out: UnscoutedLook[] = [];
  for (const [c, n] of prior) if (!seen.has(c)) out.push({ concept: c, priorRate: n / total, from: 'caller_history' });
  for (const c of systemFamily) if (!seen.has(c) && !prior.has(c)) out.push({ concept: c, priorRate: null, from: 'system_family' });
  return out.sort((a, b) => (b.priorRate ?? -1) - (a.priorRate ?? -1) || (a.concept < b.concept ? -1 : 1));
}
