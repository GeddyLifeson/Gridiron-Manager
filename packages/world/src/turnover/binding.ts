// What the turnover steps need from the composition root, and the shared readers over the live world.
import { scouting } from '@gm/people';
import { stream } from '@gm/engine-core';
import type { PersonRecord } from '@gm/schema';
import type { LevelSpec, WorldContent } from '../generation/content.ts';
import { scaleMix } from '../generation/founding.ts';
import type { LiveWorld } from '../loop/types.ts';
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
}

export function levelOfTeam(world: LiveWorld, teamId: number): Level {
  const t = world.teams.find((x) => x.id === teamId);
  const c = t && world.competitions.find((x) => x.id === t.competitionId);
  if (!c) throw new Error(`team ${teamId} has no competition`);
  return c.level as Level;
}

export function specOf(b: TurnoverBinding, world: LiveWorld, teamId: number): LevelSpec {
  return b.content.levels[levelOfTeam(world, teamId)];
}

/** Position targets on a full roster: the real mix scaled to the roster limit, as founding does (X10.2.2). */
export function positionTargets(spec: LevelSpec): Record<string, number> {
  return scaleMix(spec.rosterMix, spec.rosterLimit);
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
  const cache = new Map<string, number>();
  const leniency = new Map<number, number>();
  const season = world.date.seasonYear;
  const evaluatorOf = (teamId: number): number => {
    for (const j of world.jobs.values()) if (j.teamId === teamId && j.positionId === 'pos:head_coach' && j.holderPersonId !== null) return j.holderPersonId;
    return 0;
  };
  return {
    world,
    grade(teamId, personId) {
      const key = `${teamId}:${personId}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const p = world.people.get(personId);
      if (!p?.playing) return 0;
      let len = leniency.get(teamId);
      if (len === undefined) { len = scouting.drawLeniency(stream(world.seed, 'world.turnover.lean', [teamId, season])); leniency.set(teamId, len); }
      const rostered = rosteredIds.has(personId);
      const item = scouting.observe(lookValue(p), {
        attribute: 'overall', source: rostered ? 'season_stats' : 'workout',
        units: rostered ? param('grade.rosteredUnits') : param('grade.workoutUnits'), date: world.date,
        evaluator: { id: evaluatorOf(teamId), line: `team:${teamId}` }, skill: param('grade.aiSkill'),
        estimateMean: 0, opponent: null,
      }, { leniency: len, playerOffset: 0, schemeOffset: 0 }, stream(world.seed, 'world.turnover.look', [teamId, personId, season]));
      cache.set(key, item.value);
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
