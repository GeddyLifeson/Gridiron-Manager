// Fixtures for the player AI tests: a hand-filled perceived view, scripted assignments, and a world
// that can be replayed with a new play number. Rule values here are test inputs, not rule data.
import {
  SLOT_COUNT, type Behavior, type BallStateKind, type CompiledAssignment, type DecideOutput, type Intent, type PerceivedEntity, type PerceivedView,
  type PlayRead, type RuleSet, type TickWorld,
} from '@gm/schema';
import { PARAMS as FIELD_PARAMS } from '../../src/field/index.ts';
import { PARAMS as KIN_PARAMS } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { NEUTRAL_MIND, PARAMS, createPlayerAi, playerAiParams, type PlayerAi, type PlayerMind, type SlotPlay } from '../../src/player-ai/index.ts';
import { createTickLoop, paramTableFromFiles } from '../../src/tick/index.ts';
import { fixtureWorld, type WorldSpec } from '../tick/support.ts';

export const TABLE = paramTableFromFiles([FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, PARAMS]);
export const P = playerAiParams(TABLE);

interface Ent { slot: number; px: number; py: number; velPx: number; velPy: number; staleTicks: number }

export class FakeView implements PerceivedView {
  tSinceSnapS = 0;
  readonly self = { px: 0, py: 0, velPx: 0, velPy: 0, headingRad: 0 };
  readonly ents = new Map<number, Ent>();
  ballEnt: Ent | null = null;
  kind: BallStateKind | 'unknown' = 'held';
  read: { read: PlayRead; side: 'left' | 'right' | 'none'; confidence: number } = { read: 'unknown', side: 'none', confidence: 0 };
  carrier = -1;
  readonly calls = new Set<string>();
  readonly numbers = new Uint8Array(SLOT_COUNT);
  constructor(readonly selfSlot: number) {}
  entity(slot: number): PerceivedEntity | null { return this.ents.get(slot) ?? null; }
  ball(): PerceivedEntity | null { return this.ballEnt; }
  ballKind(): BallStateKind | 'unknown' { return this.kind; }
  playRead() { return this.read; }
  believedCarrierSlot(): number { return this.carrier; }
  heard(call: string): boolean { return this.calls.has(call); }
  receiverNumber(slot: number): number { return this.numbers[slot] ?? 0; }
  at(px: number, py: number): this { this.self.px = px; this.self.py = py; return this; }
  see(slot: number, px: number, py: number, velPx = 0, velPy = 0, receiver = 0): this {
    this.ents.set(slot, { slot, px, py, velPx, velPy, staleTicks: 0 });
    if (receiver > 0) this.numbers[slot] = receiver;
    return this;
  }
  seeBall(px: number, py: number, velPx = 0, velPy = 0): this { this.ballEnt = { slot: -1, px, py, velPx, velPy, staleTicks: 0 }; return this; }
}

export type Job = CompiledAssignment & { eventBase: number; fire: number };

/** A scripted assignment: every tick it writes a target (or null) and may report a fired rule through `job.fire`. */
export function job(behavior: Behavior, script: (view: PerceivedView, intent: Intent, point: { px: number; py: number }) => void = () => {}): Job {
  const intent: Intent = { target: null, targetVelPx: 0, targetVelPy: 0, faceTarget: null, effort: 1, moveMode: 'run', arrival: 'arrive' };
  const point = { px: 0, py: 0 };
  const j: Job = {
    role: 'T', attention: [], eventBase: 100, fire: -1,
    decide(_slot, view): DecideOutput {
      intent.target = point; intent.faceTarget = null; intent.effort = 1; intent.moveMode = 'run'; intent.arrival = 'arrive';
      script(view, intent, point);
      const firedRule = j.fire; j.fire = -1;
      return { intent, behavior, behaviorState: 0, firedRule, calls: [], technique: {} };
    },
  };
  return j;
}
/** Runs to a fixed play-frame point. */
export function goTo(behavior: Behavior, px: number, py: number): Job { return job(behavior, (_v, _i, pt) => { pt.px = px; pt.py = py; }); }

export function mind(over: Partial<PlayerMind> = {}): PlayerMind { return { ...NEUTRAL_MIND, ...over }; }
export function slotPlay(compiled: CompiledAssignment | null, over: Partial<SlotPlay> = {}): SlotPlay {
  return { compiled, conceptId: 'c', mind: NEUTRAL_MIND, ...over };
}

export interface Bench {
  readonly world: TickWorld;
  readonly views: FakeView[];
  readonly ai: PlayerAi;
  readonly plays: (SlotPlay | null)[];
  /** Replays the world as play `n` for `ticks` ticks. `each` runs before every tick's Decide stage. */
  play(n: number, ticks?: number, each?: (world: TickWorld) => void): void;
}

export function bench(spec: WorldSpec = {}, order?: readonly number[]): Bench {
  const world = fixtureWorld({ params: TABLE, ...spec });
  const views: FakeView[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) views.push(new FakeView(s));
  const ai = createPlayerAi({ view: (s) => views[s]!, ...(order ? { test: { order } } : {}) });
  const plays: (SlotPlay | null)[] = new Array<SlotPlay | null>(SLOT_COUNT).fill(null);
  ai.setPlay(plays);
  return {
    world, views, ai, plays,
    play(n, ticks = 1, each = () => {}) {
      (world.situation as { playNumber: number }).playNumber = n;
      world.tick = 0; world.deadAtTick = null; world.events.length = 0;
      createTickLoop([{ name: 'perceive', run: each }, ai.stage]).run(world, { stopAt: (x) => x.tick >= ticks });
    },
  };
}

/** A rule set with the interference and holding rows the deliberate-foul leaf reads. `cap` 0 means a spot foul with no cap. */
export function foulRules(cap: number): RuleSet {
  const nums: Record<string, number> = {
    'field.goal_to_goal_yd': 100, 'field.end_zone_depth_ft': 30, 'field.width_ft': 160, 'field.hash_from_sideline_ft': 70.75,
    'field.goal_post_width_ft': 18.5, 'field.crossbar_height_ft': 10,
    'foul.dpi.yards': 0, 'foul.dpi.max_yards': cap, 'foul.offensive_holding.yards': 10, 'score.touchdown': 6,
  };
  const bools: Record<string, boolean> = { 'foul.dpi.exists': true, 'foul.dpi.spot_foul': true, 'foul.dpi.afd': true, 'foul.offensive_holding.exists': true };
  return {
    id: 'fixture_0001', level: 'pro', seasonYear: 0,
    num: (k) => { const v = nums[k]; if (v === undefined) throw new Error(`no key ${k}`); return v; },
    bool: (k) => { const v = bools[k]; if (v === undefined) throw new Error(`no key ${k}`); return v; },
    opt: (k) => { throw new Error(`no key ${k}`); },
    keys: () => [...Object.keys(nums), ...Object.keys(bools)],
  };
}
