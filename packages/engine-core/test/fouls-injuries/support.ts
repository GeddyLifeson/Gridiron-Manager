// Fixtures for the fouls-and-injuries tests. Rule values here are TEST INPUTS shaped like the rule set
// (which fouls exist, the ineligible-downfield limit), not rule data: the module reads them by key.
import { TICK_S, type ParamTable, type RuleSet, type TickWorld, type TruthEvent } from '@gm/schema';
import { PARAMS as CONTEST_PARAMS } from '../../src/contest/index.ts';
import { PARAMS as FIELD_PARAMS } from '../../src/field/index.ts';
import { PARAMS as FI_PARAMS, LIVE_FOULS, createFoulsInjuries, type FoulsInjuries, type FoulsInjuriesOptions } from '../../src/fouls-injuries/index.ts';
import { PARAMS as KIN_PARAMS } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { paramTableFromFiles } from '../../src/tick/index.ts';
import { fixtureWorld, type PlayerSpec } from '../tick/support.ts';

export const TABLE: ParamTable = paramTableFromFiles([FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, CONTEST_PARAMS, FI_PARAMS]);

/** A table with some module rows replaced (names without the module prefix), for forcing an event. */
export function tableWith(over: Record<string, number>): ParamTable {
  const full: Record<string, number> = {};
  for (const [k, v] of Object.entries(over)) full[`foulsInjuries.${k}`] = v;
  return { version: 'test', has: (n) => TABLE.has(n), num: (n) => (full[n] ?? TABLE.num(n)) };
}

const FIELD: Record<string, number> = {
  'field.goal_to_goal_yd': 100, 'field.end_zone_depth_ft': 30, 'field.width_ft': 160,
  'field.hash_from_sideline_ft': 70.75, 'field.goal_width_ft': 18.5, 'field.crossbar_height_ft': 10,
};

export interface RuleSpec { id?: string; off?: readonly string[]; idfYd?: number; lowBlock?: string; extra?: Record<string, number> }

/** FIXTURE rules: every foul the module commits exists unless listed in `off`. */
export function rules(spec: RuleSpec = {}): RuleSet {
  const values: Record<string, number | boolean | string> = { ...FIELD, 'foul.ineligible_downfield.yards': spec.idfYd ?? 1, 'foul.low_block.rule': spec.lowBlock ?? 'tight_end_box_only', ...(spec.extra ?? {}) };
  for (const id of LIVE_FOULS) values[`foul.${id}.exists`] = !(spec.off ?? []).includes(id);
  const get = (k: string) => { const v = values[k]; if (v === undefined) throw new Error(`fixture has no rule key ${k}`); return v; };
  return { id: spec.id ?? `fixture_fi_${(spec.off ?? []).join('_')}_${spec.idfYd ?? 1}`, level: 'pro', seasonYear: 0, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => Object.keys(values) };
}

export interface Scene {
  world: TickWorld;
  module: FoulsInjuries;
  events: TruthEvent[];
  /** Runs the stage for one tick at the world's current tick, then advances the tick. */
  step(): void;
}

export function scene(spec: { seed?: number; rules?: RuleSet; params?: ParamTable; players?: (s: number) => PlayerSpec; options?: FoulsInjuriesOptions; playNumber?: number } = {}): Scene {
  const world = fixtureWorld({ seed: spec.seed ?? 7, params: spec.params ?? TABLE, rules: spec.rules ?? rules(), ballX: 50, players: spec.players });
  if (spec.playNumber !== undefined) (world.situation as { playNumber: number }).playNumber = spec.playNumber;
  const module = createFoulsInjuries(spec.options ?? {});
  const stage = module.stages[0]!;
  world.tick = 0;
  stage.begin?.(world);
  return {
    world, module, events: world.events,
    step(): void { stage.run(world, TICK_S); world.tick++; },
  };
}

export const ofType = <T extends TruthEvent['type']>(events: readonly TruthEvent[], type: T) => events.filter((e) => e.type === type) as Extract<TruthEvent, { type: T }>[];
