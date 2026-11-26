// Player AI as the Decide stage of the tick (J1.3.1, J4.4.1, K1). Each tick has two passes over the
// 22 slots. Pass A runs every player's compiled assignment on his perceived view and stores the
// result. Pass B lays the K1 choices over it, player by player, from that player's own view and own
// state only: effort (K1.2.1), the mental error drawn at the snap (J4.5.2, J4.5.3, K1.7.4), acts
// outside the call (K1.3.1, K1.3.2, K1.3.3, K1.7.5), accidents (K1.7.2). No player reads another's
// same-tick decision, so the order of evaluation cannot change a result (J4.4.1 acceptance).
//
// This is the only file of the module that touches the world. From it a decision takes the player's
// own state (his fatigue, whether he is engaged, his own attributes) and public facts (score, rule
// values). Everything about anyone else comes through `PerceivedView` (K1.6.1).
//
// Draws: every random number of a player's play is taken from his `mental` stream at `begin`, in a
// fixed order (the J4.5.2 draw first, the J4.5.3 form second, then the K1.7 block), so an optional
// trigger never shifts a later draw (K1.7.2 inputs).
import {
  BEHAVIORS, MOVE_MODES, SLOTS_PER_TEAM, SLOT_COUNT, TICK_S, foulKey, roundSimS,
  type Behavior, type CompiledAssignment, type Intent, type MoveMode, type PerceivedEntity, type PerceivedView, type RuleKeyManifest, type TickWorld,
} from '@gm/schema';
import { dCos, dSin, PI } from '../dmath.ts';
import type { PlayStage } from '../tick/loop.ts';
import {
  ballInBackfield, backfieldDecoy, beatenBlocker, beatenDeep, carrierWithin, distTo, freeRusher, inZoneHole, isLastLine, nearestReceiver, newCue,
  receiverBreaking, secondNearestOpponent, secondNearestToSelf, sideOfNearestTeammate, temptationSeen, trafficOnPath, uncoveredDeep,
} from './cues.ts';
import {
  accidentChance, clip, commQuality, composureMult, confidence, confidenceSeen, coordinationCostEst, correctionChance, deliveryBonus, effortLevel, effortMean, effortNow,
  errorChances, facetZ, foulThreshold, gambleThreshold, heardChance, interferenceCostEst, issZ, passesGate, patienceShift, scrambleRuleChance,
  selfWeight, situationMissChance,
} from './formulas.ts';
import {
  CHECKPOINTS, ERROR_FORMS, GENERIC_ERROR_FORMS, MOTIVES, OFFSIDE_FORM, PRESNAP_FORMS, ROUTE_BANDS, SELF_FORMS, SELF_MOTIVES, TRIGGER_DEFS, behaviorGroup,
  type DeviationKind, type FormDef, type Motive, type Primitive, type TriggerDef,
} from './forms.ts';
import type { MatchupMemory } from './learning.ts';
import { SITUATION_FAMILIES, type PlayContext, type SituationFamily, type SlotPlay, type TriggerId } from './mind.ts';
import { playerAiParams, type PlayerAiParams } from './params.ts';

/** One row of the K1.7.1 deviation record. Hidden truth: only the coaching school (N5) shows it. */
export interface DeviationRow {
  readonly slot: number;
  readonly playerId: number;
  readonly kind: DeviationKind;
  readonly motive: Motive;
  readonly form: string;
  readonly tick: number;
  /** The leaf that produced it. */
  readonly leaf: string;
  readonly teamValueEst: number;
  readonly selfValueEst: number;
  /** Filled after the play from N2 expected points by the game layer. */
  outcomeEP: number | null;
  readonly knownToTeammates: boolean;
}
export interface MentalError { readonly cause: 'knowledge' | 'discipline' | 'communication'; readonly form: string; readonly prim: Primitive; readonly motive: Motive }
/** K1.3.3 output for J10.1.1: he means to foul this opponent if he reaches him. */
export interface FoulIntent { readonly slot: number; readonly foulId: string; readonly targetSlot: number; readonly tick: number }
/** J4.6.2 explain record: changes only. `rule` is the rule index that fired, or -1 for a K1 note. */
export interface ExplainEntry { readonly tick: number; readonly slot: number; readonly rule: number; readonly note: string }
export interface LoafRow { readonly slot: number; readonly playerId: number; readonly tick: number; readonly effort: number }

export interface PlayerAiOptions {
  /** The perception module's view of a slot (WP-11). The same object may be returned every tick. */
  view(slot: number): PerceivedView;
  /** J3.4.1 gaze hooks of the perception module, for a defender who peeks in the backfield. */
  readonly gaze?: { atBall(slot: number): void } | null;
  /** J3.6.1: a veteran calls his adjustment to the teammates who depend on him (K1.7.5 rule 3). */
  readonly call?: ((world: TickWorld, senderSlot: number, listeners: readonly number[], call: string) => void) | null;
  /** J4.4.1 acceptance: a shuffled evaluation order. Never set in a game. */
  readonly test?: { readonly order?: readonly number[] };
}

export interface PlayerAi {
  readonly stage: PlayStage;
  /** Call before the loop's `begin` for the play. `memory` is the game's K1.4.1 matchup memory. */
  setPlay(slots: readonly (SlotPlay | null)[], context?: PlayContext, memory?: MatchupMemory | null): void;
  deviations(): readonly DeviationRow[];
  loafs(): readonly LoafRow[];
  explain(): readonly ExplainEntry[];
  /** The J4.5.2 result for a slot. The pre-snap phase (J5) reads it for alignment and offside forms. */
  errorOf(slot: number): MentalError | null;
  /** K1.2.1 effort level drawn for the snap. Readers: J2 (through the intent), J6 finish terms, J8 second effort. */
  effortOf(slot: number): number;
  /** K1.3.1 rule 4: he chose the strip over the secure tackle. Reader: J6.7. */
  stripAttempt(slot: number): boolean;
  /** K1.3.3. Reader: J10.1.1. */
  foulIntent(slot: number): FoulIntent | null;
  /**
   * K1.7.3: does he do the situation's act? One draw per family per play, pre-taken. A miss writes a
   * `didNotKnow` row; the caller (J8, J4.2.2) then has him do the ordinary act.
   */
  situational(world: TickWorld, slot: number, family: SituationFamily): boolean;
  /** K1.7.2 rule 4: J12.5.1 reports a slip so the record holds it; nothing is drawn here. */
  recordSlip(world: TickWorld, slot: number): void;
  /** K1.5.1 `commQuality` of a unit of the play context, by index. Readers: J3.6.1, J5.4.2, J5.5.2. */
  commQuality(unit: number): number;
  /** Addition to the J3.6.1 delivery chance for calls made by that unit's communicator. */
  deliveryBonus(unit: number): number;
  /** K1.3.2 rule 3. Reader: J8. */
  patienceShift(slot: number): number;
}

/** Rule keys read (K1.3.3: enforcement is read from the rule set, never typed). All exist in the WP-01 dictionary. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'foul.dpi.exists', type: 'boolean', meaning: 'Defensive pass interference exists at this level', ownerLeaf: 'B8', readBy: ['engine-core.playerAi'] },
  { key: 'foul.dpi.spot_foul', type: 'boolean', meaning: 'Defensive pass interference is enforced at the spot of the foul', ownerLeaf: 'B8', readBy: ['engine-core.playerAi'] },
  { key: 'foul.dpi.yards', type: 'number', unit: 'yd', meaning: 'Defensive pass interference distance when not a spot foul', ownerLeaf: 'B8', readBy: ['engine-core.playerAi'] },
  { key: 'foul.dpi.max_yards', type: 'number', unit: 'yd', meaning: 'Cap on defensive pass interference yardage (0 = no cap)', ownerLeaf: 'B13.5.1', readBy: ['engine-core.playerAi'] },
  { key: 'foul.dpi.afd', type: 'boolean', meaning: 'Defensive pass interference gives an automatic first down', ownerLeaf: 'B8', readBy: ['engine-core.playerAi'] },
  { key: 'foul.offensive_holding.exists', type: 'boolean', meaning: 'Offensive holding exists at this level', ownerLeaf: 'B8', readBy: ['engine-core.playerAi'] },
  { key: 'foul.offensive_holding.yards', type: 'number', unit: 'yd', meaning: 'Offensive holding distance', ownerLeaf: 'B8', readBy: ['engine-core.playerAi'] },
  { key: 'score.touchdown', type: 'number', unit: 'points', meaning: 'Points for a touchdown', ownerLeaf: 'B7', readBy: ['engine-core.playerAi'] },
];
const DPI = 'dpi', HOLD = 'offensive_holding';

/** `detail` event codes this module emits (contract decision D-16). */
export const DETAIL_CODES = ['playerAi.deviation', 'playerAi.loaf', 'playerAi.corrected', 'playerAi.scramble_rule', 'playerAi.improvise', 'playerAi.freedom'] as const;

// Layout of the pre-taken draws of one player (uniforms, then normals).
const U_ERR = 0, U_FORM = 1, U_MOTIVE = 2, U_SELF_FORM = 3, U_CORRECT = 4, U_HEARD = 5, U_SCRAMBLE = 6, U_ACC = 7;
const ACC_SLOTS = 8, ACC_DRAWS = 3, U_SIT = U_ACC + ACC_SLOTS * ACC_DRAWS, U_COUNT = U_SIT + SITUATION_FAMILIES.length;
const N_EFFORT = 0, N_EST = 1, N_FOUL = 2, N_COUNT = 3;

const P_NONE = 0;
const PRIMS: readonly (Primitive | 'none')[] = ['none', 'mirror', 'mirrorAfterRule', 'depth', 'shallow', 'lateral', 'wrongMan', 'chase', 'chaseFake', 'jump',
  'late', 'deaf', 'blind', 'alternate', 'standDown', 'halfEffort', 'presnap'];
const primCode = (x: Primitive): number => PRIMS.indexOf(x);
const P_MIRROR = primCode('mirror'), P_MIRROR_RULE = primCode('mirrorAfterRule'), P_DEPTH = primCode('depth'), P_SHALLOW = primCode('shallow'),
  P_LATERAL = primCode('lateral'), P_WRONG_MAN = primCode('wrongMan'), P_CHASE = primCode('chase'), P_CHASE_FAKE = primCode('chaseFake'),
  P_JUMP = primCode('jump'), P_LATE = primCode('late'), P_STAND = primCode('standDown'), P_HALF = primCode('halfEffort');
const CAUSES = ['none', 'knowledge', 'discipline', 'communication'] as const;
const SPRINT = MOVE_MODES.indexOf('sprint'), RUN = MOVE_MODES.indexOf('run');
const ARRIVALS: readonly Intent['arrival'][] = ['arrive', 'breakdown', 'through'];
const THROUGH = 2, ARRIVE = 0;
const KNOWLEDGE_FULL = 100, KNOWLEDGE_MID = 50, DEG = PI / 180;
const SCR_NONE = 0, SCR_DEEP = 1, SCR_CROSS = 2, SCR_BACK = 3, SCR_NO_RULE = 4, SCR_SIT = 5;

/** A view with something taken away: how a `deaf` or `blind` error reaches the player's own rules. Still only perceived state. */
class FilteredView implements PerceivedView {
  inner: PerceivedView;
  deaf = false;
  blindSlot = -1;
  constructor(inner: PerceivedView) { this.inner = inner; }
  get selfSlot(): number { return this.inner.selfSlot; }
  get tSinceSnapS(): number { return this.inner.tSinceSnapS; }
  get self(): PerceivedView['self'] { return this.inner.self; }
  entity(slot: number): PerceivedEntity | null { return slot === this.blindSlot ? null : this.inner.entity(slot); }
  ball(): PerceivedEntity | null { return this.inner.ball(); }
  ballKind(): ReturnType<PerceivedView['ballKind']> { return this.inner.ballKind(); }
  playRead(): ReturnType<PerceivedView['playRead']> { return this.inner.playRead(); }
  believedCarrierSlot(): number { return this.inner.believedCarrierSlot(); }
  heard(call: string): boolean { return this.deaf ? false : this.inner.heard(call); }
  receiverNumber(slot: number): number { return this.inner.receiverNumber(slot); }
}

function pickBy(u: number, weights: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i]!;
  if (total <= 0) return -1;
  let at = u * total;
  for (let i = 0; i < weights.length; i++) { at -= weights[i]!; if (at < 0) return i; }
  return weights.length - 1;
}

export function createPlayerAi(options: PlayerAiOptions): PlayerAi {
  const viewOf = options.view, gaze = options.gaze ?? null, callOut = options.call ?? null;
  const order: readonly number[] = options.test?.order ?? Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const f = () => new Float64Array(SLOT_COUNT), u8 = () => new Uint8Array(SLOT_COUNT), i32 = () => new Int32Array(SLOT_COUNT);

  let plays: readonly (SlotPlay | null)[] = [];
  let context: PlayContext = {};
  let memory: MatchupMemory | null = null;
  let p: PlayerAiParams | null = null, paramsOf: unknown = null;
  let decided = false, qbSlot = -1;
  let dpiOn = false, dpiSpot = false, dpiYards = 0, dpiMax = 0, dpiAfd = false, holdOn = false, holdYards = 0, touchdown = 0;

  const uni = new Float64Array(SLOT_COUNT * U_COUNT), nor = new Float64Array(SLOT_COUNT * N_COUNT);
  // Pass A results.
  const hasT = u8(), tx = f(), ty = f(), tvx = f(), tvy = f(), hasF = u8(), fx = f(), fy = f(), eff = f(), mode = u8(), arr = u8();
  const beh: Behavior[] = new Array<Behavior>(SLOT_COUNT).fill('none'), behState = u8(), fired = i32(), seen = u8();
  const startPx = f(), startPy = f(), eventBase = f();
  // Error state.
  const errCause = u8(), errPrim = u8(), errSize = f(), errSign = new Int8Array(SLOT_COUNT), useAlt = u8(), ruleFired = u8(), released = u8();
  const errors: (MentalError | null)[] = new Array<MentalError | null>(SLOT_COUNT).fill(null);
  const filters: (FilteredView | null)[] = new Array<FilteredView | null>(SLOT_COUNT).fill(null), filterOn = u8();
  // Acts outside the call.
  const deliberate = u8(), act = new Int8Array(SLOT_COUNT), actSlot = new Int8Array(SLOT_COUNT), actPx = f(), actPy = f(), strip = u8();
  const fouls: (FoulIntent | null)[] = new Array<FoulIntent | null>(SLOT_COUNT).fill(null);
  const scramble = u8(), scrPx = f(), scrPy = f(), qbSeenPy = f(), qbSeen = u8();
  // Accidents and holds.
  const cpCount = u8(), cpTx = f(), cpTy = f(), cpHas = u8(), accDx = f(), accDy = f(), holdUntil = i32(), rerouted = u8();
  const prevHasT = u8(), prevTx = f(), prevTy = f(), prevMode = u8(), prevArr = u8();
  // Effort.
  const level = f(), halfEffort = u8(), loafed = u8();
  const sitDone = new Uint8Array(SLOT_COUNT * SITUATION_FAMILIES.length);
  const unitOf = new Int8Array(SLOT_COUNT), unitQuality: number[] = [];
  const points: { px: number; py: number }[] = [], faces: { px: number; py: number }[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) { points.push({ px: 0, py: 0 }); faces.push({ px: 0, py: 0 }); }
  const rows: DeviationRow[] = [], loafRows: LoafRow[] = [], explainRows: ExplainEntry[] = [];
  const cue = newCue(), chances = new Float64Array(2), weights: number[] = [];

  const attr = (world: TickWorld, s: number, id: string): number => world.slots[s]!.player.attributes[id] ?? KNOWLEDGE_MID;
  const sideIndex = (s: number): 0 | 1 => (s < SLOTS_PER_TEAM ? 0 : 1);
  const now = (world: TickWorld): number => roundSimS(world.tick * TICK_S);
  const knowledgeOf = (world: TickWorld, s: number, sp: SlotPlay): number => world.slots[s]!.player.gameDay.knowledge[sp.conceptId] ?? KNOWLEDGE_FULL;
  const composureOf = (world: TickWorld, s: number, sp: SlotPlay): number =>
    composureMult(context.pressure ?? 0, attr(world, s, 'composure'), sp.mind.highLeverageSnaps, p!);

  function record(world: TickWorld, s: number, kind: DeviationKind, motive: Motive, form: string, leaf: string, teamValueEst: number, selfValueEst: number, known: boolean): void {
    const playerId = world.slots[s]!.playerId;
    rows.push({ slot: s, playerId, kind, motive, form, tick: world.tick, leaf, teamValueEst, selfValueEst, outcomeEP: null, knownToTeammates: known });
    world.emit({ type: 'detail', t: now(world), code: `playerAi.deviation.${kind}.${motive}.${form}`, playerIds: [playerId], spot: null, value: teamValueEst });
  }
  function note(world: TickWorld, s: number, rule: number, text: string): void { explainRows.push({ tick: world.tick, slot: s, rule, note: text }); }
  function detail(world: TickWorld, s: number, code: string, value: number | null): void {
    world.emit({ type: 'detail', t: now(world), code, playerIds: [world.slots[s]!.playerId], spot: null, value });
  }

  // ---------- begin ----------

  function begin(world: TickWorld): void {
    if (paramsOf !== world.params) { p = playerAiParams(world.params); paramsOf = world.params; }
    const q = p!;
    decided = false; qbSlot = context.qbSlot ?? -1;
    rows.length = 0; loafRows.length = 0; explainRows.length = 0; unitQuality.length = 0;
    errCause.fill(0); errPrim.fill(P_NONE); useAlt.fill(0); ruleFired.fill(0); released.fill(0); filterOn.fill(0); errors.fill(null);
    deliberate.fill(0); act.fill(-1); actSlot.fill(-1); strip.fill(0); fouls.fill(null); scramble.fill(SCR_NONE); qbSeen.fill(0);
    cpCount.fill(0); cpHas.fill(0); accDx.fill(0); accDy.fill(0); holdUntil.fill(-2147483648); rerouted.fill(0); prevHasT.fill(0);
    halfEffort.fill(0); loafed.fill(0); sitDone.fill(0); seen.fill(0); fired.fill(-1); unitOf.fill(-1); level.fill(1);

    const keys = new Set(world.rules.keys()), has = (k: string): boolean => keys.has(k);
    dpiOn = has(foulKey(DPI, 'exists')) && world.rules.bool(foulKey(DPI, 'exists')) && has('score.touchdown');
    if (dpiOn) {
      dpiSpot = world.rules.bool(foulKey(DPI, 'spot_foul')); dpiYards = world.rules.num(foulKey(DPI, 'yards')); dpiAfd = world.rules.bool(foulKey(DPI, 'afd'));
      dpiMax = has('foul.dpi.max_yards') ? world.rules.num('foul.dpi.max_yards') : 0; touchdown = world.rules.num('score.touchdown');
    }
    holdOn = has(foulKey(HOLD, 'exists')) && world.rules.bool(foulKey(HOLD, 'exists'));
    if (holdOn) holdYards = world.rules.num(foulKey(HOLD, 'yards'));

    const sit = world.situation;
    for (let s = 0; s < SLOT_COUNT; s++) {
      const sp = plays[s] ?? null;
      if (sp === null) continue;
      eventBase[s] = sp.compiled?.eventBase ?? Infinity;
      const stream = world.streams('mental', [sit.gameId, sit.playNumber, world.slots[s]!.playerId]);
      for (let i = 0; i < U_COUNT; i++) uni[s * U_COUNT + i] = stream.uniform();
      for (let i = 0; i < N_COUNT; i++) nor[s * N_COUNT + i] = stream.normal();
      const side = world.slots[s]!.side, margin = sit.score[side] - sit.score[side === 0 ? 1 : 0];
      level[s] = effortLevel(effortMean(sp.mind, margin, context.secondHalf === true, q), nor[s * N_COUNT + N_EFFORT]!, q);
    }
    const units = context.units ?? [];
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!, c = unit.communicator, side = sideIndex(c);
      for (const m of unit.members) unitOf[m] = i;
      unitOf[c] = i;
      const talk = side === 0 ? 'protection_calls' : 'front_and_coverage_checks';
      unitQuality.push(plays[c] ? commQuality(attr(world, c, talk), attr(world, c, 'play_recognition'), context.noise?.[side] ?? 0, context.tempo ?? 0, q) : 0);
    }
  }

  // ---------- J4.5.2, J4.5.3, K1.5.1, K1.7.4: the error of the play ----------

  function setError(world: TickWorld, s: number, cause: 1 | 2 | 3, forced: FormDef | null): void {
    const q = p!, sp = plays[s]!, view = viewOf(s), group = behaviorGroup(beh[s]!), base = s * U_COUNT;
    let motive: Motive, def: FormDef | null = forced, selfValue = 0;
    if (cause === 2) {
      const w = selfWeight(sp.mind, q), stat = sp.statChance ?? q.statChanceDefault;
      const lowBuyIn = (q.selfBuyInMid - sp.mind.buyIn) / q.selfBuyInSpan;
      weights.length = 0;
      weights.push(w * stat, group === 'carry' || group === 'route' ? w * stat : 0, sp.mind.roleGap + (lowBuyIn > 0 ? lowBuyIn : 0),
        sp.mind.stress + sp.mind.losingContests, sp.mind.showcase ? w : 0);
      let real = 0;
      for (let i = 0; i < weights.length; i++) real += weights[i]!;
      weights[3] = weights[3]! + q.motiveFloor;
      const m = SELF_MOTIVES[pickBy(uni[base + U_MOTIVE]!, weights)]!;
      motive = m === 'stats' && sp.mind.needSelf >= 1 ? 'contract' : m;
      // A player with no selfish pull still makes discipline errors; his form comes from the J4.5.3 list (K1.7.4 edge case).
      const list = real > 0 && group !== null ? SELF_FORMS[m][group] : undefined;
      if (list !== undefined) {
        weights.length = 0;
        for (const x of list) weights.push(x.weight);
        def = list[pickBy(uni[base + U_SELF_FORM]!, weights)]!;
        if (m === 'stats' || m === 'showcase') selfValue = group === 'rush' ? q.creditSack : group === 'cover' ? q.creditInterception : group === 'fit' ? q.creditTackle : q.creditCatch;
        else if (m === 'touches') selfValue = group === 'carry' ? q.creditCarry : q.creditCatch;
      }
    } else if (cause === 3) motive = 'misread';
    else motive = knowledgeOf(world, s, sp) < KNOWLEDGE_MID ? 'notInstalled' : 'forgot';

    if (def === null) {
      const list = ERROR_FORMS[beh[s]!] ?? GENERIC_ERROR_FORMS, presnap = world.tick < 0, complexity = sp.complexity ?? 0;
      const all: FormDef[] = [...list];
      if (presnap) { all.push(...PRESNAP_FORMS); if (group === 'rush') all.push(OFFSIDE_FORM); }
      weights.length = 0;
      for (const x of all) {
        let w = x.prim === 'presnap' ? x.weight * q.presnapFormWeight * list.length : x.weight;
        if (x.leans === 'old' && cause === 3) w *= q.causeWeightShift;
        if (x.leans === 'man') w *= 1 + complexity;
        weights.push(w);
      }
      def = all[pickBy(uni[base + U_FORM]!, weights)]!;
    }
    let prim: Primitive = def.prim;
    if (prim === 'alternate') { if (sp.alternate) useAlt[s] = 1; else prim = 'mirror'; }
    if (prim === 'deaf' || prim === 'blind') {
      const fv = filters[s] ?? (filters[s] = new FilteredView(view));
      fv.deaf = prim === 'deaf'; fv.blindSlot = prim === 'blind' ? secondNearestToSelf(view) : -1;
      filterOn[s] = 1;
    }
    errCause[s] = cause; errPrim[s] = primCode(prim); errSize[s] = def.size ? q[def.size] : 0;
    if (def.sign !== undefined) errSign[s] = def.sign;
    else if (def.form === 'bouncedOutside') errSign[s] = startPy[s]! < 0 ? -1 : 1;
    else if (def.form === 'driftedIntoTeammate') errSign[s] = sideOfNearestTeammate(view);
    else errSign[s] = uni[base + U_SELF_FORM]! < 1 / 2 ? -1 : 1;
    if (prim === 'halfEffort' || prim === 'standDown') halfEffort[s] = 1;
    deliberate[s] = 1;
    const error: MentalError = { cause: CAUSES[cause], form: def.form, prim, motive };
    errors[s] = error;
    world.emit({ type: 'mental_error', t: now(world), playerId: world.slots[s]!.playerId, cause: error.cause, form: def.form });
    record(world, s, MOTIVES[motive].kind, motive, def.form, cause === 2 ? 'K1.7.4' : cause === 3 ? 'K1.5.1' : 'J4.5.2', 0, selfValue, false);
    note(world, s, -1, `mental error (${error.cause}): ${def.form}`);
  }

  function drawError(world: TickWorld, s: number): void {
    const q = p!, sp = plays[s] ?? null;
    if (sp === null || sp.compiled === null || seen[s] === 0) return;
    const view = viewOf(s);
    const tempt = Math.max(sp.temptation ?? 1, temptationSeen(view, hasT[s] === 1, tx[s]!, ty[s]!, q));
    errorChances({
      knowledge: knowledgeOf(world, s, sp), difficulty: sp.difficulty ?? 1, changedAtLine: sp.jobChangedAtLine === true,
      noiseFactor: context.noiseFactor?.[sideIndex(s)] ?? 1, assignmentDiscipline: attr(world, s, 'assignment_discipline'), temptation: tempt,
      buyIn: sp.mind.buyIn, complexity: sp.complexity ?? 0, fatigue: world.players.fatigueNow[s]!, footballIntelligence: attr(world, s, 'football_intelligence'),
      composure: attr(world, s, 'composure'), pressure: context.pressure ?? 0, highLeverageSnaps: sp.mind.highLeverageSnaps,
    }, q, chances);
    const u = uni[s * U_COUNT + U_ERR]!, pK = chances[0]!, pD = chances[1]!;
    if (u < pK) {
      // K1.5.1 rule 2: a communicator who is right himself may fix an unsure teammate before the snap.
      const unit = unitOf[s]!, c = unit >= 0 ? context.units![unit]!.communicator : -1;
      if (c >= 0 && c !== s && errCause[c] !== 1 && uni[s * U_COUNT + U_CORRECT]! < correctionChance(unitQuality[unit]!, context.playClockLeftS ?? 0, q)) {
        detail(world, s, 'playerAi.corrected', null);
        return;
      }
      setError(world, s, 1, null);
    } else if (u < pK + pD) setError(world, s, 2, null);
  }

  const WRONG_CALL: FormDef = { form: 'wrongCall', prim: 'alternate', weight: 1 };
  function decideErrors(world: TickWorld): void {
    const units = context.units ?? [];
    const done = new Uint8Array(SLOT_COUNT);
    for (const unit of units) if (done[unit.communicator] === 0) { done[unit.communicator] = 1; drawError(world, unit.communicator); }
    for (let s = 0; s < SLOT_COUNT; s++) if (done[s] === 0) drawError(world, s);
    // K1.5.1 rule 3: a wrong call made confidently spreads to everyone who hears it.
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!, c = unit.communicator;
      if (errCause[c] !== 1) continue;
      const hear = heardChance(unitQuality[i]!, context.noise?.[sideIndex(c)] ?? 0, p!);
      for (const m of unit.members) {
        if (m === c || errCause[m] !== 0 || !plays[m] || seen[m] === 0) continue;
        if (uni[m * U_COUNT + U_HEARD]! < hear) setError(world, m, 3, WRONG_CALL);
      }
    }
  }

  // ---------- pass B pieces ----------

  function aim(s: number, px: number, py: number, sprint: boolean): void {
    hasT[s] = 1; tx[s] = px; ty[s] = py;
    if (sprint) { mode[s] = SPRINT; arr[s] = THROUGH; }
  }
  function faceBall(s: number, view: PerceivedView): void {
    const b = view.ball();
    if (b !== null) { hasF[s] = 1; fx[s] = b.px; fy[s] = b.py; }
  }

  function applyError(s: number, view: PerceivedView): void {
    const q = p!, prim = errPrim[s]!;
    if (prim === P_MIRROR || (prim === P_MIRROR_RULE && ruleFired[s] === 1)) {
      if (hasT[s] === 1) ty[s] = 2 * startPy[s]! - ty[s]!;
      if (hasF[s] === 1) fy[s] = 2 * startPy[s]! - fy[s]!;
      tvy[s] = -tvy[s]!;
    } else if (prim === P_DEPTH) { if (hasT[s] === 1) tx[s] = tx[s]! + errSign[s]! * errSize[s]!; }
    else if (prim === P_SHALLOW) { if (hasT[s] === 1 && tx[s]! > startPx[s]! + errSize[s]!) tx[s] = startPx[s]! + errSize[s]!; }
    else if (prim === P_LATERAL) { if (hasT[s] === 1) ty[s] = ty[s]! + errSign[s]! * errSize[s]!; }
    else if (prim === P_WRONG_MAN) { if (hasT[s] === 1 && secondNearestOpponent(view, tx[s]!, ty[s]!, cue)) aim(s, cue.px, cue.py, false); }
    else if (prim === P_CHASE) { const b = view.ball(); if (b !== null) aim(s, b.px, b.py, true); }
    else if (prim === P_CHASE_FAKE) {
      if (backfieldDecoy(view, cue)) aim(s, cue.px, cue.py, true);
      else { const b = view.ball(); if (b !== null) aim(s, b.px, b.py, true); }
    } else if (prim === P_JUMP) { if (nearestReceiver(view, q.jumpRangeYd, q, cue)) { aim(s, cue.px, cue.py, true); faceBall(s, view); } }
    else if (prim === P_STAND) { hasT[s] = 0; tvx[s] = 0; tvy[s] = 0; mode[s] = RUN; arr[s] = ARRIVE; }
  }

  function learned(world: TickWorld, s: number, other: number, sp: SlotPlay): number {
    if (memory === null || other < 0) return 0;
    void sp;
    return memory.strongest(world.slots[s]!.playerId, world.slots[other]!.playerId, 'separation', attr(world, s, 'football_intelligence'), p!);
  }

  /** The cue of one act, from his view. Fills `cue`; returns false when he sees nothing that invites it. */
  function cueOf(def: TriggerDef, s: number, view: PerceivedView, sp: SlotPlay): boolean {
    const q = p!;
    cue.eyes = false; cue.slot = -1;
    switch (def.id) {
      case 'sitOnRoute': {
        const tell = sp.tell ?? null;
        if (tell !== null && tell.strength > 0 && distTo(view, tell.px, tell.py) <= q.tellRangeYd) { cue.px = tell.px; cue.py = tell.py; cue.extra = tell.strength; return true; }
        cue.extra = 0;
        return nearestReceiver(view, q.jumpRangeYd, q, cue);
      }
      case 'rescue': return uncoveredDeep(view, q, cue);
      case 'pickUpFree': return freeRusher(view, q, cue);
      case 'jumpRoute': return receiverBreaking(view, qbSlot, false, q, cue);
      case 'undercut': return receiverBreaking(view, qbSlot, true, q, cue);
      case 'shootGap': return view.playRead().read === 'run' && ballInBackfield(view, q.shootGapRangeYd, q, cue);
      case 'peek': return view.tSinceSnapS >= q.peekMinS && view.playRead().read === 'run' && view.ball() !== null;
      case 'strip': return carrierWithin(view, q.stripRangeYd, cue);
      case 'leaveContain': {
        if (sp.contain !== true || qbSlot < 0 || view.believedCarrierSlot() !== qbSlot) return false;
        const qb = view.entity(qbSlot);
        if (qb === null || distTo(view, qb.px, qb.py) > q.containRangeYd) return false;
        cue.slot = qbSlot; cue.px = qb.px; cue.py = qb.py;
        return true;
      }
    }
  }

  function considerActs(world: TickWorld, s: number, view: PerceivedView, sp: SlotPlay): void {
    const q = p!, offense = s < SLOTS_PER_TEAM, kind = view.ballKind(), held = kind === 'held';
    const disc = attr(world, s, 'assignment_discipline'), iq = attr(world, s, 'football_intelligence');
    let lastLine = -1;
    for (let i = 0; i < TRIGGER_DEFS.length; i++) {
      const def = TRIGGER_DEFS[i]!;
      // K1.7.1 rule 3: the deliberate foul is weighed after the gambles and before the selfish in-play form.
      if (def.leaf === 'K1.7.4' && considerFoul(world, s, view, sp)) return;
      if ((def.id === 'pickUpFree') !== offense) continue;
      if (def.id !== 'strip' && !held) continue;
      if (!def.behaviors.includes(beh[s]!)) continue;
      const veteran = def.leaf === 'K1.7.5';
      if (veteran && !passesGate(knowledgeOf(world, s, sp), iq, sp.mind.seasonsInSystem, q)) continue;
      if (!cueOf(def, s, view, sp)) continue;
      const tell = veteran && def.id === 'sitOnRoute' ? cue.extra : 0;
      const learnedZ = learned(world, s, cue.slot, sp);
      // Sitting on a route needs something to go on: the film tell or a read learned this game.
      if (def.id === 'sitOnRoute' && tell <= 0 && learnedZ <= 0) continue;
      const read = view.playRead();
      const conf = def.id === 'strip' || def.id === 'pickUpFree' || def.id === 'rescue' ? confidenceSeen(attr(world, s, 'play_recognition'), q)
        : confidence(read.confidence, attr(world, s, 'play_recognition'), learnedZ, tell, cue.eyes, q);
      let teamValue = q[def.value];
      const selfValue = q[def.credit];
      const deps = sp.dependents ?? [];
      let uncovered = 0;
      if (veteran) {
        for (const d of deps) if (d.cohesion <= q.cohesionOk) uncovered++;
        teamValue -= coordinationCostEst(uncovered, iq, nor[s * N_COUNT + N_EST]!, q);
      }
      if (lastLine < 0) lastLine = !offense && isLastLine(view) ? 1 : 0;
      const ordered = def.id === 'strip' && sp.instruction?.goForStrips === true, allowed = ordered || (sp.freedom ?? []).includes(def.id);
      const last = lastLine === 1 && def.id !== 'strip';
      let tTeam = gambleThreshold(sp.mind, disc, sp.instruction, true, last, q), tSelf = gambleThreshold(sp.mind, disc, sp.instruction, false, last, q);
      if (ordered) { tTeam -= q.thresholdStripOrder; tSelf -= q.thresholdStripOrder; }
      const defyCost = sp.instruction?.noFreelancing ? q.noFreelanceCost * sp.mind.trust / KNOWLEDGE_FULL : 0;
      const forTeam = conf * teamValue > tTeam;
      const forSelf = !forTeam && !veteran && conf * (teamValue + selfWeight(sp.mind, q) * selfValue - defyCost) > tSelf;
      if (!forTeam && !forSelf) continue;

      if (def.id === 'strip') strip[s] = 1;
      else { act[s] = i; actSlot[s] = cue.slot; actPx[s] = cue.px; actPy[s] = cue.py; }
      deliberate[s] = 1;
      note(world, s, -1, allowed ? `${def.note} (allowed by the call)` : def.note);
      if (allowed) { detail(world, s, 'playerAi.freedom', null); return; }
      let known = false;
      if (veteran && deps.length > 0 && callOut !== null) { callOut(world, s, deps.map((d) => d.slot), `adjust:${def.id}`); known = true; }
      const motive: Motive = forSelf ? (sp.mind.needSelf >= 1 ? 'contract' : sp.mind.showcase ? 'showcase' : 'stats')
        : def.id === 'rescue' || def.id === 'pickUpFree' ? 'rescue' : tell > 0 ? 'tell' : 'read';
      record(world, s, forSelf ? 'forSelf' : 'forTeam', motive, def.id, forSelf && def.leaf === 'K1.3.1' ? 'K1.7.4' : def.leaf, teamValue, selfValue, known);
      return;
    }
    considerFoul(world, s, view, sp);
  }

  function considerFoul(world: TickWorld, s: number, view: PerceivedView, sp: SlotPlay): boolean {
    const q = p!, offense = s < SLOTS_PER_TEAM, kind = view.ballKind();
    if (fouls[s] !== null) return false;
    const iqScale = clip(1 - q.estimateSdPerIqZ * issZ(attr(world, s, 'football_intelligence')), 0, 2), eps = nor[s * N_COUNT + N_FOUL]!;
    let loss = 0, cost = 0, foulId = '', motive: Motive = 'preventScore';
    if (!offense && dpiOn && kind === 'passInFlight' && beatenDeep(view, q, cue)) {
      // Rule 3: he estimates the catch with error set by football intelligence, so a low-intelligence player fouls on a ball that was not catchable.
      const catchEst = clip(q.foulCatchEst + q.foulCatchSd * iqScale * eps, 0, 1), toGoal = world.frame.goalLinePx;
      loss = catchEst * (cue.lastLine ? touchdown : (cue.px > 0 ? cue.px : 0) * q.foulEpPerYd);
      cost = interferenceCostEst(cue.px > 0 ? cue.px : 0, toGoal, dpiSpot, dpiYards, dpiMax, dpiAfd, q);
      foulId = DPI;
    } else if (offense && holdOn && kind === 'held' && beh[s] === 'passSet' && beatenBlocker(view, q, cue)) {
      const more = context.sackCostsMore === true;
      loss = q.foulSackEp * (more ? q.foulSackStateMult : 1) * (1 + q.estimateSd * iqScale * eps);
      cost = holdYards * q.foulEpPerYd;
      foulId = HOLD;
      if (more) motive = 'clock';
    } else return false;
    if (loss - cost <= foulThreshold(sp.mind, sp.instruction, q)) return false;
    fouls[s] = { slot: s, foulId, targetSlot: cue.slot, tick: world.tick };
    deliberate[s] = 1;
    note(world, s, -1, foulId === DPI ? 'deliberate foul: prevented a likely touchdown' : 'deliberate foul: held to prevent a sack');
    record(world, s, 'forTeam', motive, `deliberate.${foulId}`, 'K1.3.3', loss - cost, 0, false);
    return true;
  }

  function applyAct(s: number, view: PerceivedView): void {
    const q = p!, def = TRIGGER_DEFS[act[s]!]!, id: TriggerId = def.id;
    if (id === 'peek') { faceBall(s, view); if (gaze !== null) gaze.atBall(s); return; }
    if (id === 'shootGap') { const b = view.ball(); if (b !== null) { actPx[s] = b.px + b.velPx * q.jumpLeadS; actPy[s] = b.py + b.velPy * q.jumpLeadS; } }
    else if (actSlot[s]! >= 0) {
      const e = view.entity(actSlot[s]!), ahead = id === 'pickUpFree' || id === 'leaveContain' ? 0 : q.jumpLeadS;
      if (e !== null) { actPx[s] = e.px + e.velPx * ahead; actPy[s] = e.py + e.velPy * ahead; }
    }
    aim(s, actPx[s]!, actPy[s]!, true);
    if (id !== 'pickUpFree') faceBall(s, view);
  }

  /** K1.3.2: the scramble drill and sitting in a hole. Neither is a deviation: one is an installed rule, the other is a receiver's craft. */
  function improvise(world: TickWorld, s: number, view: PerceivedView, sp: SlotPlay): void {
    const q = p!;
    if (scramble[s] === SCR_NONE && qbSlot >= 0 && qbSlot !== s) {
      const qb = view.entity(qbSlot);
      if (qb !== null) {
        if (qbSeen[s] === 0) { qbSeen[s] = 1; qbSeenPy[s] = qb.py; }
        const moved = qb.py - qbSeenPy[s]!;
        if (qb.px < 0 && (moved > q.scramblePocketYd || moved < -q.scramblePocketYd) && view.believedCarrierSlot() === qbSlot) {
          if (uni[s * U_COUNT + U_SCRAMBLE]! < scrambleRuleChance(sp.scrambleKnowledge ?? 0, q)) {
            const depth = view.self.px, toward = qb.py >= view.self.py ? 1 : -1;
            scramble[s] = depth >= q.scrambleDeepYd ? SCR_DEEP : depth <= q.scrambleShortYd ? SCR_BACK : SCR_CROSS;
            scrPx[s] = depth > q.scrambleComeBackYd + q.backfieldDepthYd ? depth - q.scrambleComeBackYd : q.backfieldDepthYd;
            scrPy[s] = view.self.py + toward * q.scrambleComeBackYd;
            detail(world, s, 'playerAi.scramble_rule', scramble[s]!);
            note(world, s, -1, 'scramble rule');
          } else scramble[s] = SCR_NO_RULE;
        }
      }
    }
    if (scramble[s] === SCR_NONE && act[s]! < 0 && errCause[s] === 0 && inZoneHole(view, q)
      && issZ(attr(world, s, 'zone_awareness')) >= q.adjustAwarenessZ && (sp.chemistry ?? 0) >= q.adjustChemistry) {
      scramble[s] = SCR_SIT; scrPx[s] = view.self.px; scrPy[s] = view.self.py;
      detail(world, s, 'playerAi.improvise', null);
      note(world, s, -1, 'sat down in the hole of the zone');
    }
    const kind = scramble[s]!;
    if (kind === SCR_DEEP) aim(s, view.self.px + q.scrambleGoYd, view.self.py, true);
    else if (kind === SCR_CROSS) { const qb = view.entity(qbSlot); aim(s, view.self.px, view.self.py + (qb !== null && qb.py < view.self.py ? -1 : 1) * q.scrambleGoYd, true); }
    else if (kind === SCR_BACK) aim(s, scrPx[s]!, scrPy[s]!, true);
    else if (kind === SCR_SIT) { aim(s, scrPx[s]!, scrPy[s]!, false); arr[s] = ARRIVE; faceBall(s, view); }
  }

  /** K1.7.2: a new landmark target is a check point; draw once, and carry the offset while that target stands. */
  function accidents(world: TickWorld, s: number, view: PerceivedView, sp: SlotPlay): void {
    const q = p!, cp = CHECKPOINTS[beh[s]!];
    if (cp === undefined || hasT[s] === 0) return;
    const jump = q.checkpointJumpYd;
    const dx = tx[s]! - cpTx[s]!, dy = ty[s]! - cpTy[s]!;
    if (cpHas[s] === 1 && dx * dx + dy * dy < jump * jump) { tx[s] = cpTx[s]! + accDx[s]! + dx; ty[s] = cpTy[s]! + accDy[s]! + dy; return; }
    const fromX = cpHas[s] === 1 ? cpTx[s]! : view.self.px, fromY = cpHas[s] === 1 ? cpTy[s]! : view.self.py;
    cpHas[s] = 1; cpTx[s] = tx[s]!; cpTy[s] = ty[s]!; accDx[s] = 0; accDy[s] = 0;
    const k = cpCount[s]!;
    if (k >= ACC_SLOTS) return;
    cpCount[s] = k + 1;
    const base = s * U_COUNT + U_ACC + k * ACC_DRAWS, fatigue = world.players.fatigueNow[s]!;
    let technique = cp.technique;
    if (beh[s] === 'route') { const depth = tx[s]! < 0 ? -tx[s]! : tx[s]!; for (const band of ROUTE_BANDS) if (depth <= band.maxYd) { technique = band.technique; break; } }
    const traffic = trafficOnPath(view, tx[s]!, ty[s]!, q), composure = composureOf(world, s, sp);
    if (uni[base]! >= accidentChance(issZ(attr(world, s, technique)), fatigue, rerouted[s] === 1, traffic, composure, q)) return;
    weights.length = 0;
    for (const x of cp.forms) weights.push(x.weight);
    const form = cp.forms[pickBy(uni[base + 1]!, weights)]!, u = uni[base + 2]!, sign = u < 1 / 2 ? -1 : 1, frac = u < 1 / 2 ? u * 2 : (u - 1 / 2) * 2;
    if (form.prim === 'depth') accDx[s] = sign * (q.accidentDepthMinYd + (q.accidentDepthMaxYd - q.accidentDepthMinYd) * frac);
    else if (form.prim === 'landmark') accDy[s] = sign * (q.accidentLandmarkMinYd + (q.accidentLandmarkMaxYd - q.accidentLandmarkMinYd) * frac);
    else if (form.prim === 'angle') {
      const a = sign * (q.accidentAngleMinDeg + (q.accidentAngleMaxDeg - q.accidentAngleMinDeg) * frac) * DEG, c = dCos(a), sn = dSin(a);
      const lx = tx[s]! - fromX, ly = ty[s]! - fromY;
      accDx[s] = lx * c - ly * sn - lx; accDy[s] = lx * sn + ly * c - ly;
    } else {
      const lostS = q.accidentStepMinS + (q.accidentStepMaxS - q.accidentStepMinS) * frac;
      holdUntil[s] = world.tick + Math.round(lostS / TICK_S);
    }
    tx[s] = tx[s]! + accDx[s]!; ty[s] = ty[s]! + accDy[s]!;
    const motive: Motive = rerouted[s] === 1 ? 'contact' : traffic > 0 ? 'traffic' : fatigue >= 1 / 2 ? 'fatigue' : composure > 1 ? 'panic' : 'technique';
    record(world, s, 'accident', motive, form.form, 'K1.7.2', 0, 0, false);
  }

  function layer(world: TickWorld, s: number): void {
    const q = p!, sp = plays[s] ?? null;
    if (sp === null || sp.compiled === null || seen[s] === 0) return;
    const view = viewOf(s), tick = world.tick, live = tick >= 0 && world.deadAtTick === null, players = world.players;
    const rule = fired[s]!;
    if (rule >= 0) {
      note(world, s, rule, '');
      if (rule >= eventBase[s]!) released[s] = 1;
      else { ruleFired[s] = 1; if (errPrim[s] === P_LATE) holdUntil[s] = tick + Math.round(errSize[s]! / TICK_S); }
    }
    const engaged = players.engagement[s]! >= 0;
    if (engaged && beh[s] === 'route') rerouted[s] = 1;

    if (errPrim[s] !== P_NONE && released[s] === 0) applyError(s, view);
    if (live && deliberate[s] === 0) considerActs(world, s, view, sp);
    if (act[s]! >= 0 && released[s] === 0) applyAct(s, view);
    const foul = fouls[s] ?? null;
    if (foul !== null && live && foul.targetSlot >= 0) { const e = view.entity(foul.targetSlot); if (e !== null) aim(s, e.px, e.py, true); }
    if (live && s < SLOTS_PER_TEAM && beh[s] === 'route' && released[s] === 0 && view.ballKind() === 'held') improvise(world, s, view, sp);
    if (live) accidents(world, s, view, sp);

    // A lost step (K1.7.2) or a late reaction (J4.5.3): he keeps doing what he was doing.
    const holding = tick < holdUntil[s]! && prevHasT[s] === 1;
    if (holding) { hasT[s] = 1; tx[s] = prevTx[s]!; ty[s] = prevTy[s]!; mode[s] = prevMode[s]!; arr[s] = prevArr[s]!; }
    else { prevHasT[s] = hasT[s]!; prevTx[s] = tx[s]!; prevTy[s] = ty[s]!; prevMode[s] = mode[s]!; prevArr[s] = arr[s]!; }

    // K1.2.1 effort.
    const b = view.ball(), toBall = b === null ? Infinity : distTo(view, b.px, b.py);
    const atPoint = engaged || players.hasBall[s] === 1 || toBall <= q.effortPoaRadiusYd;
    let used = effortNow(level[s]!, atPoint, players.fatigueNow[s]!, q);
    if (halfEffort[s] === 1 && !atPoint && released[s] === 0 && used > q.protestEffort) used = q.protestEffort;
    if (live && !atPoint && loafed[s] === 0 && used < q.loafLine && toBall <= q.loafReachYd) {
      loafed[s] = 1;
      loafRows.push({ slot: s, playerId: world.slots[s]!.playerId, tick, effort: used });
      detail(world, s, 'playerAi.loaf', used);
    }

    const intent = world.intents[s]!;
    if (hasT[s] === 1) { const pt = points[s]!; pt.px = tx[s]!; pt.py = ty[s]!; intent.target = pt; } else intent.target = null;
    intent.targetVelPx = tvx[s]!; intent.targetVelPy = tvy[s]!;
    if (hasF[s] === 1) { const pt = faces[s]!; pt.px = fx[s]!; pt.py = fy[s]!; intent.faceTarget = pt; } else intent.faceTarget = null;
    intent.effort = eff[s]! * used;
    intent.moveMode = MOVE_MODES[mode[s]!] as MoveMode;
    intent.arrival = ARRIVALS[arr[s]!]!;
    players.behavior[s] = BEHAVIORS.indexOf(beh[s]!);
    players.behaviorState[s] = behState[s]!;
  }

  function run(world: TickWorld): void {
    if (p === null) return;
    for (let i = 0; i < order.length; i++) {
      const s = order[i]!, sp = plays[s] ?? null;
      if (sp === null || sp.compiled === null) continue;
      const view = viewOf(s);
      let seenBy: PerceivedView = view;
      if (filterOn[s] === 1) { const fv = filters[s]!; fv.inner = view; seenBy = fv; }
      const compiled: CompiledAssignment = useAlt[s] === 1 ? sp.alternate! : sp.compiled;
      const out = compiled.decide(s, seenBy), it = out.intent;
      if (seen[s] === 0) { seen[s] = 1; startPx[s] = view.self.px; startPy[s] = view.self.py; }
      if (it.target !== null) { hasT[s] = 1; tx[s] = it.target.px; ty[s] = it.target.py; } else hasT[s] = 0;
      tvx[s] = it.targetVelPx; tvy[s] = it.targetVelPy;
      if (it.faceTarget !== null) { hasF[s] = 1; fx[s] = it.faceTarget.px; fy[s] = it.faceTarget.py; } else hasF[s] = 0;
      eff[s] = it.effort; mode[s] = MOVE_MODES.indexOf(it.moveMode); arr[s] = ARRIVALS.indexOf(it.arrival);
      beh[s] = out.behavior; behState[s] = out.behaviorState; fired[s] = out.firedRule;
    }
    if (!decided) { decided = true; decideErrors(world); }
    for (let i = 0; i < order.length; i++) layer(world, order[i]!);
  }

  return {
    stage: { name: 'decide', begin, run },
    setPlay(slots, ctx, mem) { plays = slots; context = ctx ?? {}; memory = mem ?? null; },
    deviations: () => rows,
    loafs: () => loafRows,
    explain: () => explainRows,
    errorOf: (slot) => errors[slot] ?? null,
    effortOf: (slot) => level[slot]!,
    stripAttempt: (slot) => strip[slot] === 1,
    foulIntent: (slot) => fouls[slot] ?? null,
    situational(world, slot, family) {
      const sp = plays[slot] ?? null, i = SITUATION_FAMILIES.indexOf(family);
      if (sp === null || p === null) return true;
      const cell = slot * SITUATION_FAMILIES.length + i;
      if (sitDone[cell] !== 0) return sitDone[cell] === 1;
      const miss = uni[slot * U_COUNT + U_SIT + i]! < situationMissChance(sp.mind.situationKnowledge[family], sp.mind.yearsAtLevel,
        attr(world, slot, 'football_intelligence'), sp.reminder === true, composureOf(world, slot, sp), p);
      sitDone[cell] = miss ? 2 : 1;
      if (miss) { record(world, slot, 'didNotKnow', 'situation', family, 'K1.7.3', 0, 0, false); note(world, slot, -1, `situation missed: ${family}`); }
      return !miss;
    },
    recordSlip(world, slot) { record(world, slot, 'accident', 'slip', 'slip', 'J12.5.1', 0, 0, false); },
    commQuality: (unit) => unitQuality[unit] ?? 0,
    deliveryBonus: (unit) => (p === null ? 0 : deliveryBonus(unitQuality[unit] ?? 0, p)),
    patienceShift: (slot) => (p === null ? 0 : patienceShift(plays[slot]?.instruction, p)),
  };
}
