// Player-to-coach pipeline (D13.3.5 rules 3a and 4, X11.1.2, S11.2.1). Players who leave football are
// the main source of new coaches, as in real football (F-pipeline-0001: a quarter to a third of NFL head
// coaches played in the NFL; nearly all played in college). Each former player decides once, when he
// leaves, whether he wants to coach. The chance starts from his level (pro or college) and moves with his
// position (F-pipeline-0002: quarterbacks coach far more than linemen), D4 football intelligence, D5
// leadership, his love of the game, a `coach_after_playing` goal, and the length of his pro career.
// Those who want to coach wait a few seasons for a first chair at the bottom rungs (graduate assistant,
// quality control; a long pro career can start at assistant position coach) and are hired through the
// head coach's normal search, where having played for that coach or his staff counts as a tie (rule 4).
// The chance is a hidden draw on truth values; the hiring side sees only the public playing record.
import { DMATH, stream } from '@gm/engine-core';
import type { PersonRecord } from '@gm/schema';
import type { LiveWorld } from '../loop/types.ts';
import { ageIn } from './binding.ts';
import { param } from './params.ts';

export const STREAM_PIPELINE = 'world.turnover.pipeline';

export type PlayedGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST';

const GROUP_OF: Readonly<Record<string, PlayedGroup>> = {
  QB: 'QB', RB: 'RB', FB: 'RB', HB: 'RB', WR: 'WR', TE: 'TE', C: 'OL', G: 'OL', T: 'OL', OL: 'OL', OT: 'OL', OG: 'OL',
  DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', EDGE: 'DL', ILB: 'LB', MLB: 'LB', OLB: 'LB', LB: 'LB',
  CB: 'DB', FS: 'DB', SS: 'DB', S: 'DB', DB: 'DB', K: 'ST', P: 'ST', LS: 'ST',
};

/** Position group of a position code; unknown codes count as the roster middle (odds 1). */
export function playedGroup(position: string): PlayedGroup | null {
  return GROUP_OF[position.toUpperCase()] ?? null;
}

/** Highest level a person played at in the world, from his counters (pro seasons, then college seasons). */
export function levelPlayed(p: PersonRecord): 'pro' | 'college' | null {
  const e = p.playing?.eligibility;
  if (!e) return null;
  if (e.pro.seasonsOnRoster > 0) return 'pro';
  if (e.college.seasonsOfCompetitionUsed > 0) return 'college';
  return null;
}

const logit = (x: number): number => DMATH.log(x / (1 - x));
const z = (v: number | undefined): number => ((v ?? 50) - 50) / 10;

/**
 * The chance a player who has just left football wants to coach. Log odds = the level's base + the
 * position's odds + slopes on football intelligence, leadership and love of football (per 10 points from
 * the middle) + the goal + pro seasons past the mean career. A person who never played returns 0.
 */
export function wantsToCoachChance(p: PersonRecord): number {
  const level = levelPlayed(p);
  if (level === null || !p.playing) return 0;
  const base = param(level === 'pro' ? 'pipeline.proBase' : 'pipeline.collegeBase');
  const g = playedGroup(p.playing.position);
  let x = logit(base) + (g === null ? 0 : DMATH.log(param(`pipeline.pos.${g}`)));
  x += param('pipeline.iqSlope') * z(p.playing.attributes['football_intelligence']);
  x += param('pipeline.leadershipSlope') * z(p.traitBlock.facets['leadership']);
  x += param('pipeline.loveSlope') * z(p.traitBlock.facets['love_of_football']);
  if (p.traitBlock.goals.some((gl) => gl.goalId === 'coach_after_playing' && gl.status === 'active')) x += DMATH.log(param('pipeline.goalOdds'));
  if (level === 'pro') x += param('pipeline.proSeasonSlope') * (p.playing.eligibility.pro.seasonsOnRoster - param('pipeline.proSeasonsMean'));
  return DMATH.logistic(x);
}

/** One draw per person for life: the same answer whichever season or step asks (D13.3.5 rule 3a). */
export function wantsToCoach(world: LiveWorld, p: PersonRecord): boolean {
  const chance = wantsToCoachChance(p);
  return chance > 0 && stream(world.seed, STREAM_PIPELINE, ['wants', p.id]).chance(chance);
}

/** Highest rung a former player can start at: graduate assistant for college players, quality control for pro players, assistant position coach after a long pro career. */
export function entryRungMax(p: PersonRecord): number {
  const level = levelPlayed(p);
  if (level !== 'pro') return param('pipeline.collegeEntryRung');
  return (p.playing?.eligibility.pro.seasonsOnRoster ?? 0) >= param('pipeline.veteranSeasons') ? param('pipeline.veteranEntryRung') : param('pipeline.proEntryRung');
}

export interface FormerPlayer { readonly id: number; readonly maxRung: number }

/**
 * Former players waiting for a first coaching chair: left football within the wait window, alive,
 * young enough, and wanting to coach. Sorted by id. The user is never a candidate.
 */
export function waitingFormerPlayers(world: LiveWorld, season: number): FormerPlayer[] {
  const out: FormerPlayer[] = [];
  for (const [id, since] of world.outOfFootballSince) {
    // X12.1.3 rule 1 makes a retired player inactive at the season point; a hire brings him back (`reactivate`).
    if (since < season - param('pipeline.waitSeasons') || id === world.userPersonId || world.status.get(id) === 'deceased') continue;
    const p = world.people.get(id);
    if (!p || !p.roles.includes('player') || p.roles.includes('coach')) continue;
    if (ageIn(p, season) > param('coach.formerPlayerMaxAge')) continue;
    if (!wantsToCoach(world, p)) continue;
    out.push({ id, maxRung: entryRungMax(p) });
  }
  return out.sort((a, b) => a.id - b.id);
}

/**
 * Seasons each player spent on a roster with each coach, from `rosterSeasons` and `staffSeasons`, over the
 * last `seasons` seasons: player id to coach id to seasons together. Only the players asked for are indexed.
 */
export function playedUnder(world: LiveWorld, playerIds: ReadonlySet<number>, lastSeason: number, seasons: number): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  if (playerIds.size === 0) return out;
  const staffBy = new Map<string, readonly number[]>();
  for (const s of world.staffSeasons) {
    if (s.seasonYear <= lastSeason - seasons || s.seasonYear > lastSeason) continue;
    staffBy.set(`${s.seasonYear}:${s.teamId}`, [s.headCoachId, ...s.staffIds].filter((x): x is number => x !== null));
  }
  for (const [k, roster] of world.rosterSeasons) {
    const staff = staffBy.get(k);
    if (!staff) continue;
    for (const pid of roster) {
      if (!playerIds.has(pid)) continue;
      const m = out.get(pid) ?? new Map<number, number>();
      for (const cid of staff) m.set(cid, (m.get(cid) ?? 0) + 1);
      out.set(pid, m);
    }
  }
  return out;
}

/** Tie 0 to 100 a coach has with a former player he coached (D13.3.5 rule 4): points per season together, capped. */
export function playedUnderTie(seasonsTogether: number): number {
  return Math.min(100, seasonsTogether * param('pipeline.playedUnderTiePerSeason'));
}

/**
 * S11.2.1 "players who coach": the coach's former players (at least one season on a roster he coached)
 * who now hold a coaching chair. A query over rosters, staffs and job rows, never stored. Sorted by id.
 */
export function playersWhoCoach(world: LiveWorld, coachId: number): number[] {
  const coachedKeys = new Set<string>();
  for (const s of world.staffSeasons) if (s.headCoachId === coachId || s.staffIds.includes(coachId)) coachedKeys.add(`${s.seasonYear}:${s.teamId}`);
  const players = new Set<number>();
  for (const k of coachedKeys) for (const pid of world.rosterSeasons.get(k) ?? []) players.add(pid);
  const holders = new Set<number>();
  for (const j of world.jobs.values()) if (j.holderPersonId !== null) holders.add(j.holderPersonId);
  return [...players].filter((id) => id !== coachId && holders.has(id) && world.people.get(id)?.roles.includes('coach')).sort((a, b) => a - b);
}

/** Share of chair holders at a level and rung range who played at the pro level in the world (calibration read). */
export function formerProShare(world: LiveWorld, levelOf: (teamId: number) => string, level: string, minRung: number, maxRung = 99): { holders: number; formerPro: number } {
  const seen = new Set<number>();
  let formerPro = 0;
  for (const j of world.jobs.values()) {
    const id = j.holderPersonId;
    if (id === null || seen.has(id) || j.rung < minRung || j.rung > maxRung || levelOf(j.teamId) !== level) continue;
    seen.add(id);
    const p = world.people.get(id);
    if (p && levelPlayed(p) === 'pro') formerPro++;
  }
  return { holders: seen.size, formerPro };
}
