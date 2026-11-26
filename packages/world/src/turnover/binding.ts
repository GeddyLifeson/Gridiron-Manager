// What the turnover steps need from the composition root, and the shared readers over the live world.
import { development } from '@gm/league';
import { scouting } from '@gm/people';
import { stream } from '@gm/engine-core';
import type { PersonRecord } from '@gm/schema';
import type { LevelSpec, WorldContent } from '../generation/content.ts';
import { scaleMix } from '../generation/founding.ts';
import type { LiveWorld, StepContext } from '../loop/types.ts';
import { param } from './params.ts';

const DEV = development.devNumbers();

export type Level = keyof WorldContent['levels'];
/** A league rule value by key (rules-data: the league rules file, then the rule set). Undefined when the league has none. */
export type RuleRead = (level: Level, key: string) => number | undefined;

/**
 * The decisions K7 owns. The default policy grades by observation (D6.4.2) and fills by need; the
 * front office AI (front-office `gm`) binds here once its barrel exports it (CR-G76-1).
 */
export interface RosterPolicy {
  /** Board score of a player for a team: higher is wanted more. Must read observed grades only (K9). */
  readonly boardScore?: (ctx: GradeContext, teamId: number, personId: number, need: number) => number;
  /** The player a team takes from the candidates; 'pass' to take nobody now; null to leave the choice to the default board. */
  readonly pick?: (ctx: PolicyContext, teamId: number, candidates: readonly number[], phase: Phase) => number | 'pass' | null;
  /** The players a team keeps at the cutdown (M6), or null for the default. Must keep `limit` with the minimums filled. */
  readonly cutdown?: (ctx: PolicyContext, teamId: number, roster: readonly number[], limit: number, minByPosition: Readonly<Record<string, number>>) => readonly number[] | null;
  /**
   * K7.3.1 rule 3 and C8.3.2 after the cutdown (M6): players other clubs just cut are on the street. The one
   * this team signs from `candidates` and the player it releases to make room for him, or null for none.
   */
  readonly streetSign?: (ctx: PolicyContext, teamId: number, candidates: readonly number[]) => { readonly sign: number; readonly drop: number } | null;
  /**
   * K7.4.1 rule 3 at the start of the offseason: the players whose contracts have run out that the club will not
   * re-sign at their price (more than his walk-away number). They go to free agency (TO-30). Null keeps everyone.
   */
  readonly letWalk?: (ctx: PolicyContext, teamId: number) => readonly number[] | null;
  /** K7.5.1: a college program's offers to ready recruits, best first, for `openPlaces` places; null for the default signing order. */
  readonly recruitOffers?: (ctx: PolicyContext, teamId: number, candidates: readonly number[], openPlaces: number) => readonly number[] | null;
  /**
   * T4.5.2: letters already signed through the recruiting system, person id to team id. Ready recruits with a
   * letter sign there first while the team has a place; the rest go to `recruitOffers` or the default fill.
   */
  readonly recruitSignings?: (ctx: PolicyContext) => ReadonlyMap<number, number> | null;
  /**
   * K7.7.1 `early_contact_player` (C8, C11.6.2): before free agency opens, the free agent this team reaches ahead
   * of the order, or null. `slot` is the team's place in the signing order (0 picks first). The policy raises
   * the act itself through the L8.2.5 pipeline; a returned id is the illegal effect: the team signs him first.
   */
  readonly earlyContact?: (ctx: PolicyContext, teamId: number, candidates: readonly number[], slot: number) => number | null;
}

/** Which choice a pick is (C7, C8, X11.1.1, T4). */
export interface Phase {
  readonly kind: 'free_agent' | 'draft' | 'undrafted' | 'recruit' | 'walk_on';
  readonly round?: number;
  readonly rounds?: number;
}

/** What a policy may read during one offseason cycle. One object per cycle: a policy may cache by it. */
export interface PolicyContext {
  /** The step this cycle runs in: its streams, its tier reader and the history log. */
  readonly ctx: StepContext;
  readonly world: LiveWorld;
  readonly b: TurnoverBinding;
  readonly season: number;
  readonly grades: GradeContext;
  /** Round of this year's draft each drafted player went in. */
  readonly draftedRound: ReadonlyMap<number, number>;
}

export interface TurnoverBinding {
  readonly content: WorldContent;
  readonly rule: RuleRead;
  readonly policy?: RosterPolicy;
}

export interface GradeContext {
  readonly world: LiveWorld;
  /** Observed grade of a player by a team this season (D6.4.2). Cached per team and player. */
  grade(teamId: number, personId: number): number;
  /** The same look with its evidence variance (D6.4.2), for the front office's belief. */
  belief(teamId: number, personId: number): { readonly mean: number; readonly variance: number };
  /** The public look (media boards, no evaluator lean): what any club knows of the league (K7.2.1 baseline). */
  publicGrade(personId: number): number;
}

interface IdIndex { readonly of: readonly { readonly id: number }[]; readonly length: number; readonly at: Map<number, number> }
const TEAM_INDEX = new WeakMap<LiveWorld, IdIndex>();
const COMP_INDEX = new WeakMap<LiveWorld, IdIndex>();
/** Position of the first element with each id, rebuilt when the array or its length changes. */
function indexOf(cache: WeakMap<LiveWorld, IdIndex>, world: LiveWorld, list: readonly { readonly id: number }[]): IdIndex {
  let ix = cache.get(world);
  if (!ix || ix.of !== list || ix.length !== list.length) {
    const at = new Map<number, number>();
    for (let i = 0; i < list.length; i++) if (!at.has(list[i]!.id)) at.set(list[i]!.id, i);
    ix = { of: list, length: list.length, at };
    cache.set(world, ix);
  }
  return ix;
}
/** The first element with an id (as `find` gives), through the index; checked against the array so a replaced slot is still read live. */
function byId<T extends { readonly id: number }>(cache: WeakMap<LiveWorld, IdIndex>, world: LiveWorld, list: readonly T[], id: number): T | undefined {
  let i = indexOf(cache, world, list).at.get(id);
  if (i !== undefined && list[i]?.id !== id) { cache.delete(world); i = indexOf(cache, world, list).at.get(id); }
  return i === undefined ? undefined : list[i];
}

export function levelOfTeam(world: LiveWorld, teamId: number): Level {
  const t = byId(TEAM_INDEX, world, world.teams, teamId);
  const c = t && byId(COMP_INDEX, world, world.competitions, t.competitionId);
  if (!c) throw new Error(`team ${teamId} has no competition`);
  return c.level as Level;
}

export function specOf(b: TurnoverBinding, world: LiveWorld, teamId: number): LevelSpec {
  return b.content.levels[levelOfTeam(world, teamId)];
}

/** Position targets on a full roster: the real mix scaled to the roster limit, as founding does (X10.2.2). */
const TARGETS = new WeakMap<LevelSpec, Readonly<Record<string, number>>>();
export function positionTargets(spec: LevelSpec): Readonly<Record<string, number>> {
  let t = TARGETS.get(spec);
  if (!t) { t = Object.freeze(scaleMix(spec.rosterMix, spec.rosterLimit)); TARGETS.set(spec, t); }
  return t;
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, x) => a + x, 0) / xs.length);

/** The whole-player value the evaluator looks at: the mean of the true attributes, read only inside `observe`. */
function lookValue(p: PersonRecord, memo?: WeakMap<object, number>): number {
  const playing = p.playing;
  if (!playing) return 0;
  // The whole-player value (development value.ts): worked attributes plus the speed term, so a player who
  // loses a step is seen to (D8.2.1). Within one grade context no playing block changes in place.
  if (memo) {
    const v = memo.get(playing);
    if (v !== undefined) return v;
  }
  const v = development.wholePlayerValue(DEV, playing, development.familyOf(playing.position));
  memo?.set(playing, v);
  return v;
}

/**
 * TO-21: seasons of film a look at a rostered player pools, by the D6.1.1 precision-weighted update: his seasons
 * in the pro league (credited seasons plus this one), up to `grade.pooledSeasonsMax`. A one-season look made the
 * same veteran a star one year and ordinary the next, so clubs paid on one look and cut on the next.
 */
function pooledSeasons(p: PersonRecord): number {
  const seasons = 1 + (p.playing?.eligibility.pro.creditedSeasons ?? 0);
  return Math.min(param('grade.pooledSeasonsMax'), seasons);
}

/** A player with at least one credited pro season has film a club can watch, rostered or not (TO-21). */
function hasFilm(p: PersonRecord): boolean {
  return (p.playing?.eligibility.pro.creditedSeasons ?? 0) > 0;
}

/**
 * Observed grades, one look per team and player per season (D6.4.2: truth plus evaluator lean plus noise),
 * pooling a veteran's seasons of film (TO-21) and, for a club's look, updating the D6.4.1 prior (TO-22). An
 * individual's truth is read only through `scouting.observe`; the prior's census mean is a population average
 * at the position and level (D6.4.1 `positionLevelMean`), never one player's value.
 */
export function gradeContext(world: LiveWorld, rosteredIds: ReadonlySet<number>): GradeContext {
  const cache = new Map<number, Map<number, { mean: number; variance: number }>>();
  const pub = new Map<number, number>();
  const leniency = new Map<number, number>();
  const looks = new WeakMap<object, number>();
  const season = world.date.seasonYear;
  // Jobs do not change while a grade context lives (it is made inside one development or roster pass, after
  // the coach moves), so each team's evaluator is found once.
  const evaluators = new Map<number, number>();
  const evaluatorOf = (teamId: number): number => {
    let e = evaluators.get(teamId);
    if (e === undefined) {
      e = 0;
      for (const j of world.jobs.values()) if (j.teamId === teamId && j.positionId === 'pos:head_coach' && j.holderPersonId !== null) { e = j.holderPersonId; break; }
      evaluators.set(teamId, e);
    }
    return e;
  };
  // TO-22, D6.1.1 and D6.4.1: a look updates the public prior, it does not replace it. The prior mean is the
  // position and level average of the population the public facts place him in (D6.4.1: unbiased across that
  // population): a player with no credited pro season against the rostered players with none (the camp's
  // rookies), anyone else against the rostered veterans, at the evaluating club's level (TO-24). With no rookie
  // rostered (before the draft) the veterans' mean stands in; prospects are then only ranked among themselves. Its sd is D6.4.1's 12 for a prospect with no film, 8 with some film, 6 for an established
  // player (film pooled to the cap).
  const census = new Map<string, number>();
  const isRookie = (q: PersonRecord) => (q.playing?.eligibility.pro.creditedSeasons ?? 0) === 0;
  const censusMean = (level: Level, position: string, rookie: boolean): number => {
    const k = `${level}:${position}:${rookie}`;
    let m = census.get(k);
    if (m === undefined) {
      let sum = 0, n = 0;
      const add = (q: PersonRecord | undefined) => {
        if (q?.playing?.position !== position || isRookie(q) !== rookie) return;
        sum += lookValue(q, looks); n++;
      };
      for (const [tid, ids] of world.rosters) {
        if (levelOfTeam(world, tid) !== level) continue;
        for (const id of ids) add(world.people.get(id));
      }
      m = n > 0 ? sum / n : rookie ? censusMean(level, position, false) : 0;
      census.set(k, m);
    }
    return m;
  };
  const withPrior = (teamId: number, p: PersonRecord, filmed: boolean, value: number, variance: number): { mean: number; variance: number } => {
    const info: scouting.PublicInformation = !filmed ? 'none' : pooledSeasons(p) >= param('grade.pooledSeasonsMax') ? 'established_starter' : 'production';
    const sd0 = scouting.priorSd(info);
    const v0 = sd0 * sd0;
    const m0 = censusMean(levelOfTeam(world, teamId), p.playing!.position, isRookie(p));
    const w = v0 / (v0 + variance);
    return { mean: m0 + w * (value - m0), variance: (v0 * variance) / (v0 + variance) };
  };
  // TO-23, D6.1.1: pooled film is the same film. Each season's look at a player is drawn once (its stream is keyed
  // by that season, not by today), and a pooled look is the precision-weighted mean of the seasons in the window,
  // so next year's grade shares all but one season with this year's. Fresh noise each year reshuffled near-equal
  // players every cutdown, which real clubs, watching the same tape, do not do.
  const pooledLook = (truth: number, source: scouting.EvidenceSource, units: number, seasons: number, leniency: number, evaluator: { id: number; line: string }, rng: (seasonYear: number) => ReturnType<typeof stream>) => {
    let sum = 0, variance = 0;
    for (let k = 0; k < seasons; k++) {
      const item = scouting.observe(truth, {
        attribute: 'overall', source, units, date: world.date, evaluator, skill: param('grade.aiSkill'), estimateMean: 0, opponent: null,
      }, { leniency, playerOffset: 0, schemeOffset: 0 }, rng(season - k));
      sum += item.value; variance = item.variance;
    }
    return { value: sum / seasons, variance: variance / seasons };
  };
  // TO-25, D6.4.2: a filmed player's season is graded snap by snap, not from his line of stats. His own club has
  // its game film and practice (game_film), another club cuts up his games (opponent_film), the public reads the
  // charting services (grading_service), each over `grade.filmSnapsPerSeason` snaps a season. The club each
  // player was with when this context was made (the start of the roster cycle, or the development pass) is his
  // own club. A season-stats look (sd 11 a season) left a veteran's public percentile, and so his market price,
  // mostly noise.
  const clubAtStart = new Map<number, number>();
  for (const [tid, ids] of world.rosters) for (const id of ids) clubAtStart.set(id, tid);
  const lookOf = (p: PersonRecord, filmed: boolean, source: scouting.EvidenceSource, leniency: number, evaluator: { id: number; line: string }, rng: (seasonYear: number) => ReturnType<typeof stream>) =>
    filmed
      ? pooledLook(lookValue(p, looks), source, param('grade.filmSnapsPerSeason'), pooledSeasons(p), leniency, evaluator, rng)
      : pooledLook(lookValue(p, looks), 'workout', param('grade.workoutUnits'), 1, leniency, evaluator, rng);
  const look = (teamId: number, personId: number): { mean: number; variance: number } => {
    let byPerson = cache.get(teamId);
    if (byPerson === undefined) { byPerson = new Map(); cache.set(teamId, byPerson); }
    const hit = byPerson.get(personId);
    if (hit !== undefined) return hit;
    const p = world.people.get(personId);
    if (!p?.playing) return { mean: 0, variance: 0 };
    let len = leniency.get(teamId);
    if (len === undefined) { len = scouting.drawLeniency(stream(world.seed, 'world.turnover.lean', [teamId, season])); leniency.set(teamId, len); }
    // TO-21: a rostered player, or a veteran out of work, has film; a prospect has only his workout.
    const filmed = rosteredIds.has(personId) || hasFilm(p);
    const item = lookOf(p, filmed, clubAtStart.get(personId) === teamId ? 'game_film' : 'opponent_film', len, { id: evaluatorOf(teamId), line: `team:${teamId}` },
      (s) => stream(world.seed, 'world.turnover.look', [teamId, personId, s]));
    const out = withPrior(teamId, p, filmed, item.value, item.variance);
    byPerson.set(personId, out);
    return out;
  };
  return {
    world,
    grade: (teamId, personId) => look(teamId, personId).mean,
    belief: look,
    publicGrade(personId) {
      const hit = pub.get(personId);
      if (hit !== undefined) return hit;
      const p = world.people.get(personId);
      if (!p?.playing) return 0;
      const filmed = rosteredIds.has(personId) || hasFilm(p);
      const item = lookOf(p, filmed, 'grading_service', 0, { id: 0, line: 'public' }, (s) => stream(world.seed, 'world.turnover.public', [personId, s]));
      pub.set(personId, item.value);
      return item.value;
    },
  };
}

export function rosteredSet(world: LiveWorld): Set<number> {
  const out = new Set<number>();
  for (const ids of world.rosters.values()) for (const id of ids) out.add(id);
  return out;
}

export function ageIn(p: PersonRecord, seasonYear: number): number {
  return seasonYear - p.birthDate.seasonYear;
}
