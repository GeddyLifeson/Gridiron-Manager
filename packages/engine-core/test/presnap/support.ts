// Test support for the pre-snap tests. Everything here is a FIXTURE: the rule values below copy the
// shape of the WP-01 rule sets (and the WP-10 proposed numbering keys), and the formation and the
// defense are test inputs, not shipped content (WP-15 owns that).
import { SLOT_COUNT, SLOTS_PER_TEAM, type Assignment, type ParamTable, type RuleSet, type TickWorld, type TruthEvent } from '@gm/schema';
import { legality } from '@gm/football-lang';
import { PARAMS as FIELD_PARAMS } from '../../src/field/index.ts';
import { PARAMS as KIN_PARAMS, createMovement } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { createTickLoop, paramTableFromFiles } from '../../src/tick/index.ts';
import {
  PARAMS, createPresnapStages, planPresnap,
  type PresnapDefense, type PresnapInput, type PresnapOffense, type PresnapPlan, type PresnapStages,
} from '../../src/presnap/index.ts';
import { fixtureWorld, type WorldSpec } from '../tick/support.ts';

type Values = Record<string, number | boolean | string>;

export const FIXTURE_VALUES: Values = {
  'field.goal_to_goal_yd': 100, 'field.end_zone_depth_ft': 30, 'field.width_ft': 160,
  'field.hash_from_sideline_ft': 70.75, 'field.goal_width_ft': 18.5, 'field.crossbar_height_ft': 10,
  'substitution.max_players': 11, 'substitution.match_window': true, 'comm.c2p_cutoff_seconds': 15,
  'formation.line_min': 7, 'formation.backfield_max': 0, 'formation.numbered_linemen_min': 0,
  'formation.neither_behind_snapper_max': 1, 'formation.t_quarterback_depth_yd': 1,
  'formation.motion_rule': 'one_back_not_forward', 'formation.shift_set_seconds': 1,
  'numbering.eligible_low_max': 49, 'numbering.eligible_high_min': 80, 'numbering.eligible_high_max': 89,
  'numbering.scheme': 'position_bands', 'numbering.report_eligible_allowed': true, 'numbering.qb_under_center_eligible': false,
  ...Object.fromEntries(['false_start', 'offside', 'encroachment', 'neutral_zone_infraction', 'delay_of_game', 'illegal_formation',
    'illegal_shift', 'illegal_motion', 'too_many_in_formation', 'too_many_on_field'].map((id) => [`foul.${id}.exists`, true])),
};

/** College-shaped variant: wider hashes, a backfield limit and the free numbering scheme (B13.2). */
export const FIXTURE_COLLEGE: Values = {
  ...FIXTURE_VALUES, 'field.hash_from_sideline_ft': 60, 'formation.line_min': 0, 'formation.backfield_max': 4,
  'formation.numbered_linemen_min': 5, 'numbering.eligible_high_max': 99, 'numbering.scheme': 'free_0_99_five_50_79',
  'numbering.report_eligible_allowed': false, 'numbering.qb_under_center_eligible': true,
};

export function ruleSet(values: Values = FIXTURE_VALUES, id = 'fixture_presnap'): RuleSet {
  const get = (k: string) => { const v = values[k]; if (v === undefined) throw new Error(`fixture has no rule key ${k}`); return v; };
  return { id, level: 'pro', seasonYear: 0, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => Object.keys(values) };
}

export const TABLE: ParamTable = paramTableFromFiles([FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, PARAMS, legality.PARAMS]);

/** A table with some presnap parameters replaced (for forcing a hazard in a test). */
export function tableWith(over: Record<string, number>): ParamTable {
  return { version: 'test', has: (n) => TABLE.has(n), num: (n) => (over[n] ?? TABLE.num(n)) };
}

export function asg(role: string, type: string, px: number, py: number, onLine: boolean, motion: { px: number; py: number }[] = []): Assignment {
  return {
    role, behavior: { type, params: {}, path: [] },
    preSnap: { align: { px, py, rule: null }, onLine, stance: 'two_point', motion: motion.map((m) => ({ ...m, kind: 'through' as const, landmark: null })) },
    rules: [], keys: [], gaze: 'default', technique: {}, conceptId: 'fixture', teachingLoad: 0, calls: [],
  };
}

/** 11 personnel, shotgun: five linemen, a tight end on the line, X on the line, Z and H off, QB and RB in the gun. */
export function offense(): Assignment[] {
  return [
    asg('LT', 'passSet', -0.4, 2.8, true), asg('LG', 'passSet', -0.4, 1.4, true), asg('C', 'snapper', -0.4, 0, true),
    asg('RG', 'passSet', -0.4, -1.4, true), asg('RT', 'passSet', -0.4, -2.8, true), asg('Y', 'route', -0.4, -4.2, true),
    asg('X', 'route', -0.4, 12, true), asg('Z', 'route', -1.5, -11, false, [{ px: -1.5, py: 6 }]),
    asg('H', 'route', -1.5, 7, false), asg('QB', 'quarterback', -5, 0, false), asg('RB', 'passSet', -5, 1.5, false),
  ];
}
/** Jersey numbers matching the fixture bands: linemen 70 to 74, the rest eligible. */
export const JERSEYS = [70, 71, 72, 73, 74, 85, 11, 14, 83, 9, 26];

/** Nickel, four down, two-high: CBs on X and Z, nickel on H, safeties at 12 yd. */
export function defense(rushers = 4): Assignment[] {
  const out = [
    asg('LE', 'passRush', 1, -3.6, true), asg('DT', 'passRush', 1, -0.8, true), asg('NT', 'passRush', 1, 0.8, true), asg('RE', 'passRush', 1, 3.6, true),
    asg('Mike', 'zoneDrop', 4.5, 1, false), asg('Will', 'zoneDrop', 4.5, -2, false),
    asg('CBX', 'manCover', 6, 12, false), asg('CBZ', 'manCover', 6, -11, false), asg('Nickel', 'manCover', 5, 7, false),
    asg('FS', 'deepZone', 12, 6, false), asg('SS', 'deepZone', 12, -6, false),
  ];
  for (let i = 4; i < Math.min(11, rushers); i++) out[i] = { ...out[i]!, behavior: { ...out[i]!.behavior, type: 'blitz' } };
  return out;
}

export function offenseInput(over: Partial<PresnapOffense> = {}): PresnapOffense {
  return {
    assignments: offense(), substituted: [], callLateS: 0, packageReadiness: 70, signalCaller: 9, noise: 0,
    shift: null, motion: null, audibles: [], canRedirect: true, prepared: 0.5, ...over,
  };
}
export function defenseInput(over: Partial<PresnapDefense> = {}): PresnapDefense {
  return {
    assignments: defense(), substituted: [], callLateS: 0, packageReadiness: 70, signalCaller: 4, noise: 0,
    coverage: 'zone', manMatch: { 6: 6, 7: 7, 8: 8 }, bluff: false, checks: [], disguise: [], simulatedPressure: false, aggressiveGetOff: false, ...over,
  };
}
export function input(over: Partial<PresnapInput> = {}): PresnapInput {
  return {
    tempo: 'huddle', playClockStartTenths: 400, callWords: 6, hardCount: false, silentCount: false, longCount: false,
    snapsOnSameCount: 0, shotgun: true, venue: 'home', snapFoulPhase: 'pass_play',
    offense: offenseInput(), defense: defenseInput(), ...over,
  };
}

/** A world with the offense in a huddle 8 yd behind the ball and the defense 8 yd beyond it. */
export function world(spec: WorldSpec = {}): TickWorld {
  const w = fixtureWorld({ rules: ruleSet(), params: TABLE, ...spec });
  for (let s = 0; s < SLOTS_PER_TEAM; s++) w.slots[s]!.player.jersey = JERSEYS[s]!;
  for (let s = 0; s < SLOT_COUNT; s++) {
    const off = s < SLOTS_PER_TEAM, i = s % SLOTS_PER_TEAM;
    w.players.posX[s] = w.frame.originX + (off ? -8 : 8) * w.frame.attackDir;
    w.players.posY[s] = w.frame.originY + (i - 5) * 0.8 * w.frame.attackDir;
  }
  return w;
}

export interface Run { w: TickWorld; plan: PresnapPlan; ps: PresnapStages; clock: number[]; ticks: number[] }

/** Plans and runs the phase with the movement stage, recording the play clock on every pre-snap tick. */
export function run(inp: PresnapInput = input(), spec: WorldSpec = {}): Run {
  const w = world(spec), plan = planPresnap(w, inp), ps = createPresnapStages(plan, inp);
  const clock: number[] = [], ticks: number[] = [];
  const rec = { name: 'detect' as const, run: (x: TickWorld) => { ticks.push(x.tick); clock.push(plan.playClockStartTenths - (x.tick - plan.firstTick)); } };
  createTickLoop([...ps.stages, createMovement().stage, rec]).run(w, { stopAt: (x) => x.tick >= 0 });
  return { w, plan, ps, clock, ticks };
}

export function ofType<T extends TruthEvent['type']>(w: TickWorld, type: T): Extract<TruthEvent, { type: T }>[] {
  return w.events.filter((e) => e.type === type) as Extract<TruthEvent, { type: T }>[];
}

export const playY = (w: TickWorld, s: number) => (w.players.posY[s]! - w.frame.originY) * w.frame.attackDir;
export const playX = (w: TickWorld, s: number) => (w.players.posX[s]! - w.frame.originX) * w.frame.attackDir;
