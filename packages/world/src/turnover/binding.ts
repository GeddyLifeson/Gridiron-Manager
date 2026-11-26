// What the turnover steps need from the composition root, and the shared readers over the live world.
import { scouting } from '@gm/people';
import { stream } from '@gm/engine-core';
import type { PersonRecord } from '@gm/schema';
import type { LevelSpec, WorldContent } from '../generation/content.ts';
import { scaleMix } from '../generation/founding.ts';
import type { LiveWorld, StepContext } from '../loop/types.ts';
import { param } from './params.ts';

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

// A team's competition is set when it is made and never changes, so its level is cached per world.
const LEVELS = new WeakMap<LiveWorld, Map<number, Level>>();
export function levelOfTeam(world: LiveWorld, teamId: number): Level {
  let m = LEVELS.get(world);
  if (m === undefined) { m = new Map(); LEVELS.set(world, m); }
  const hit = m.get(teamId);
  if (hit !== undefined) return hit;
  const t = world.teams.find((x) => x.id === teamId);
  const c = t && world.competitions.find((x) => x.id === t.competitionId);
  if (!c) throw new Error(`team ${teamId} has no competition`);
  m.set(teamId, c.level as Level);
  return c.level as Level;
}

export function specOf(b: TurnoverBinding, world: LiveWorld, teamId: number): LevelSpec {
  return b.content.levels[levelOfTeam(world, teamId)];
}

/** Position targets on a full roster: the real mix scaled to the roster limit, as founding does (X10.2.2). */
const TARGETS = new WeakMap<LevelSpec, Readonly<Record<string, number>>>();
/** Cached per level spec (read in the signing loops' hot path), so the result is frozen. */
export function positionTargets(spec: LevelSpec): Readonly<Record<string, number>> {
  let t = TARGETS.get(spec);
  if (t === undefined) { t = Object.freeze(scaleMix(spec.rosterMix, spec.rosterLimit)); TARGETS.set(spec, t); }
  return t;
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, x) => a + x, 0) / xs.length);

/** The whole-player value the evaluator looks at: the mean of the true attributes, read only inside `observe`. */
function lookValue(p: PersonRecord): number {
  return mean(Object.values(p.playing?.attributes ?? {}));
}

/**
 * Observed grades, one look per team and player per season (D6.4.2: truth plus evaluator lean plus
 * noise). The truth is read only through `scouting.observe`, the module's single truth reader.
 */
export function gradeContext(world: LiveWorld, rosteredIds: ReadonlySet<number>): GradeContext {
  const cache = new Map<number, Map<number, { mean: number; variance: number }>>();
  const pub = new Map<number, number>();
  const leniency = new Map<number, number>();
  const season = world.date.seasonYear;
  // Head coach per team, read once per context (the job scan is the whole ladder: 13k rows on the full world).
  let heads: Map<number, number> | null = null;
  const evaluatorOf = (teamId: number): number => {
    if (heads === null) {
      heads = new Map();
      for (const j of world.jobs.values()) if (j.positionId === 'pos:head_coach' && j.holderPersonId !== null && !heads.has(j.teamId)) heads.set(j.teamId, j.holderPersonId);
    }
    return heads.get(teamId) ?? 0;
  };
  const look = (teamId: number, personId: number): { mean: number; variance: number } => {
    let byTeam = cache.get(teamId);
    if (byTeam === undefined) { byTeam = new Map(); cache.set(teamId, byTeam); }
    const hit = byTeam.get(personId);
    if (hit !== undefined) return hit;
    const p = world.people.get(personId);
    if (!p?.playing) return { mean: 0, variance: 0 };
    let len = leniency.get(teamId);
    if (len === undefined) { len = scouting.drawLeniency(stream(world.seed, 'world.turnover.lean', [teamId, season])); leniency.set(teamId, len); }
    const rostered = rosteredIds.has(personId);
    const item = scouting.observe(lookValue(p), {
      attribute: 'overall', source: rostered ? 'season_stats' : 'workout',
      units: rostered ? param('grade.rosteredUnits') : param('grade.workoutUnits'), date: world.date,
      evaluator: { id: evaluatorOf(teamId), line: `team:${teamId}` }, skill: param('grade.aiSkill'),
      estimateMean: 0, opponent: null,
    }, { leniency: len, playerOffset: 0, schemeOffset: 0 }, stream(world.seed, 'world.turnover.look', [teamId, personId, season]));
    const out = { mean: item.value, variance: item.variance };
    byTeam.set(personId, out);
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
      const item = scouting.observe(lookValue(p), {
        attribute: 'overall', source: rosteredIds.has(personId) ? 'season_stats' : 'workout',
        units: param('grade.rosteredUnits'), date: world.date, evaluator: { id: 0, line: 'public' }, skill: param('grade.aiSkill'),
        estimateMean: 0, opponent: null,
      }, scouting.NO_LEAN, stream(world.seed, 'world.turnover.public', [personId, season]));
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
