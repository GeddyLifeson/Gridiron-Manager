// Fouls and injuries from play: the stage module (bible J10, work package WP-22).
//
// One Interact stage that runs after every other module of the tick (MODULE_ORDER puts it last before
// the assembly's finish stage), so it sees the tick's contests, contacts and events. It never decides
// a call (B11 does, from the truth record) and never holds a medical timeline (D11 does). It records
// what physically happened:
//   - `foul_committed` truth events for live-ball and after-whistle fouls (J10.1 to J10.5), and
//     `borderline` legal acts an official might flag by mistake (B11.3.2 rule 1);
//   - `injury` truth events (J10.6.1) and the physical result on the field (J10.7.1);
//   - concussion evaluations (J10.7.2), per-slot hit load and soreness (J10.6.2) in its record.
//
// Draw rules (J13.2.1): fouls draw only from stream `foul` scoped [game, play, playerId, foulType];
// injuries only from `injury` scoped [game, play, playerId]. A key opened twice restarts its sequence,
// so each key is opened once per play and kept. Slots are visited 0 to 21 in order. A hazard whose
// foul does not exist in the active rule set is skipped BEFORE its draw (J10.1.1), so switching a rule
// key off never shifts another hazard's draws.
//
// What it reads from other modules: truth events of the tick (`pass_release`, `catch_point`,
// `tackle_attempt`, `kick`, `kick_touch`, `possession`, `fumble`, `dead_ball`), the open block contests
// in `world.contests` with `players.engagement`, positions, velocities, behaviours, fatigue, the
// perception module's `landingEstimate` (J3.5.1 "located the ball") and player AI's `foulIntent`
// (K1.3.3 deliberate fouls). Nothing else, and none of their private state.
import {
  BEHAVIORS, MOVE_MODES, SLOT_COUNT, TICK_S, roundSimS, roundYd,
  type RandomStream, type RuleSet, type TickWorld, type TruthEvent, type TruthEventOf,
} from '@gm/schema';
import { dAtan2, dCos, dSqrt, PI } from '../dmath.ts';
import { kinParams, type KinParams } from '../kinematics/index.ts';
import { contactNumbers, type ContactNumbers } from '../kinematics/momentum.ts';
import type { PlayStage } from '../tick/index.ts';
import {
  CONTACT_FORMS, LIVE_FOULS, OPTIONAL_RULE_KEYS, foulsInjuriesParams, type FoulsInjuriesParams, type LiveFoulId,
} from './params.ts';
import {
  MECHANISMS, REGION_TABLE, avoidIllegalBlockChance, conductChance, concussionDetectChance, contactFormChance,
  coverageHoldChance, handsToFaceChance, holdingChance, injuryChance, interferenceChance, kickCatchInterferenceChance,
  kickerContactChance, lateHitChance, pickChance, pickRegion, pushOffChance, severityOf, teamMultiplier, zOf,
  type Mechanism,
} from './formulas.ts';

export const FOULS_INJURIES_VERSION = 'fouls-injuries-0.1.0';

const DOWN = MOVE_MODES.indexOf('down');
const B = (name: (typeof BEHAVIORS)[number]): number => BEHAVIORS.indexOf(name);
const BEH_ROUTE = B('route'), BEH_MAN = B('manCover'), BEH_JAM = B('jammer'), BEH_HOLDER = B('holder'), BEH_RETURNER = B('returner');
const INTERIOR = new Set(['C', 'G', 'T', 'OL', 'OG', 'OT', 'LT', 'LG', 'RG', 'RT']);
const SNAP_BLOCKERS = new Set([B('snapper'), B('passSet'), B('runBlock'), B('pull')]);
const FREE_KICKS = new Set(['kickoff', 'onside_kick', 'safety_kick', 'fair_catch_kick']);
const PLACE_OR_PUNT = new Set(['punt', 'field_goal', 'try_kick']);
const SCORE_REASONS = new Set(['ball_across_goal_line_in_possession', 'kick_through_uprights']);
const NEVER = 2147483647;
const N_MECH = MECHANISMS.length;

/** What the module needs from the play's shared instances. All optional so it can run alone in tests. */
export interface FoulsInjuriesOptions {
  /** J3.5.1: false until the player has seen the ball in the air (the perception module's method). */
  readonly landingEstimate?: ((world: TickWorld, slot: number, out: Float64Array) => boolean) | null;
  /** K1.3.3 deliberate fouls chosen by player AI. */
  readonly foulIntent?: ((slot: number) => { readonly foulId: string; readonly targetSlot: number; readonly tick: number } | null) | null;
  /** L3.4.1 team layer for a side (1 = neutral). Clamped to the bible's bounds here. */
  readonly teamLayer?: ((side: 0 | 1) => { readonly defCoverage: number; readonly postPlay: number }) | null;
  /** I3, I8 aggression instruction for a side, -1 to +1 (0 = neutral). */
  readonly aggression?: ((side: 0 | 1) => number) | null;
  /** I4 all-out block call on the kick being defended. */
  readonly blockItCall?: ((side: 0 | 1) => boolean) | null;
  /** D10 load beyond tolerance for a player, 0 when unknown. */
  readonly loadExcess?: ((playerId: number) => number) | null;
  /** J12 surface factor for the play (J10.6.1 `a7` starts at 0). */
  readonly surface?: ((world: TickWorld) => number) | null;
  /** L8.2.5: true when a coach ordered this act (rule-breaking by instruction). */
  readonly ordered?: ((slot: number, foulId: string) => boolean) | null;
}

export interface ConcussionEvaluation {
  readonly playerId: number;
  readonly slot: number;
  /** Sim time of the head impact, seconds from the snap. */
  readonly t: number;
  /** Elapsed time out for the evaluation (J11.1.1 elapsed counter, never the game clock). */
  readonly durationS: number;
  readonly result: 'cleared' | 'diagnosed';
}

export interface MissedConcussion { readonly playerId: number; readonly slot: number; readonly t: number }

export interface ExplainRow { readonly tick: number; readonly slot: number; readonly code: string; readonly value: number }

export interface FoulsInjuriesRecord {
  readonly evaluations: readonly ConcussionEvaluation[];
  /** True concussions the evaluation did not catch: recorded in truth, the player stays on (J10.7.2). */
  readonly missed: readonly MissedConcussion[];
  /** Soreness by slot and mechanism from exposures that did not injure (J10.6.2), `slot * MECHANISMS.length + m`. */
  readonly soreness: Float64Array;
  /** Hit energy taken and given by slot (J10.6.2). */
  readonly hitLoad: Float64Array;
}

export interface FoulsInjuries {
  readonly stages: readonly PlayStage[];
  hitLoad(slot: number): number;
  wantsAfterWhistle(world: TickWorld): boolean;
  explain(): readonly ExplainRow[];
  record(): FoulsInjuriesRecord;
}

type IdfMeasure = 'entire_body' | 'any_part' | 'centre';
interface Exists {
  readonly rulesId: string; readonly on: Readonly<Record<string, boolean>>; readonly idfYd: number | null;
  readonly idfMeasure: IdfMeasure; readonly idfAnyTime: boolean; readonly idfEngaged: boolean; readonly idfCross: boolean; readonly lowBlock: string | null; readonly zoneYd: number | null; readonly pickYd: number | null }

function readRules(rules: RuleSet): Exists {
  const keys = new Set(rules.keys());
  const on: Record<string, boolean> = {};
  for (const id of LIVE_FOULS) { const k = `foul.${id}.exists`; on[id] = keys.has(k) ? rules.bool(k) : false; }
  const num = (k: string): number | null => (keys.has(k) ? rules.num(k) : null);
  return {
    rulesId: rules.id, on, idfYd: num('foul.ineligible_downfield.yards'),
    idfMeasure: keys.has(OPTIONAL_RULE_KEYS.idfMeasure) ? (rules.opt(OPTIONAL_RULE_KEYS.idfMeasure) as IdfMeasure) : 'centre',
    idfAnyTime: keys.has(OPTIONAL_RULE_KEYS.idfWhen) && rules.opt(OPTIONAL_RULE_KEYS.idfWhen) === 'any_time_before_throw',
    idfEngaged: keys.has(OPTIONAL_RULE_KEYS.idfEngaged) && rules.bool(OPTIONAL_RULE_KEYS.idfEngaged),
    idfCross: keys.has(OPTIONAL_RULE_KEYS.idfCross) ? rules.bool(OPTIONAL_RULE_KEYS.idfCross) : true,
    lowBlock: keys.has('foul.low_block.rule') ? rules.opt('foul.low_block.rule') : null,
    zoneYd: num(OPTIONAL_RULE_KEYS.contactZone), pickYd: num(OPTIONAL_RULE_KEYS.pickDepth),
  };
}

export function createFoulsInjuries(options: FoulsInjuriesOptions = {}): FoulsInjuries {
  let p: FoulsInjuriesParams | null = null, kp: KinParams | null = null, ex: Exists | null = null, typicalEnergy = 1;
  const foulStreams = new Map<string, RandomStream>(), injuryStreams = new Map<number, RandomStream>();
  const buf = new Float64Array(2);
  const cn: ContactNumbers = { closingSpeedYps: 0, momentumRatio: 0, hitEnergy: 0, blindside: false };

  // Per-play state, one element per slot (P6.3.1: allocated once).
  const holdUntil = new Int32Array(SLOT_COUNT), holdDef = new Int16Array(SLOT_COUNT), holdDone = new Uint8Array(SLOT_COUNT);
  const faceDone = new Uint8Array(SLOT_COUNT), faceDoneDef = new Uint8Array(SLOT_COUNT), covDone = new Uint8Array(SLOT_COUNT);
  const passerHit = new Uint8Array(SLOT_COUNT), lateHit = new Uint8Array(SLOT_COUNT), kickHit = new Uint8Array(SLOT_COUNT);
  const kciDone = new Uint8Array(SLOT_COUNT), intentDone = new Uint8Array(SLOT_COUNT), injured = new Uint8Array(SLOT_COUNT), evaluated = new Uint8Array(SLOT_COUNT);
  const firstNear = new Int32Array(SLOT_COUNT), inSprint = new Uint8Array(SLOT_COUNT), cutReady = new Int32Array(SLOT_COUNT);
  const prevVx = new Float64Array(SLOT_COUNT), prevVy = new Float64Array(SLOT_COUNT), oobTick = new Int32Array(SLOT_COUNT);
  const victim = new Uint8Array(SLOT_COUNT), conductDone = new Uint8Array(SLOT_COUNT), catchTick = new Int32Array(SLOT_COUNT);
  const blockedAtSnap = new Uint8Array(SLOT_COUNT);
  let eligibleFilled = false;
  // B5.3.2 / B13.5.3 per-slot downfield record before the throw: contact made within the limit, depth when that
  // contact broke (NaN while engaged or never broken), deepest point reached.
  const idfContact = new Uint8Array(SLOT_COUNT), idfBreak = new Float64Array(SLOT_COUNT), idfMax = new Float64Array(SLOT_COUNT);
  const load = new Float64Array(SLOT_COUNT), soreness = new Float64Array(SLOT_COUNT * N_MECH);
  const contestSeen: boolean[] = [];
  const evaluations: ConcussionEvaluation[] = [], missed: MissedConcussion[] = [], explainRows: ExplainRow[] = [];
  let cursor = 0, releaseTick = -1, passer = -1, target = -1, forward = false;
  let kickTick = -1, kicker = -1, kickKindNow: string | null = null, blockedBy = -1, changed = false, fumbled = false;
  let maxEnergy = 0, lateWatch = false, deadDone = false, fairSignal = -1, touchedKick = -1;

  const idSlot = (w: TickWorld, id: number | null): number => {
    if (id === null) return -1;
    for (let s = 0; s < SLOT_COUNT; s++) if (w.slots[s]!.playerId === id) return s;
    return -1;
  };
  const iss = (w: TickWorld, s: number, a: string): number => w.slots[s]!.player.attributes[a] ?? 50;
  const z = (w: TickWorld, s: number, a: string): number => zOf(iss(w, s, a));
  const dist = (w: TickWorld, a: number, b: number): number => {
    const dx = w.players.posX[a]! - w.players.posX[b]!, dy = w.players.posY[a]! - w.players.posY[b]!;
    return dSqrt(dx * dx + dy * dy);
  };
  const touching = (w: TickWorld, a: number, b: number, q: FoulsInjuriesParams): boolean =>
    dist(w, a, b) <= w.slots[a]!.movement.bodyRadiusYd + w.slots[b]!.movement.bodyRadiusYd + q.contactGapYd;
  const speed = (w: TickWorld, s: number): number => dSqrt(w.players.velX[s]! * w.players.velX[s]! + w.players.velY[s]! * w.players.velY[s]!);
  const isDown = (w: TickWorld, s: number): boolean => w.players.moveMode[s] === DOWN || w.tick < w.players.onGroundUntilTick[s]!;
  const px = (w: TickWorld, s: number): number => (w.players.posX[s]! - w.frame.originX) * w.frame.attackDir;
  const py = (w: TickWorld, s: number): number => (w.players.posY[s]! - w.frame.originY) * w.frame.attackDir;
  const tNow = (w: TickWorld): number => (w.tick + 1) * TICK_S;
  const team = (w: TickWorld, s: number) => options.teamLayer?.(w.slots[s]!.side as 0 | 1) ?? { defCoverage: 1, postPlay: 1 };

  const foulStream = (w: TickWorld, s: number, foulType: string): RandomStream => {
    const k = `${s}:${foulType}`;
    let st = foulStreams.get(k);
    if (st === undefined) { st = w.streams('foul', [w.situation.gameId, w.situation.playNumber, w.slots[s]!.playerId, foulType]); foulStreams.set(k, st); }
    return st;
  };
  const injuryStream = (w: TickWorld, s: number): RandomStream => {
    let st = injuryStreams.get(s);
    if (st === undefined) { st = w.streams('injury', [w.situation.gameId, w.situation.playNumber, w.slots[s]!.playerId]); injuryStreams.set(s, st); }
    return st;
  };

  const phaseNow = (w: TickWorld): TruthEventOf<'foul_committed'>['phase'] => {
    if (w.situation.playKind === 'try') return 'try';
    if (changed) return 'after_change_of_possession';
    const kind = kickKindNow ?? (w.situation.playKind === 'scrimmage' ? null : 'kickoff');
    if (kind !== null) return FREE_KICKS.has(kind) ? 'free_kick' : 'scrimmage_kick';
    if (fumbled && w.ball.kind === 'loose') return 'backward_pass_or_fumble';
    return releaseTick >= 0 && forward ? 'pass_play' : 'running_play';
  };
  const sightAt = (w: TickWorld, x: number, y: number, q: FoulsInjuriesParams): 'open' | 'crowded' | 'pile' => {
    let n = 0;
    const r = q['sight.radiusYd'];
    for (let s = 0; s < SLOT_COUNT; s++) {
      const dx = w.players.posX[s]! - x, dy = w.players.posY[s]! - y;
      if (dx * dx + dy * dy <= r * r) n++;
    }
    return n >= q['sight.pile'] ? 'pile' : n >= q['sight.crowded'] ? 'crowded' : 'open';
  };

  /** Emits one committed foul (or a borderline legal act). The caller has checked the rule key. */
  const commit = (w: TickWorld, foulId: string, s: number, t: number, severity: number, timing: 'live' | 'dead_ball', borderline = false): void => {
    const q = p!, x = w.players.posX[s]!, y = w.players.posY[s]!;
    const bx = w.ball.x - x, by = w.ball.y - y;
    w.emit({
      type: 'foul_committed', t: roundSimS(t), foulId, side: w.slots[s]!.side, playerId: w.slots[s]!.playerId, spot: { x: roundYd(x), y: roundYd(y) },
      timing, phase: phaseNow(w), severity, visibility: sightAt(w, x, y, q),
      atPointOfAttack: bx * bx + by * by <= q.poaYd * q.poaYd, flagrant: !borderline && severity >= q['severity.flagrant'], borderline,
      ordered: options.ordered?.(s, foulId) ?? false,
    });
    explainRows.push({ tick: w.tick, slot: s, code: borderline ? `borderline:${foulId}` : foulId, value: severity });
  };
  /** One hazard draw; commits on success. Returns true when the foul was committed. */
  const hazard = (w: TickWorld, foulId: LiveFoulId, s: number, chance: number, howBad: number, t: number, timing: 'live' | 'dead_ball' = 'live'): boolean => {
    if (!ex!.on[foulId]) return false;
    const st = foulStream(w, s, foulId);
    if (!st.chance(chance)) return false;
    commit(w, foulId, s, t, severityOf(howBad, st.uniform(), p!), timing);
    return true;
  };

  // --- injuries (J10.6.1, J10.7) ---------------------------------------------------------------------
  const groupOf = (w: TickWorld, s: number, q: FoulsInjuriesParams): number => {
    const pos = w.slots[s]!.player.position;
    return pos === 'K' || pos === 'P' ? q['injury.specialistContact'] : 1;
  };
  const MECH_CONTACT: readonly Mechanism[] = ['contact_lower', 'contact_upper', 'head_impact'];
  const MECH_SPRINT: readonly Mechanism[] = ['noncontact_sprint'];
  const MECH_CUT: readonly Mechanism[] = ['noncontact_cut'];
  const MECH_OVERUSE: readonly Mechanism[] = ['overuse'];
  const chances = new Float64Array(N_MECH);

  const exposure = (w: TickWorld, s: number, mechs: readonly Mechanism[], energy: number, t: number, wear: number): void => {
    if (injured[s] === 1 || w.slots[s]!.player.gameDay.unavailable) return;
    const q = p!, pl = w.slots[s]!.player, hurt = pl.gameDay.playingHurt;
    let total = 0;
    for (let i = 0; i < mechs.length; i++) {
      const m = mechs[i]!;
      let prior = false;
      if (m !== 'overuse') { const table = REGION_TABLE[m]; for (const h of hurt) for (const [r] of table) if (r === h.region) prior = true; }
      chances[i] = injuryChance(m, {
        energy, fatigue: w.players.fatigueNow[s]!, loadExcess: options.loadExcess?.(pl.playerId) ?? 0, priorSameRegion: prior || m === 'overuse',
        playingHurt: hurt.length > 0, zDurability: z(w, s, 'durability'), surface: options.surface?.(w) ?? 0, ageYears: pl.ageYears, group: groupOf(w, s, q),
      }, q);
      total += chances[i]!;
    }
    const st = injuryStream(w, s), u = st.uniform();
    if (u >= total) {
      for (let i = 0; i < mechs.length; i++) { const k = s * N_MECH + MECHANISMS.indexOf(mechs[i]!); soreness[k] = soreness[k]! + wear * (chances[i]! / total); }
      return;
    }
    let acc = 0, m: Mechanism = mechs[0]!;
    for (let i = 0; i < mechs.length; i++) { acc += chances[i]!; if (u < acc) { m = mechs[i]!; break; } }
    const region = m === 'overuse' ? hurt[0]!.region : pickRegion(REGION_TABLE[m], st.uniform());
    const seed = st.uniform(), finishes = seed < q['injury.finishSeed'];
    injured[s] = 1;
    w.emit({ type: 'injury', t: roundSimS(t), playerId: pl.playerId, mechanism: m, region, severitySeed: seed, finishesPlay: finishes, headImpact: m === 'head_impact' });
    explainRows.push({ tick: w.tick, slot: s, code: `injury:${m}:${region}`, value: seed });
    // J10.7.1: a player down stops taking part at once. The ball carrier is left to the carrier and dead-ball rules.
    if (!finishes && w.deadAtTick === null && w.players.hasBall[s] === 0) { w.players.moveMode[s] = DOWN; w.players.onGroundUntilTick[s] = NEVER; }
    if (m === 'head_impact') evaluate(w, s, energy, t, true);
  };

  /** J10.7.2: a head impact above the threshold (or a true concussion) may start an evaluation. */
  const evaluate = (w: TickWorld, s: number, energy: number, t: number, concussed: boolean): void => {
    if (evaluated[s] === 1) return;
    evaluated[s] = 1;
    const q = p!, st = injuryStream(w, s);
    const detected = st.chance(concussionDetectChance(energy, concussed, q));
    if (detected) {
      const durationS = q['concussion.minS'] + st.uniform() * (q['concussion.maxS'] - q['concussion.minS']);
      evaluations.push({ playerId: w.slots[s]!.playerId, slot: s, t: roundSimS(t), durationS, result: concussed ? 'diagnosed' : 'cleared' });
      w.emit({ type: 'detail', t: roundSimS(t), code: 'concussion_evaluation', playerIds: [w.slots[s]!.playerId], spot: null, value: null });
    } else if (concussed) {
      missed.push({ playerId: w.slots[s]!.playerId, slot: s, t: roundSimS(t) });
      w.players.dInjuryZ[s] = w.players.dInjuryZ[s]! + q['concussion.missedDInjuryZ'];
    }
  };

  const collision = (w: TickWorld, hit: number, by: number, t: number): number => {
    const pl = w.players;
    contactNumbers(pl.posX[hit]!, pl.posY[hit]!, pl.velX[hit]!, pl.velY[hit]!, w.slots[hit]!.player.weightLb, pl.gazeRad[hit]!,
      pl.posX[by]!, pl.posY[by]!, pl.velX[by]!, pl.velY[by]!, w.slots[by]!.player.weightLb, kp!, cn);
    const e = cn.hitEnergy / typicalEnergy;
    load[hit] = load[hit]! + e; load[by] = load[by]! + e;
    if (e > maxEnergy) maxEnergy = e;
    exposure(w, hit, MECH_CONTACT, e, t, e);
    exposure(w, by, MECH_CONTACT, e, t, e);
    // J10.6.1: a head impact above the threshold opens an evaluation whether or not he shows symptoms.
    if (e >= p!['concussion.energy']) { evaluate(w, hit, e, t, false); evaluate(w, by, e, t, false); }
    return e;
  };

  // --- event handlers -------------------------------------------------------------------------------
  /**
   * Ineligible receivers (B5.3.2). `players.eligible` is the contract's flag; while no module fills it
   * (all zero for the offense), fall back to who blocked at the snap: a snapper or a man who set to
   * pass-block, run-block or pull, or a listed interior position.
   */
  const ineligible = (w: TickWorld, s: number): boolean => {
    if (eligibleFilled) return w.players.eligible[s] !== 1;
    return INTERIOR.has(w.slots[s]!.player.position) || blockedAtSnap[s] === 1;
  };
  const onPassRelease = (w: TickWorld, e: TruthEventOf<'pass_release'>): void => {
    releaseTick = w.tick; passer = idSlot(w, e.passerId); target = idSlot(w, e.targetId); forward = e.forward;
    firstNear.fill(NEVER);
    // J10.2.3: geometry against the rule-set key, judged at the release tick.
    const lim = ex!.idfYd;
    if (!e.forward || lim === null || !ex!.on.ineligible_downfield_pass) return;
    // A pass that does not cross the line has no limit where the rule set says so (college 7-3-10).
    if (ex!.idfCross && e.airYd <= 0) return;
    const q = p!;
    const off = w.slots[passer]?.side ?? w.situation.offense;
    // Eligibility is fixed at the snap (B4.2.1); without flags, ineligible() falls back to interior positions and snap blockers.
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (s === passer || w.slots[s]!.side !== off || !ineligible(w, s)) continue;
      const now = idfDepth(w, s);
      const deepest = ex!.idfAnyTime && idfMax[s]! > now ? idfMax[s]! : now;
      const beyond = deepest - lim;
      if (beyond > 0 && legallyDownfield(w, s, now, lim)) continue;
      if (beyond > 0) commit(w, 'ineligible_downfield_pass', s, e.t, severityOf(beyond / lim, foulStream(w, s, 'ineligible_downfield_pass').uniform(), q), 'live');
      else if (beyond > -q.borderlineYd) commit(w, 'ineligible_downfield_pass', s, e.t, 0, 'live', true);
    }
  };

  /** Depth beyond the line of scrimmage (px = 0, J1.1.2) as the rule set measures it. */
  const idfDepth = (w: TickWorld, s: number): number => {
    const r = w.slots[s]!.movement.bodyRadiusYd, m = ex!.idfMeasure;
    return px(w, s) + (m === 'any_part' ? r : m === 'entire_body' ? -r : 0);
  };

  /**
   * Pro 8-3-1 Item 1: after contact made within the limit on his initial charge he may be past it while
   * blocking or being blocked, or after the contact breaks past the limit if he stays, moves sideways or
   * moves back (Item 2(c): still advancing is a foul). Contact broken within the limit gives nothing (Item 2(b)).
   */
  const legallyDownfield = (w: TickWorld, s: number, now: number, lim: number): boolean => {
    if (!ex!.idfEngaged || idfContact[s] !== 1) return false;
    if (w.players.engagement[s]! >= 0) return true;
    const b = idfBreak[s]!;
    return b === b && b > lim && now <= b;
  };

  /** Before the throw, every tick: contact history and deepest point of each offensive ineligible. */
  const trackDownfield = (w: TickWorld): void => {
    const lim = ex!.idfYd;
    if (lim === null || releaseTick >= 0 || !ex!.on.ineligible_downfield_pass) return;
    const off = w.situation.offense;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (w.slots[s]!.side !== off || !ineligible(w, s)) continue;
      const d = idfDepth(w, s);
      if (d > idfMax[s]!) idfMax[s] = d;
      if (w.players.engagement[s]! >= 0) {
        if (idfContact[s] === 0 && d <= lim) idfContact[s] = 1;
        idfBreak[s] = NaN;
      } else if (idfContact[s] === 1) {
        if (idfBreak[s]! !== idfBreak[s]!) idfBreak[s] = d;
        // Item 1(c): forced back behind the line after the contact broke: normal limits again.
        if (px(w, s) < 0 && idfBreak[s]! > lim) { idfContact[s] = 0; idfBreak[s] = NaN; }
      }
    }
  };

  const onCatchPoint = (w: TickWorld, e: TruthEventOf<'catch_point'>): void => {
    const q = p!, rec = idSlot(w, e.intendedId);
    if (e.catcherId !== null) { const c = idSlot(w, e.catcherId); if (c >= 0) catchTick[c] = w.tick; }
    if (rec < 0 || !forward || e.outcome === 'uncatchable' || e.outcome === 'grounded') return;
    const recLocated = options.landingEstimate ? options.landingEstimate(w, rec, buf) : true;
    let nearest = Infinity;
    for (const id of e.defenderIds) {
      const d = idSlot(w, id);
      if (d < 0) continue;
      const gap = dist(w, d, rec);
      if (gap < nearest) nearest = gap;
      if (gap > q['dpi.contactYd'] || intentDone[d] === 1) continue;
      const located = options.landingEstimate ? options.landingEstimate(w, d, buf) : true;
      const sx = e.spot.x, sy = e.spot.y;
      const dd = dSqrt((w.players.posX[d]! - sx) * (w.players.posX[d]! - sx) + (w.players.posY[d]! - sy) * (w.players.posY[d]! - sy));
      const dr = dSqrt((w.players.posX[rec]! - sx) * (w.players.posX[rec]! - sx) + (w.players.posY[rec]! - sy) * (w.players.posY[rec]! - sy));
      const trailing = dd - dr > 0 ? dd - dr : 0;
      const early = firstNear[d]! !== NEVER && (w.tick - firstNear[d]!) * TICK_S > q['dpi.earlyS'] ? 1 : 0;
      const tm = teamMultiplier(team(w, d).defCoverage, q['team.defCoverageMin'], q['team.defCoverageMax']);
      const chance = interferenceChance({ notLocated: located ? 0 : 1, trailingYd: trailing, early, bothLocated: located && recLocated, zDisc: z(w, d, 'foul_discipline'), zBallSkills: z(w, d, 'ball_skills'), team: tm }, q);
      hazard(w, 'dpi', d, chance, trailing / q['dpi.contactYd'] + (located ? 0 : q['severity.gain']), e.t);
    }
    // J10.3.2 push-off: an optional act at a contested catch point by a receiver with little separation.
    if (e.contested && nearest <= q['dpi.contactYd']) hazard(w, 'opi', rec, pushOffChance(nearest, z(w, rec, 'foul_discipline'), q), 1 - nearest / q['dpi.contactYd'], e.t);
  };

  const onTackle = (w: TickWorld, e: TruthEventOf<'tackle_attempt'>): void => {
    const q = p!, c = idSlot(w, e.carrierId);
    if (c < 0) return;
    const recentCatch = catchTick[c]! >= 0 && (w.tick - catchTick[c]!) * TICK_S <= q['form.defenselessS'];
    const recentThrow = c === passer && releaseTick >= 0 && (w.tick - releaseTick) * TICK_S <= q['form.defenselessS'];
    for (const id of e.tacklerIds) {
      const d = idSlot(w, id);
      if (d < 0) continue;
      const energy = collision(w, c, d, e.t);
      // From behind: the tackler is more than the bible's angle from where the carrier is facing (J10.2.2 geometry, reused for J10.4.2).
      const toD = dAtan2(w.players.posY[d]! - w.players.posY[c]!, w.players.posX[d]! - w.players.posX[c]!);
      const behind = dCos(toD - w.players.headingRad[c]!) < dCos((q['block.behindDeg'] * PI) / 180);
      const aggr = options.aggression?.(w.slots[d]!.side as 0 | 1) ?? 0;
      const inputs = { energy, lunge: speed(w, d) >= q['form.lungeYps'], behind, defenseless: recentCatch || recentThrow, zDisc: z(w, d, 'foul_discipline'), zTackling: z(w, d, 'tackling'), aggression: aggr };
      for (const form of CONTACT_FORMS) {
        if (!ex!.on[form]) continue;
        if (hazard(w, form, d, contactFormChance(form, inputs, q), energy - 1, e.t)) break;
      }
    }
  };

  const onKick = (w: TickWorld, e: TruthEventOf<'kick'>): void => {
    kickTick = w.tick; kicker = idSlot(w, e.kickerId); kickKindNow = e.kickKind; blockedBy = idSlot(w, e.blockedById);
  };

  const scanEvents = (w: TickWorld): void => {
    const evs = w.events;
    for (; cursor < evs.length; cursor++) {
      const e = evs[cursor]! as TruthEvent;
      switch (e.type) {
        case 'pass_release': onPassRelease(w, e); break;
        case 'catch_point': onCatchPoint(w, e); break;
        case 'tackle_attempt': onTackle(w, e); break;
        case 'kick': onKick(w, e); break;
        case 'kick_touch':
          if (e.kind === 'fair_catch_signal' && e.playerId !== null) fairSignal = idSlot(w, e.playerId);
          if (e.kind === 'touched_by_receivers' && e.playerId !== null && touchedKick < 0) touchedKick = idSlot(w, e.playerId);
          break;
        case 'possession': if (e.side !== w.situation.offense && e.how !== 'snap') changed = true; break;
        case 'fumble': fumbled = true; break;
        default: break;
      }
    }
  };

  // --- per-tick exposures ---------------------------------------------------------------------------
  const blocking = (w: TickWorld, q: FoulsInjuriesParams, t: number): void => {
    const n = w.contests.length, pl = w.players;
    for (let i = 0; i < n; i++) {
      const c = w.contests[i]!, o = c.offenseSlot, d = c.defenseSlot;
      const fresh = contestSeen[i] !== true;
      contestSeen[i] = true;
      if (pl.engagement[o] !== i) continue;
      if (fresh) blockStart(w, o, d, q, t);
      // J10.2.1 physical effect: a committed hold resets A toward -0.2 while it lasts, called or not.
      if (holdUntil[o]! > w.tick && holdDef[o] === d && c.advantage < q['hold.resetA']) c.advantage = q['hold.resetA'];
      if (c.advantage >= q['hold.aOpen'] || dist(w, o, d) > q['hold.reachYd']) continue;
      const zd = z(w, o, 'foul_discipline');
      // Hands to the face: one draw per exposure, its own intercept (J10.1.1).
      if (faceDone[o] === 0) { faceDone[o] = 1; hazard(w, 'illegal_use_of_hands_offense', o, handsToFaceChance(q['face.b0Blocker'], -c.advantage + q['hold.aOpen'], zd, q), -c.advantage, t); }
      if (holdDone[o] === 1) continue;
      const carrier = w.ball.kind === 'held' ? w.ball.carrierSlot : -1;
      const desperate = carrier >= 0 && w.slots[carrier]!.side !== w.slots[d]!.side && dist(w, d, carrier) <= w.slots[d]!.movement.vMaxYps * q['hold.desperationS'];
      const kickPlay = phaseNow(w) === 'free_kick' || phaseNow(w) === 'scrimmage_kick';
      const id: LiveFoulId = kickPlay && ex!.on.kick_holding ? 'kick_holding' : 'offensive_holding';
      if (hazard(w, id, o, holdingChance(c.advantage, zd, desperate, q), -c.advantage, t)) {
        holdDone[o] = 1; holdUntil[o] = w.tick + Math.round(q['hold.effectS'] / TICK_S); holdDef[o] = d;
        if (c.advantage < q['hold.resetA']) c.advantage = q['hold.resetA'];
      }
    }
  };

  /** A new block: contact injury exposure for both, and the J10.2.2 legality of a block in space. */
  const blockStart = (w: TickWorld, o: number, d: number, q: FoulsInjuriesParams, t: number): void => {
    contactNumbers(w.players.posX[d]!, w.players.posY[d]!, w.players.velX[d]!, w.players.velY[d]!, w.slots[d]!.player.weightLb, w.players.gazeRad[d]!,
      w.players.posX[o]!, w.players.posY[o]!, w.players.velX[o]!, w.players.velY[o]!, w.slots[o]!.player.weightLb, kp!, cn);
    const e = (cn.hitEnergy / typicalEnergy) * q['injury.blockEnergy'];
    load[o] = load[o]! + e; load[d] = load[d]! + e;
    exposure(w, o, MECH_CONTACT, e, t, e); exposure(w, d, MECH_CONTACT, e, t, e);
    // J10.2.2 geometry: from behind (approach more than the bible's angle from the defender's facing).
    const toO = dAtan2(w.players.posY[o]! - w.players.posY[d]!, w.players.posX[o]! - w.players.posX[d]!);
    const behind = dCos(toO - w.players.headingRad[d]!) < dCos((q['block.behindDeg'] * PI) / 180);
    // In space: outside the area around the snap where close line play happens, or on a kick or after a change of possession.
    const ay = py(w, o) < 0 ? -py(w, o) : py(w, o), ax = px(w, o) < 0 ? -px(w, o) : px(w, o);
    const inSpace = ay > q['block.boxHalfWidthYd'] || ax > q['block.spaceDepthYd'] || changed || kickKindNow !== null;
    let illegal: LiveFoulId | null = null;
    if (behind && inSpace && ex!.on.illegal_block_in_back) illegal = 'illegal_block_in_back';
    else if (ex!.on.block_below_waist && ex!.lowBlock !== null) {
      // A low block is legal only inside the box the key names, on a scrimmage down before a change of possession.
      const outsideBox = (py(w, o) < 0 ? -py(w, o) : py(w, o)) > q['block.boxHalfWidthYd'] || changed || kickKindNow !== null;
      if (outsideBox && foulStream(w, o, 'block_below_waist').chance(q['block.lowShare'])) illegal = 'block_below_waist';
    }
    if (illegal === null) return;
    const st = foulStream(w, o, illegal);
    if (st.chance(avoidIllegalBlockChance(z(w, o, 'foul_discipline'), z(w, o, 'football_intelligence'), q))) {
      // He pulls off: the block is missed (J10.2.2).
      const i = w.players.engagement[o]!;
      if (i >= 0) w.contests[i]!.advantage = -1;
      explainRows.push({ tick: w.tick, slot: o, code: `avoided:${illegal}`, value: 0 });
      return;
    }
    commit(w, illegal, o, t, severityOf(behind ? 1 : 0.5, st.uniform(), q), 'live');
  };

  const coverage = (w: TickWorld, q: FoulsInjuriesParams, t: number): void => {
    const pl = w.players, thrown = releaseTick >= 0;
    for (let d = 0; d < SLOT_COUNT; d++) {
      const bd = pl.behavior[d]!;
      if (bd !== BEH_MAN && bd !== BEH_JAM) continue;
      // Ball in the air: note when each defender first got into contact range of the target (early arrival, J10.3.1).
      if (thrown && w.ball.kind === 'passInFlight' && target >= 0 && firstNear[d] === NEVER && dist(w, d, target) <= q['dpi.contactYd']) firstNear[d] = w.tick;
      if (thrown || covDone[d] === 1) continue;
      for (let r = 0; r < SLOT_COUNT; r++) {
        if (pl.behavior[r] !== BEH_ROUTE || w.slots[r]!.side === w.slots[d]!.side) continue;
        const gap = dist(w, d, r);
        if (gap > q['dh.contactYd']) continue;
        // Trailing: how far behind the receiver he is along the receiver's path.
        const v = speed(w, r);
        if (v <= 0) continue;
        const trail = ((pl.posX[r]! - pl.posX[d]!) * pl.velX[r]! + (pl.posY[r]! - pl.posY[d]!) * pl.velY[r]!) / v;
        if (trail <= q['dh.trailYd']) continue;
        covDone[d] = 1;
        const tm = teamMultiplier(team(w, d).defCoverage, q['team.defCoverageMin'], q['team.defCoverageMax']);
        const zd = z(w, d, 'foul_discipline'), beaten = trail - q['dh.trailYd'];
        if (faceDoneDef[d] === 0) { faceDoneDef[d] = 1; hazard(w, 'illegal_use_of_hands_defense', d, handsToFaceChance(q['face.b0Defender'], beaten, zd, q), beaten, t); }
        const zone = ex!.zoneYd, beyond = zone !== null && px(w, r) > zone;
        const chance = coverageHoldChance(beaten, z(w, d, 'press_technique'), zd, tm, q);
        if (beyond && ex!.on.illegal_contact && foulStream(w, d, 'illegal_contact').chance(q['dh.contactShare'])) hazard(w, 'illegal_contact', d, chance, beaten, t);
        else hazard(w, 'def_holding', d, chance, beaten, t);
        break;
      }
    }
  };

  /** K1.3.3 deliberate fouls chosen by player AI: committed when he reaches his target. */
  const intents = (w: TickWorld, q: FoulsInjuriesParams, t: number): void => {
    if (!options.foulIntent) return;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (intentDone[s] === 1) continue;
      const f = options.foulIntent(s);
      if (f === null || f.targetSlot < 0) continue;
      const reach = f.foulId === 'dpi' ? q['dpi.contactYd'] : q['hold.reachYd'];
      if (dist(w, s, f.targetSlot) > reach) continue;
      const id = f.foulId as LiveFoulId;
      if (!ex!.on[id]) continue;
      intentDone[s] = 1;
      if (id === 'offensive_holding') { holdDone[s] = 1; holdUntil[s] = w.tick + Math.round(q['hold.effectS'] / TICK_S); holdDef[s] = f.targetSlot; }
      commit(w, id, s, t, q['dpi.deliberateSeverity'], 'live');
    }
  };

  /** J10.4.1 hits on the passer after the release; J10.4.1 late hits out of bounds and after the whistle. */
  const lateHits = (w: TickWorld, q: FoulsInjuriesParams, t: number): void => {
    // Roughing the passer.
    if (passer >= 0 && releaseTick >= 0 && w.deadAtTick === null) {
      for (let d = 0; d < SLOT_COUNT; d++) {
        if (passerHit[d] === 1 || w.slots[d]!.side === w.slots[passer]!.side || isDown(w, d) || !touching(w, d, passer, q)) continue;
        passerHit[d] = 1;
        const gap = (w.tick - releaseTick) * TICK_S;
        collision(w, passer, d, t);
        // Body control: no D3 attribute names it; tackling technique stands in (Assumption, J10.4.1).
        hazard(w, 'roughing_passer', d, lateHitChance(gap, z(w, d, 'foul_discipline'), z(w, d, 'tackling'), q), gap / q['late.windowS'], t);
      }
    }
    // Out of bounds (dead by rule, J10.4.1) or after the whistle: the runner is the dead ball's carrier.
    for (let c = 0; c < SLOT_COUNT; c++) if (w.players.wentOob[c] === 1 && oobTick[c] === NEVER) oobTick[c] = w.tick;
    const deadCarrier = w.deadAtTick !== null ? w.ball.lastPossessorSlot : -1;
    for (let c = 0; c < SLOT_COUNT; c++) {
      const since = c === deadCarrier ? w.deadAtTick! : oobTick[c]!;
      if (since === NEVER || since > w.tick) continue;
      const gap = (w.tick - since) * TICK_S;
      if (gap > q['late.windowS']) continue;
      for (let d = 0; d < SLOT_COUNT; d++) {
        if (lateHit[d] === 1 || w.slots[d]!.side === w.slots[c]!.side || !touching(w, d, c, q) || isDown(w, d)) continue;
        lateHit[d] = 1;
        // Inside the could-not-stop gap a contact after the whistle or out of bounds is not a late hit (J10.4.1).
        if (gap <= q['late.couldNotStopS']) continue;
        collision(w, c, d, t);
        const tm = teamMultiplier(team(w, d).postPlay, q['team.postPlayMin'], q['team.postPlayMax']);
        if (hazard(w, 'unnecessary_roughness', d, lateHitChance(gap, z(w, d, 'foul_discipline'), z(w, d, 'tackling'), q) * tm, gap / q['late.windowS'], t, 'dead_ball')) {
          victim[c] = 1;
          retaliate(w, c, d, t);
        }
      }
    }
  };

  /** J10.5.1 retaliation: the fouled player and his nearest teammate draw a raised conduct hazard. */
  const retaliate = (w: TickWorld, fouled: number, by: number, t: number): void => {
    let mate = -1, best = Infinity;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (s === fouled || w.slots[s]!.side !== w.slots[fouled]!.side) continue;
      const g = dist(w, s, fouled);
      if (g < best) { best = g; mate = s; }
    }
    conductFor(w, fouled, 0, true, t);
    if (mate >= 0 && best <= p!['conduct.nearYd']) conductFor(w, mate, 0, true, t);
    void by;
  };

  const conductFor = (w: TickWorld, s: number, weight: number, retaliation: boolean, t: number): void => {
    if (conductDone[s] === 1) return;
    conductDone[s] = 1;
    const q = p!, tm = teamMultiplier(team(w, s).postPlay, q['team.postPlayMin'], q['team.postPlayMax']);
    const chance = conductChance(weight, z(w, s, 'composure'), z(w, s, 'foul_discipline'), retaliation, tm, q);
    const st = foulStream(w, s, 'conduct');
    if (!st.chance(chance)) return;
    const u = st.uniform();
    const id: LiveFoulId = u < q['conduct.shareTaunt'] ? 'taunting' : u < q['conduct.shareTaunt'] + q['conduct.shareStrike'] ? 'striking' : 'unsportsmanlike';
    if (!ex!.on[id]) return;
    commit(w, id, s, t, severityOf(retaliation ? 1 : weight / 2, st.uniform(), q), 'dead_ball');
  };

  /** At the whistle: conduct near the ball (J10.5.1) and whether the after-whistle ticks are needed. */
  const atWhistle = (w: TickWorld, q: FoulsInjuriesParams): void => {
    deadDone = true;
    const dead = w.events.find((e) => e.type === 'dead_ball') as TruthEventOf<'dead_ball'> | undefined;
    const t = dead?.t ?? tNow(w), sx = dead?.spot.x ?? w.ball.x, sy = dead?.spot.y ?? w.ball.y;
    const sit = w.situation, margin = sit.score[0] - sit.score[1];
    const weight = (dead !== undefined && SCORE_REASONS.has(dead.reason) ? 1 : 0) + (maxEnergy >= q['conduct.bigHit'] ? 1 : 0)
      + (sit.period >= 4 && (margin < 0 ? -margin : margin) <= q['conduct.closeMargin'] ? 1 : 0);
    const carrier = w.ball.lastPossessorSlot;
    lateWatch = false;
    for (let s = 0; s < SLOT_COUNT; s++) {
      const dx = w.players.posX[s]! - sx, dy = w.players.posY[s]! - sy;
      if (dx * dx + dy * dy <= q['conduct.nearYd'] * q['conduct.nearYd']) conductFor(w, s, weight, victim[s] === 1, t);
      if (carrier >= 0 && w.slots[s]!.side !== w.slots[carrier]!.side && dist(w, s, carrier) <= q['late.watchYd'] && speed(w, s) >= q['late.watchYps']) lateWatch = true;
    }
  };

  /** J10.4.3 contact with the kicker or holder after the kick, and kick catch interference. */
  const kicks = (w: TickWorld, q: FoulsInjuriesParams, t: number): void => {
    if (kickTick >= 0 && kicker >= 0 && kickKindNow !== null && PLACE_OR_PUNT.has(kickKindNow) && (w.tick - kickTick) * TICK_S <= q['kick.windowS']) {
      let holder = -1;
      for (let s = 0; s < SLOT_COUNT; s++) if (w.players.behavior[s] === BEH_HOLDER && w.slots[s]!.side === w.slots[kicker]!.side) { holder = s; break; }
      for (let d = 0; d < SLOT_COUNT; d++) {
        if (kickHit[d] === 1 || w.slots[d]!.side === w.slots[kicker]!.side) continue;
        const victimSlot = touching(w, d, kicker, q) ? kicker : holder >= 0 && touching(w, d, holder, q) ? holder : -1;
        if (victimSlot < 0) continue;
        kickHit[d] = 1;
        // B8.3.3 exceptions: he touched the kick first, or he was blocked into the kicker.
        if (d === blockedBy || d === touchedKick || w.players.engagement[d]! >= 0) continue;
        contactNumbers(w.players.posX[victimSlot]!, w.players.posY[victimSlot]!, w.players.velX[victimSlot]!, w.players.velY[victimSlot]!, w.slots[victimSlot]!.player.weightLb, w.players.gazeRad[victimSlot]!,
          w.players.posX[d]!, w.players.posY[d]!, w.players.velX[d]!, w.players.velY[d]!, w.slots[d]!.player.weightLb, kp!, cn);
        const closing = cn.closingSpeedYps;
        collision(w, victimSlot, d, t);
        const blockIt = options.blockItCall?.(w.slots[d]!.side as 0 | 1) ?? false;
        const chance = kickerContactChance(closing, z(w, d, 'foul_discipline'), blockIt, q);
        const excess = (closing - q['kick.closingFreeYps']) / q['kick.closingFreeYps'];
        if (victimSlot === holder) { hazard(w, 'roughing_holder', d, chance, excess, t); continue; }
        // Contact type from geometry and force: a severe contact is roughing, a light one running into (B8.3.3).
        const st = foulStream(w, d, 'kicker_contact');
        if (!st.chance(chance)) continue;
        const sev = severityOf(excess, st.uniform(), q);
        const id: LiveFoulId = sev >= q['kick.roughSeverity'] ? 'roughing_kicker' : 'running_into_kicker';
        if (ex!.on[id]) commit(w, id, d, t, sev, 'live');
      }
    }
    // Kick catch interference: a cover man reaches a receiver moving to catch an airborne kick before it comes down.
    const b = w.ball;
    if (b.kind !== 'kickInFlight' || b.kickKind === null || b.velHeight >= 0) return;
    const landS = b.heightYd / -b.velHeight, lx = b.x + b.velX * landS, ly = b.y + b.velY * landS;
    const kickSide = kicker >= 0 ? w.slots[kicker]!.side : w.situation.offense;
    for (let r = 0; r < SLOT_COUNT; r++) {
      if (w.players.behavior[r] !== BEH_RETURNER || w.slots[r]!.side === kickSide) continue;
      const rx = w.players.posX[r]! - lx, ry = w.players.posY[r]! - ly;
      if (rx * rx + ry * ry > q['kci.catchableYd'] * q['kci.catchableYd']) continue;
      for (let d = 0; d < SLOT_COUNT; d++) {
        if (kciDone[d] === 1 || w.slots[d]!.side !== kickSide || dist(w, d, r) > q['kci.contactYd']) continue;
        kciDone[d] = 1;
        const id: LiveFoulId = fairSignal === r ? 'fair_catch_interference' : 'kick_catch_interference';
        hazard(w, id, d, kickCatchInterferenceChance(landS, z(w, d, 'coverage_lane_discipline'), q), landS, t);
      }
    }
  };

  /** J10.6.1 non-contact exposures: a maximum sprint begun, a hard cut or deceleration. */
  const nonContact = (w: TickWorld, q: FoulsInjuriesParams, t: number): void => {
    const pl = w.players;
    for (let s = 0; s < SLOT_COUNT; s++) {
      const vx = pl.velX[s]!, vy = pl.velY[s]!, v = dSqrt(vx * vx + vy * vy), vmax = w.slots[s]!.movement.vMaxYps;
      if (!isDown(w, s)) {
        if (v >= q['injury.sprintShare'] * vmax) { if (inSprint[s] === 0) { inSprint[s] = 1; exposure(w, s, MECH_SPRINT, 1, t, q['wear.sprintLoad']); } }
        else inSprint[s] = 0;
        const ax = (vx - prevVx[s]!) / TICK_S, ay = (vy - prevVy[s]!) / TICK_S;
        if (w.tick >= cutReady[s]! && dSqrt(ax * ax + ay * ay) >= q['injury.cutYps2']) { cutReady[s] = w.tick + Math.round(q['injury.cutRefractoryS'] / TICK_S); exposure(w, s, MECH_CUT, 1, t, q['wear.cutLoad']); }
      }
      prevVx[s] = vx; prevVy[s] = vy;
    }
  };

  const stage: PlayStage = {
    name: 'interact',
    begin(w: TickWorld): void {
      p = foulsInjuriesParams(w.params); kp = kinParams(w.params);
      // The reference tackle through kinematics' own formula: carrier at the origin, tackler one yard east, closing head-on.
      contactNumbers(0, 0, 0, 0, p['energy.typicalCarrierLb'], 0, 1, 0, -p['energy.typicalClosingYps'], 0, p['energy.typicalTacklerLb'], kp, cn);
      typicalEnergy = cn.hitEnergy > 0 ? cn.hitEnergy : 1;
      if (ex === null || ex.rulesId !== w.rules.id) ex = readRules(w.rules);
      foulStreams.clear(); injuryStreams.clear();
      holdUntil.fill(0); holdDef.fill(-1); holdDone.fill(0); faceDone.fill(0); faceDoneDef.fill(0); covDone.fill(0);
      passerHit.fill(0); lateHit.fill(0); kickHit.fill(0); kciDone.fill(0); intentDone.fill(0); injured.fill(0); evaluated.fill(0);
      idfContact.fill(0); idfBreak.fill(NaN); idfMax.fill(-Infinity);
      firstNear.fill(NEVER); inSprint.fill(0); cutReady.fill(0); oobTick.fill(NEVER); victim.fill(0); conductDone.fill(0); catchTick.fill(-1);
      load.fill(0); soreness.fill(0); contestSeen.length = 0; blockedAtSnap.fill(0); eligibleFilled = false;
      for (let s = 0; s < SLOT_COUNT; s++) { prevVx[s] = w.players.velX[s]!; prevVy[s] = w.players.velY[s]!; }
      evaluations.length = 0; missed.length = 0; explainRows.length = 0;
      cursor = w.events.length; releaseTick = -1; passer = -1; target = -1; forward = false;
      kickTick = -1; kicker = -1; kickKindNow = null; blockedBy = -1; changed = false; fumbled = false;
      maxEnergy = 0; lateWatch = false; deadDone = false; fairSignal = -1; touchedKick = -1;
    },
    run(w: TickWorld): void {
      if (w.tick < 0 || p === null) return;
      const q = p, t = tNow(w);
      if (w.deadAtTick === null) {
        if (w.tick === 0) for (let s = 0; s < SLOT_COUNT; s++) if (w.slots[s]!.player.gameDay.playingHurt.length > 0) exposure(w, s, MECH_OVERUSE, 1, t, 1);
        if (w.tick === 0) {
          eligibleFilled = false;
          for (let s = 0; s < SLOT_COUNT; s++) {
            if (w.slots[s]!.side === w.situation.offense && w.players.eligible[s] === 1) eligibleFilled = true;
            blockedAtSnap[s] = SNAP_BLOCKERS.has(w.players.behavior[s]!) ? 1 : 0;
          }
        }
        trackDownfield(w);
        scanEvents(w);
        blocking(w, q, t);
        coverage(w, q, t);
        intents(w, q, t);
        kicks(w, q, t);
        lateHits(w, q, t);
        nonContact(w, q, t);
        return;
      }
      // The whistle: finish this tick's events first, then conduct; after it, only fouls, injuries and detail.
      scanEvents(w);
      if (!deadDone) atWhistle(w, q);
      lateHits(w, q, t);
    },
  };

  return {
    stages: [stage],
    hitLoad: (slot) => load[slot] ?? 0,
    // Conduct is drawn on the first tick after the whistle, so that tick is always wanted; after it, only while a late hit is possible.
    wantsAfterWhistle: (w) => w.deadAtTick !== null && (!deadDone || lateWatch),
    explain: () => explainRows,
    record: () => ({ evaluations, missed, soreness, hitLoad: load }),
  };
}
