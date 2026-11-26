// The tick resolver (J1.6.1, J1.6.3, J1.3.1; build plan WP-23): every play stage registered with the
// tick loop in one fixed order, behind the contract `Resolver` with id `tick`.
//
// One resolver holds one set of stage modules and reuses them for every play (P6.3.1). `simulatePlay`
// is pure: it reads the input and the content port, draws only from `input.streams`, and uses only
// `input.math` and the deterministic math of this package (J13).
//
// Honesty rule: a stage module that is not plugged in is replaced by its stand-in (stand-ins.ts), the
// stand-in is named in `report.standIns`, and `mayProduceSavedResults` is false until none is left.
import {
  SLOT_COUNT, SLOTS_PER_TEAM, TICK_S, issToZ,
  type Assignment, type MovementParams, type ParamTable, type PlayInput, type PlayResult, type PlayTruth, type PlayerDelta,
  type Resolver, type SimPlayer, type SimTeam, type SlotInfo, type TickWorld, type TruthEvent,
} from '@gm/schema';
import { lang } from '@gm/football-lang';
import { ballParams, createBallStages } from '../ball/index.ts';
import { createContests, type Contests } from '../contest/index.ts';
import { PI } from '../dmath.ts';
import { createBoundaryWatcher, createHeldBallStage, fieldParams, playFrame } from '../field/index.ts';
import { createMovement, kinParams, movementParams } from '../kinematics/index.ts';
import { createPerception } from '../perception/index.ts';
import { NEUTRAL_MIND, createPlayerAi, type SlotPlay } from '../player-ai/index.ts';
import { createPresnapStages, planPresnap, presnapParams, snapperOf, startingAdvantage, type PresnapInput, type PresnapPlan, type PresnapStages } from '../presnap/index.ts';
import { createTickLoop, createTickWorld, createTrajectoryRecorder, type PlayStage, type TrajectoryRecorder } from '../tick/index.ts';
import { createCatchPointStage } from './catch-point.ts';
import { createFinish } from './finish.ts';
import { createInteract } from './interact.ts';
import { createKickOp, isFreeKick } from './kick-op.ts';
import { tickResolverParams } from './params.ts';
import { PLUG_IDS, type KickLook, type RunnerHooks, type PlayServices, type PlaySetup, type PlugId, type PlugStages, type StagePlug, type TickResolverOptions, type TickResolverReport } from './ports.ts';
import { standInPlug } from './stand-ins.ts';

export const TICK_RESOLVER_VERSION = '0.1.0';

export type TickResolver = Resolver & { readonly id: 'tick'; readonly report: TickResolverReport };

/** Sort rank inside one timestamp (J1.3.1): play events, then the dead ball, then dead-ball fouls. Same as the reference resolver. */
function rank(e: TruthEvent): number {
  if (e.type === 'dead_ball') return 1;
  if (e.type === 'foul_committed' && e.timing === 'dead_ball') return 2;
  return 0;
}
const AFTER_DEAD_OK = new Set<TruthEvent['type']>(['foul_committed', 'injury', 'detail']);

/**
 * Puts the play's events in J1.3.1 order once: time, then rank, then the order they were emitted.
 * A physical event dated after the whistle (a man stepping out of bounds a moment later) is not part
 * of the live play and is dropped; fouls, injuries and detail after the whistle stay.
 */
export function orderEvents(events: readonly TruthEvent[]): TruthEvent[] {
  let deadT = Infinity;
  for (const e of events) if (e.type === 'dead_ball' && e.t < deadT) deadT = e.t;
  const order: { e: TruthEvent; i: number }[] = [];
  let seenDead = false;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type === 'dead_ball') { if (seenDead) continue; seenDead = true; }
    else if (e.t > deadT && !AFTER_DEAD_OK.has(e.type)) continue;
    order.push({ e, i });
  }
  order.sort((a, b) => (a.e.t - b.e.t) || (rank(a.e) - rank(b.e)) || (a.i - b.i));
  return order.map((o) => o.e);
}

export function createTickResolver(options: TickResolverOptions): TickResolver {
  const supplied = options.plugs ?? [];
  for (const plug of supplied) if (!PLUG_IDS.includes(plug.id)) throw new Error(`unknown stage module ${String(plug.id)}`);
  const standIns: PlugId[] = [];
  const plugs: StagePlug[] = PLUG_IDS.map((id) => {
    const found = supplied.filter((x) => x.id === id);
    if (found.length > 1) throw new Error(`stage module ${id} was plugged in twice`);
    if (found.length === 1) return found[0]!;
    standIns.push(id);
    return standInPlug(id);
  });
  const minds = options.minds ?? null;

  // Shared instances (ports.ts `PlayServices`).
  const interact = createInteract();
  const perception = createPerception();
  const movement = createMovement({ engagementLimit: interact.limit });
  const playerAi = createPlayerAi({
    view: perception.view,
    gaze: { atBall: (slot) => perception.gazeAtBall(slot) },
    call: (world, sender, listeners, call) => { perception.deliverCall(world, sender, listeners, call, callNoise[sender < SLOTS_PER_TEAM ? 0 : 1]!, callCohesion[sender]!); },
  });
  const ball = createBallStages();
  const heldBall = createHeldBallStage();
  const boundary = createBoundaryWatcher();
  const kickOp = createKickOp(perception);
  const catchPoint = createCatchPointStage(perception);
  const finish = createFinish();
  const callNoise: [number, number] = [0, 0];
  const callCohesion = new Float64Array(SLOT_COUNT);

  // Per-play state the services expose.
  let plan: PresnapPlan | null = null, presnap: PresnapStages | null = null, setup: PlaySetup | null = null, current: PlayInput | null = null;
  let contests: Contests | null = null, contestsOf: ParamTable | null = null;
  let passerNow: (() => number) | null = null, runnerHooks: RunnerHooks | null = null;
  const services: PlayServices = {
    perception, movement, playerAi, ball,
    contests: () => { if (contests === null) throw new Error('no play is being resolved'); return contests; },
    plan: () => plan,
    snap: () => (presnap === null ? null : presnap.snap()),
    setup: () => { if (setup === null) throw new Error('no play is being resolved'); return setup; },
    input: () => { if (current === null) throw new Error('no play is being resolved'); return current; },
    kickLook: () => (setup === null ? null : setup.kickLook ?? null),
    protectedPasser: () => (passerNow === null ? -1 : passerNow()),
    claimPasser: (f) => { passerNow = f; },
    kickOwner: () => kickOp.owner(),
    runner: () => runnerHooks,
    claimRunner: (hooks) => { runnerHooks = hooks; },
  };
  const built: PlugStages[] = plugs.map((plug) => plug.create(services));
  // J10.6.2 hit load has one ledger. The fouls-and-injuries module sees every hit (tackles, hits on the
  // passer, late hits, blocks) and draws its injuries from the same numbers, so when it keeps a ledger
  // that is the play's hit load. Only without one is what the other modules saw summed.
  const injuriesAt = PLUG_IDS.indexOf('foulsInjuries');
  const hitSources: readonly PlugStages[] = built[injuriesAt]!.hitLoad ? [built[injuriesAt]!] : built;

  // The pre-snap stages own the negative ticks (J1.3.2). Player AI decides from the snap on; perception
  // starts a little before it so its delayed views have history at tick 0 (J3.1.1).
  let perceptionFrom = 0;
  const gate = (inner: PlayStage, from: () => number): PlayStage => ({
    name: inner.name,
    begin(w: TickWorld): void { inner.begin?.(w); },
    run(w: TickWorld, dt: number): void { if (w.tick >= from()) inner.run(w, dt); },
  });
  // What the play cost each man is read at the whistle, so film ticks after it never change a result.
  const energyAtWhistle = new Float64Array(SLOT_COUNT);
  let energyTaken = false;
  const ledger: PlayStage = {
    name: 'detect',
    begin(): void { energyTaken = false; },
    run(w: TickWorld): void {
      if (energyTaken || w.deadAtTick === null) return;
      energyTaken = true;
      for (let s = 0; s < SLOT_COUNT; s++) energyAtWhistle[s] = movement.energyCost(s);
    },
  };
  // MODULE_ORDER, spelled out. The loop groups by stage name and keeps this order inside each name.
  const fixedStages: readonly PlayStage[] = [
    gate(perception.stage, () => perceptionFrom), gate(playerAi.stage, () => 0), movement.stage, heldBall,
    ball.move, ball.detect, boundary.moveStage, boundary.detectStage, interact.stage, kickOp.stage, catchPoint.stage,
    ...built[0]!.stages, ...built[1]!.stages, ...built[2]!.stages, finish, ledger,
  ];
  const freeKickLoop = createTickLoop(fixedStages);
  const wantsAfterWhistle = built.some((b) => b.wantsAfterWhistle !== undefined);

  // Caches that depend only on content and parameters, never on a play's outcome.
  let langOf: ParamTable | null = null, compiler: lang.FootballLangImpl | null = null;
  let compiledBy = new WeakMap<Assignment, lang.Compiled | null>();
  let movementBy = new WeakMap<SimPlayer, MovementParams>();
  const rosterBy = new WeakMap<SimTeam, Map<number, SimPlayer>>();
  let recorder: TrajectoryRecorder | null = null;

  const compile = (a: Assignment | null | undefined): lang.Compiled | null => {
    if (a === null || a === undefined) return null;
    let c = compiledBy.get(a);
    if (c === undefined) { c = compiler!.compile(a).compiled; compiledBy.set(a, c); }
    if (c !== null) c.reset();
    return c;
  };
  const playerOf = (team: SimTeam, id: number): SimPlayer => {
    let m = rosterBy.get(team);
    if (m === undefined) { m = new Map(); for (const pl of team.players) m.set(pl.playerId, pl); rosterBy.set(team, m); }
    const found = m.get(id);
    if (found === undefined) throw new Error(`player ${id} is on the field but not dressed for team ${team.teamId}`);
    return found;
  };

  function simulatePlay(input: PlayInput): PlayResult {
    const params = input.params, sit = input.situation, calls = input.calls;
    const q = tickResolverParams(params);
    if (langOf !== params) {
      langOf = params; compiler = lang.createFootballLang({ params, math: input.math });
      compiledBy = new WeakMap(); movementBy = new WeakMap();
    }
    if (contestsOf !== params) { contests = createContests(params, input.math); contestsOf = params; }
    const s0 = content(input);
    setup = s0; current = input;

    // Slots 0 to 10 are the snapping or kicking team, 11 to 21 the other (J1.2.2).
    // NOT BUILT: a unit of fewer or more than eleven. The contract allows it (J4.6.1); until the
    // short-handed path exists the resolver says so instead of inventing a player.
    if (calls.snapping.players.length !== SLOTS_PER_TEAM || calls.opposing.players.length !== SLOTS_PER_TEAM) {
      throw new Error(`tick resolver: units of exactly ${SLOTS_PER_TEAM} only (got ${calls.snapping.players.length} and ${calls.opposing.players.length}); the short-handed path is not built`);
    }
    const kp = kinParams(params), fp = fieldParams(params);
    const slots: SlotInfo[] = [];
    for (let s = 0; s < SLOT_COUNT; s++) {
      const snapping = s < SLOTS_PER_TEAM, side = snapping ? sit.offense : ((1 - sit.offense) as 0 | 1);
      const fielded = snapping ? calls.snapping.players[s]! : calls.opposing.players[s - SLOTS_PER_TEAM]!;
      const player = playerOf(input.teams[side], fielded.playerId);
      let mv = movementBy.get(player);
      if (mv === undefined) { mv = movementParams(player, kp, fp).movement; movementBy.set(player, mv); }
      slots.push({ slot: s, playerId: player.playerId, side, role: fielded.role, player, movement: mv });
    }
    const geometry = input.geometry;
    const world = createTickWorld({
      situation: sit, geometry, frame: playFrame(geometry, fp, sit.ballX, sit.ballY, sit.attackDir, sit.lineToGainX), environment: input.environment,
      streams: input.streams, math: input.math, rules: input.rules, params, slots,
    });

    const O = s0.presnap.offense.assignments, D = s0.presnap.defense.assignments;
    const look = s0.kickLook ?? null;
    const presnapInput = look === null ? s0.presnap : longSnapInput(input, s0.presnap, look, slots);
    const assignmentOf = (s: number): Assignment | undefined => (s < SLOTS_PER_TEAM ? O[s] : D[s - SLOTS_PER_TEAM]);
    const free = isFreeKick(input), pl = world.players, f = world.frame;
    const facing = (s: number): number => ((s < SLOTS_PER_TEAM) === (f.attackDir === 1) ? 0 : PI);
    for (let s = 0; s < SLOT_COUNT; s++) {
      const snapping = s < SLOTS_PER_TEAM, i = s % SLOTS_PER_TEAM, a = assignmentOf(s);
      // Free kick: everyone is at his spot when the ball is kicked. Otherwise the units start in their
      // huddles and the pre-snap phase walks them to their alignment (J5.1).
      const px = free && a ? a.preSnap.align.px : (snapping ? -1 : 1) * q['setup.huddleDepthYd']!;
      const py = free && a ? a.preSnap.align.py : (i - (SLOTS_PER_TEAM - 1) / 2) * q['setup.huddleSpacingYd']!;
      pl.posX[s] = f.originX + px * f.attackDir; pl.posY[s] = f.originY + py * f.attackDir;
      pl.headingRad[s] = facing(s); pl.gazeRad[s] = pl.headingRad[s]!;
    }

    // K1 inputs per slot. A slot whose assignment does not compile runs no rules and stands (J4.6.1).
    const slotPlays: (SlotPlay | null)[] = [];
    const notCompiled: number[] = [];
    for (let s = 0; s < SLOT_COUNT; s++) {
      const part = s0.slots[s] ?? null, a = assignmentOf(s);
      if (part === null || a === undefined) { slotPlays.push(null); continue; }
      const compiled = compile(a);
      if (compiled === null) notCompiled.push(s);
      const alt = part.alternate !== undefined ? part.alternate : compile(s0.alternates?.[s]);
      slotPlays.push({ ...part, compiled, mind: minds === null ? NEUTRAL_MIND : minds.mind(slots[s]!.playerId), alternate: alt });
      let cohesion = 0;
      const deps = part.dependents ?? [];
      for (const d of deps) cohesion += d.cohesion;
      callCohesion[s] = deps.length > 0 ? cohesion / deps.length : q['setup.defaultCohesion']!;
    }
    callNoise[0] = s0.context.noise?.[0] ?? 0; callNoise[1] = s0.context.noise?.[1] ?? 0;
    // Eyes start each play with the hips: a gaze rule a module set on the last play must not carry into this one (J13.1.1).
    for (let s = 0; s < SLOT_COUNT; s++) perception.gazeWithHips(s);
    for (let s = 0; s < SLOT_COUNT; s++) { const cfg = s0.perception[s]; if (cfg !== undefined) perception.configure(s, cfg); }
    playerAi.setPlay(slotPlays, s0.context, null);

    let loop = freeKickLoop;
    if (free) {
      plan = null; presnap = null; perceptionFrom = 0;
      interact.setPlay(contests!, null);
    } else {
      const thePlan = planPresnap(world, presnapInput), pp = presnapParams(params);
      plan = thePlan; presnap = createPresnapStages(thePlan, presnapInput);
      perceptionFrom = -q['setup.perceptionLeadTicks']!;
      interact.setPlay(contests!, (blocker, defender) => startingAdvantage(thePlan.startS[blocker]!, thePlan.startS[defender]!, pp));
      loop = createTickLoop([...presnap.stages, ...fixedStages]);
    }
    const snapOf = (): ReturnType<PlayServices['snap']> => (presnap === null ? null : presnap.snap());
    kickOp.setPlay(input, O, s0.context.pressure ?? 0, snapOf, look);
    catchPoint.setPlay(contests!);
    for (const b of built) b.setPlay?.(world);

    const full = input.options.detail === 'full', stopAtTick = input.options.stopAtTick;
    if (full && recorder === null) recorder = createTrajectoryRecorder();
    for (const s of notCompiled) world.emit({ type: 'detail', t: (free ? 0 : plan!.firstTick) * TICK_S, code: 'tick.assignment_not_compiled', playerIds: [slots[s]!.playerId], spot: null, value: null });
    loop.run(world, {
      observer: full ? recorder : null, afterWhistle: wantsAfterWhistle,
      stopAt: stopAtTick === undefined ? null : (w) => w.tick >= stopAtTick,
    });

    // The truth record (J1.6.2).
    const events = orderEvents(world.events);
    let dead: Extract<TruthEvent, { type: 'dead_ball' }> | null = null;
    for (const e of events) if (e.type === 'dead_ball') { dead = e; break; }
    const live = dead !== null && dead.reason !== 'pre_snap_foul' && dead.reason !== 'period_ended_before_snap';
    const liveDurationTenths = live ? Math.max(0, Math.round(dead!.t * 10)) : 0;
    // B7.7.1 impetus, as far as the physical record can say it: the team that last had the ball when it
    // became dead on or behind a goal line. Officiating may refine it from the events.
    let endZoneImpetus: 0 | 1 | null = null;
    if (dead !== null && live && (dead.spot.x <= geometry.goalLineWestX || dead.spot.x >= geometry.goalLineEastX)) {
      const last = world.ball.carrierSlot >= 0 ? world.ball.carrierSlot : world.ball.lastPossessorSlot;
      endZoneImpetus = last >= 0 ? slots[last]!.side : null;
    }
    const truth: PlayTruth = {
      resolverId: 'tick', resolverVersion: TICK_RESOLVER_VERSION, gameId: sit.gameId, playNumber: sit.playNumber,
      originX: f.originX, originY: f.originY, attackDir: sit.attackDir, liveDurationTenths, endZoneImpetus, events,
    };
    const deltas: PlayerDelta[] = [];
    for (let s = 0; s < SLOT_COUNT; s++) {
      let hit = 0;
      for (const b of hitSources) if (b.hitLoad) hit += b.hitLoad(s);
      const cost = energyTaken ? energyAtWhistle[s]! : movement.energyCost(s);
      deltas.push({ playerId: slots[s]!.playerId, energyCost: cost < 0 ? 0 : cost > 1 ? 1 : cost, hitLoad: hit < 0 ? 0 : hit, onField: true });
    }
    const explain = full ? {
      playerAi: playerAi.explain().slice(), deviations: playerAi.deviations().slice(),
      modules: built.map((b, i) => ({ id: plugs[i]!.id, rows: b.explain ? b.explain().slice() : [] })),
    } : null;
    const result: PlayResult = { truth, deltas, liveDurationTenths, trajectory: full && recorder !== null ? recorder.finish() : null, explain };
    setup = null; current = null;
    return result;
  }

  /**
   * The pre-snap input of a play from a kicking look (F12.7.1): the long snapper snaps to the man the
   * look names, and the ball flies there at the speed J9.4.3 gives a punt snap (0.75 s to a punter at
   * 14 to 15 yd at grade 50, each z of long snapping taking its 0.03 s off), so the snap of a fake takes
   * what the snap of the kick takes. A content error throws: a saved game can never hold such a play.
   */
  const longSnapInput = (input: PlayInput, base: PresnapInput, look: KickLook, slots: readonly SlotInfo[]): PresnapInput => {
    const where = `game ${input.situation.gameId} play ${input.situation.playNumber}`;
    if (input.calls.snapping.unit !== 'offense') throw new Error(`tick resolver: ${where} has a kicking look on a kick call; the look is for an offensive call snapped from a kicking formation`);
    const O = base.offense.assignments, snapper = snapperOf(O), to = look.snapTo;
    if (!Number.isInteger(to) || to < 0 || to >= SLOTS_PER_TEAM || O[to] === undefined) throw new Error(`tick resolver: ${where}: the kicking look snaps to team slot ${String(to)}, which is not one of the eleven`);
    if (to === snapper) throw new Error(`tick resolver: ${where}: the kicking look snaps the ball to the snapper`);
    const bp = ballParams(input.params), q = tickResolverParams(input.params);
    const zSnap = issToZ(snapper >= 0 ? (slots[snapper]!.player.attributes['long_snap'] ?? 50) : 50);
    const flightYps = q['kickLook.puntSnapDepthYd']! / (bp['block.puntSnapS']! - bp['block.puntPerZS']! * zSnap);
    return { ...base, snap: { toTeamSlot: to, long: true, flightYps } };
  };

  const content = (input: PlayInput): PlaySetup => {
    const s = options.content.setup(input);
    if (s === null) throw new Error(`tick resolver: the content set has no entry for the calls of game ${input.situation.gameId} play ${input.situation.playNumber}`);
    if (s.slots.length !== SLOT_COUNT || s.perception.length !== SLOT_COUNT) throw new Error(`tick resolver: a play setup needs ${SLOT_COUNT} slot rows and perception rows`);
    return s;
  };

  const moduleVersions: Record<string, string> = { tickResolver: TICK_RESOLVER_VERSION };
  for (const plug of plugs) moduleVersions[plug.id] = plug.version;

  return {
    id: 'tick',
    version: TICK_RESOLVER_VERSION,
    mayProduceSavedResults: standIns.length === 0,
    simulatePlay,
    report: { standIns, moduleVersions },
  };
}
