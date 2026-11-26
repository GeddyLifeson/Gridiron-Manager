// J1.3.1 tick loop. The loop owns the stage order and nothing else: behavior arrives as registered
// stages (contract `TickStage`). Each tick runs Perceive, Decide, Move (SUBSTEPS times), Interact and
// event detection, each for the whole world before the next. Nothing is allocated per tick (P6.3.1).
import {
  AFTER_WHISTLE_TICKS, MAX_LIVE_TICKS, SUBSTEPS, TICK_S, roundSimS, roundYd,
  type TickStage, type TickWorld,
} from '@gm/schema';

/** A stage that wants to reset its own per-play state. `begin` runs once, before the first tick of a play. */
export interface PlayStage extends TickStage { begin?(world: TickWorld): void }

/** Receives the world after `begin` and after every tick. The trajectory recorder implements it. */
export interface TickObserver { begin(world: TickWorld): void; afterTick(world: TickWorld): void }

export interface RunOptions {
  /** Trajectory recording. When set, the after-whistle ticks run (P6.3.1). */
  readonly observer?: TickObserver | null;
  /** Run the after-whistle ticks even with no observer: a dead-ball foul hazard is live (J10). */
  readonly afterWhistle?: boolean;
  /** Test hook (J1.6.1 `stopAt`): checked after each tick; true stops the run with the play still live. */
  readonly stopAt?: ((world: TickWorld) => boolean) | null;
}

export interface RunResult {
  /** Ticks executed by this call, after-whistle ticks included. */
  ticksRun: number;
  /** Tick at which the ball became dead, or null when the run was stopped by `stopAt`. */
  deadAtTick: number | null;
  /** True when the 600-tick limit ended the play (J1.3.1): an engine fault, never valid football. */
  fault: boolean;
}

export interface TickLoop {
  readonly stages: readonly PlayStage[];
  /** Resets every stage for a new play. `run` calls it; call it yourself before stepping by hand. */
  begin(world: TickWorld): void;
  /** Advances exactly one tick. For step-through tools and tests. */
  step(world: TickWorld): void;
  run(world: TickWorld, options?: RunOptions): RunResult;
}

const ORDER = ['perceive', 'decide', 'move', 'interact', 'detect'] as const;

/**
 * Builds a loop from stages. Stages of the same name run in the order given, so a ball stage
 * registered after the movement stage updates the ball after the players in each sub-step (J1.3.1).
 */
export function createTickLoop(stages: readonly PlayStage[]): TickLoop {
  const byName: PlayStage[][] = ORDER.map((name) => stages.filter((s) => s.name === name));
  const perceive = byName[0]!, decide = byName[1]!, move = byName[2]!, interact = byName[3]!, detect = byName[4]!;
  const subDt = TICK_S / SUBSTEPS;

  const begin = (world: TickWorld): void => {
    for (let i = 0; i < stages.length; i++) { const b = stages[i]!.begin; if (b) b.call(stages[i], world); }
  };

  const step = (world: TickWorld): void => {
    for (let i = 0; i < perceive.length; i++) perceive[i]!.run(world, TICK_S);
    for (let i = 0; i < decide.length; i++) decide[i]!.run(world, TICK_S);
    for (let s = 0; s < SUBSTEPS; s++) for (let i = 0; i < move.length; i++) move[i]!.run(world, subDt);
    for (let i = 0; i < interact.length; i++) interact[i]!.run(world, TICK_S);
    for (let i = 0; i < detect.length; i++) detect[i]!.run(world, TICK_S);
    world.tick++;
  };

  const run = (world: TickWorld, options?: RunOptions): RunResult => {
    const observer = options?.observer ?? null, stopAt = options?.stopAt ?? null;
    const result: RunResult = { ticksRun: 0, deadAtTick: null, fault: false };
    begin(world);
    if (observer) observer.begin(world);
    while (world.deadAtTick === null) {
      if (world.tick >= MAX_LIVE_TICKS) {
        result.fault = true;
        world.deadAtTick = world.tick;
        world.emit({
          type: 'dead_ball', t: roundSimS(world.tick * TICK_S), marginYd: null, marginS: null, visibility: 'open',
          reason: 'engine_fault', spot: { x: roundYd(world.ball.x), y: roundYd(world.ball.y) }, side: null, carrierId: null,
        });
        break;
      }
      step(world);
      result.ticksRun++;
      if (observer) observer.afterTick(world);
      if (stopAt && stopAt(world)) return result;
    }
    result.deadAtTick = world.deadAtTick;
    // After the whistle: film and dead-ball foul hazards only (J1.3.1). Stages read `deadAtTick` and
    // must not change the result; the loop does not police that.
    if (observer || options?.afterWhistle) {
      for (let i = 0; i < AFTER_WHISTLE_TICKS; i++) {
        step(world);
        result.ticksRun++;
        if (observer) observer.afterTick(world);
      }
    }
    return result;
  };

  return { stages, begin, step, run };
}
