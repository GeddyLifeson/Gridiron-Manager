// The two talks to the team: before kickoff (I1.6.1) and after the game (I10.2.1). Both effects are small and
// depend on fit and honesty, never on a magic line or on any coach value (E9.1.3). The fit tables are data
// (talk-fit.json). Halftime talks use the pregame rules (I8.2.2) through `pregameTalk`.
import FIT from './talk-fit.json' with { type: 'json' };
import { gp } from './params.ts';
import { chance, clamp, type Draw } from './math.ts';

type PreContext = 'low_veteran' | 'low_young' | 'normal_veteran' | 'normal_young' | 'high_veteran' | 'high_young';
export type PregameTheme = 'calm_detailed' | 'emotional' | 'challenge_unit' | 'keys' | 'say_little' | 'player_speaks';
export type Stakes = 'low' | 'normal' | 'high';

const PRE = (FIT as unknown as { pregame: { themes: Record<PregameTheme, Record<PreContext, number>> } }).pregame.themes;

export const PREGAME_THEMES = Object.keys(PRE) as PregameTheme[];

export interface PregameTalkInput {
  /** 'none' when the user skipped it: a coordinator or captain speaks, neutral (I1.6.1 edge case). */
  readonly theme: PregameTheme | 'none';
  /** Stakes of the game (C3): a rivalry or elimination game is high. */
  readonly stakes: Stakes;
  /** Share of the room under 25 or in its first two seasons (L2 and D5 data), 0 to 1. */
  readonly youngShare: number;
  /** How many games in a row this theme has been used before today. */
  readonly sameThemeStreak: number;
  /** Keys named (up to three): whether each matches what the team practised this week. */
  readonly keys: readonly { readonly item: string; readonly matchesWeek: boolean }[];
}

export interface PregameTalkEffect {
  /** Starting z-shift on early-game assignment focus, within plus or minus `pretalk.boundZ`. */
  readonly focusZ: number;
  /** Items whose early readiness rises slightly (keys that match the week). */
  readonly readinessItems: readonly { readonly item: string; readonly z: number }[];
  /** L1 trust memory strength for keys that contradict the week (E10 consistency), 0 when none. */
  readonly trustStrength: number;
}

/** I1.6.1: the talk's effect. Fit from the table, shrunk by repetition, bounded. At most three keys count. */
export function pregameTalk(i: PregameTalkInput): PregameTalkEffect {
  const keys = i.keys.slice(0, 3);
  const readinessItems = keys.filter((k) => k.matchesWeek).map((k) => ({ item: k.item, z: gp('pretalk.keyReadinessZ') }));
  const trustStrength = keys.filter((k) => !k.matchesWeek).length * gp('pretalk.contradictTrust');
  if (i.theme === 'none') return { focusZ: 0, readinessItems, trustStrength };
  const ctx = `${i.stakes}_${i.youngShare >= 0.5 ? 'young' : 'veteran'}` as PreContext;
  let rep = 1;
  for (let k = 0; k < i.sameThemeStreak; k++) rep *= gp('pretalk.repeatFactor');
  const bound = gp('pretalk.boundZ');
  return { focusZ: clamp(PRE[i.theme][ctx] * bound * rep, -bound, bound), readinessItems, trustStrength };
}

/** I1.6.1: the shift decays linearly to zero by the end of the first quarter (game minutes from kickoff). */
export function pregameFocusAt(focusZ: number, gameMinute: number): number {
  const end = gp('pretalk.decayGameMin');
  return gameMinute >= end ? 0 : focusZ * (1 - (gameMinute < 0 ? 0 : gameMinute) / end);
}

// ---------------------------------------------------------------------------------------------- I10.2.1

export type PostgameTone = 'proud' | 'level' | 'demanding' | 'angry' | 'brief';
export type Situation = 'clean_win' | 'sloppy_win' | 'lazy_win' | 'upset_win' | 'close_loss_played_well' | 'loss_to_better_team' | 'sloppy_loss' | 'blowout_loss';
export type FitBand = 'good' | 'neutral' | 'poor';

const POST = (FIT as unknown as { postgame: { tones: Record<PostgameTone, Record<Situation, FitBand>> } }).postgame.tones;

/** What the players themselves saw (N2 summary): the input to fit. */
export interface GameSummary {
  readonly won: boolean;
  readonly margin: number;
  readonly expectation: 'favoured' | 'even' | 'underdog';
  /** Many penalties, turnovers or mental errors by the N2 summary. */
  readonly sloppy: boolean;
  /** Effort notes low by the staff grade (a lazy win). */
  readonly lowEffort: boolean;
  /** Point tags the game supports (for example 'penalties', 'turnovers', 'effort', 'defense_carried'). */
  readonly supports: readonly string[];
}

/** Classify the game the way the room saw it. Margins are game facts; the cut points are assumptions. */
export function situationOf(g: GameSummary): Situation {
  if (g.won) {
    if (g.expectation === 'underdog') return 'upset_win';
    if (g.sloppy) return 'sloppy_win';
    if (g.lowEffort) return 'lazy_win';
    return 'clean_win';
  }
  if (g.margin >= gp('situation.blowoutMargin')) return 'blowout_loss';
  if (g.sloppy) return 'sloppy_loss';
  if (g.margin <= gp('situation.closeMargin')) return 'close_loss_played_well';
  return g.expectation === 'favoured' ? 'sloppy_loss' : 'loss_to_better_team';
}

export interface PostgameCallout {
  readonly playerId: string;
  readonly seasons: number;
  readonly captain: boolean;
  /** D5: whether his profile responds to confrontation. */
  readonly respondsToConfrontation: boolean;
}

export interface PostgameTalkInput {
  readonly tone: PostgameTone;
  /** Up to two points from the game's list. A point the game does not support drops the fit one band. */
  readonly points: readonly string[];
  readonly game: GameSummary;
  /** Credibility 0 to 1 (L2). */
  readonly credibility: number;
  /** How many games in a row this tone has been used before today. */
  readonly sameToneStreak: number;
  readonly callouts: readonly PostgameCallout[];
  /** A player was seriously injured or the game clinched something: the composer narrows (edge cases). */
  readonly seriousInjury?: boolean;
  readonly clinched?: boolean;
}

export interface PostgameTalkEffect {
  readonly situation: Situation;
  readonly fit: FitBand;
  /** Team morale change in z, never beyond the cap (acceptance 1). */
  readonly moraleZ: number;
  /** Credibility change (L2); negative only for a poor fit. */
  readonly credibilityDelta: number;
  readonly callouts: readonly { readonly playerId: string; readonly tie: number; readonly effortZ: number }[];
}

/** Tones allowed by the edge cases: after a serious injury only level or brief; after a clinch only proud. */
export function allowedTones(seriousInjury: boolean, clinched: boolean): PostgameTone[] {
  if (seriousInjury) return ['level', 'brief'];
  if (clinched) return ['proud'];
  return ['proud', 'level', 'demanding', 'angry', 'brief'];
}

const lower = (b: FitBand): FitBand => (b === 'good' ? 'neutral' : 'poor');

/** I10.2.1: effect = cap x fit x credibility, with repetition at 0.7 per straight week; call-outs separately. */
export function postgameTalk(i: PostgameTalkInput): PostgameTalkEffect {
  const situation = situationOf(i.game);
  let fit = POST[i.tone][situation];
  for (const p of i.points.slice(0, 2)) if (!i.game.supports.includes(p)) fit = lower(fit);
  const f = fit === 'good' ? gp('posttalk.fitGood') : fit === 'neutral' ? gp('posttalk.fitNeutral') : gp('posttalk.fitPoor');
  let rep = 1;
  for (let k = 0; k < i.sameToneStreak; k++) rep *= gp('posttalk.repeatFactor');
  const cap = gp('posttalk.capZ');
  const moraleZ = clamp(cap * f * clamp(i.credibility, 0, 1) * rep, -cap, cap);
  const callouts = i.callouts.map((c) => ({
    playerId: c.playerId,
    tie: c.seasons >= gp('posttalk.calloutVeteranSeasons') || c.captain ? gp('posttalk.calloutVeteranTie') : gp('posttalk.calloutTie'),
    effortZ: c.respondsToConfrontation ? gp('posttalk.calloutEffortZ') : 0,
  }));
  return { situation, fit, moraleZ, credibilityDelta: fit === 'poor' ? gp('posttalk.poorFitCredibility') : 0, callouts };
}

/** I10.2.1 decay: halves by the middle of the week (day 3 of 7) and is gone by the next game (day 7). */
export function postgameMoraleAt(moraleZ: number, daysSince: number, daysToNextGame = 7): number {
  if (daysSince >= daysToNextGame) return 0;
  const mid = daysToNextGame / 2;
  if (daysSince <= mid) return moraleZ * (1 - 0.5 * (daysSince / mid));
  return moraleZ * 0.5 * (1 - (daysSince - mid) / (daysToNextGame - mid));
}

/** I10.2.1: a captain's short word after the coach, by the captain's leadership and the result. */
export function captainSpeaks(won: boolean, leadership: number, draw: Draw): boolean {
  const p = won ? gp('posttalk.captainWordWin') : gp('posttalk.captainWordLoss');
  return chance(p * clamp(leadership, 0, 1) * 2, draw);
}
