// The compiler: an assignment (data) becomes closures that the Decide stage calls each tick
// (J4.4.1, P6.3.1). Nothing is allocated inside `decide`: the context, the intent and the output
// object are built once and reused. The compiled assignment reads the `PerceivedView` it is handed
// and nothing else, so one player's decision cannot depend on another's same-tick decision.
import {
  SLOTS_PER_TEAM, type Assignment, type CompiledAssignment, type Condition, type DecideOutput, type DeterministicMath,
  type Intent, type ParamTable, type PerceivedView, type Slot,
} from '@gm/schema';
import { ACTIONS, INSTANT_ACTIONS, type ActFn } from './actions.ts';
import { CONDITIONS, type Args, type CompileEnv, type CondFn } from './conditions.ts';
import { constsOf } from './params.ts';
import { F, T, U, aim, compileSelector, dist, isSelector, type ActivePoint, type Ctx, type Sel, type Tri } from './runtime.ts';
import { ACTION_DEFS, BEHAVIOR_DEFS, CONDITION_DEFS, UNIVERSAL_EVENTS, VOCABULARY, isBehavior, type ArgSpec } from './vocabulary.ts';

export interface CompileOptions {
  readonly params: ParamTable;
  readonly math?: DeterministicMath | null;
  /** Extra conditions to evaluate every tick and report in `probeValues`: the designer's and the explain record's "condition values" (J4.6.2). */
  readonly probes?: readonly Condition[];
}

/** The compiled form, with the two extras a host and the tests use. */
export interface Compiled extends CompiledAssignment {
  /** Forgets everything about the last play. `decide` also does this itself when the snap clock goes back. */
  reset(): void;
  /** `firedRule` values at and above this number are universal events: this number plus the index in `UNIVERSAL_EVENTS`. */
  readonly eventBase: number;
  /** This tick's value of each rule's trigger, by rule index: 0 false, 1 true, 2 unknown (J4.6.2 "condition values"). */
  readonly whenValues: Uint8Array;
  /** This tick's value of each probe in `CompileOptions.probes`. */
  readonly probeValues: Uint8Array;
}

/** Fills the vocabulary's defaults into a clause's arguments. Throws when a required one is missing (validation reports it first). */
export function fillArgs(specs: Readonly<Record<string, ArgSpec>>, given: Args, what: string): Args {
  const out: Record<string, string | number | boolean> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const v = given[name] ?? spec.default;
    if (v === undefined) throw new Error(`${what}: missing argument ${name}`);
    out[name] = v;
  }
  return out;
}

interface Act { readonly fn: ActFn; readonly instant: boolean; readonly stateOf: Readonly<Record<string, string>> | null; readonly state: string | null }
interface ActList { readonly acts: readonly Act[]; readonly done: boolean[]; readonly fresh: boolean[] }
interface Clause { readonly when: CondFn; readonly guard: CondFn | null; readonly list: ActList }

/** Behaviors in which the player already has the ball in his hands by assignment. */
const HOLDS_BALL: ReadonlySet<string> = new Set(['ballCarrier', 'quarterback', 'returner', 'kicker', 'holder', 'snapper']);

/** The entities a condition tree and action list read, for the attention set (J3.1.2). */
function reads(cond: Condition, out: string[]): void {
  if (cond.op === 'not') { reads(cond.of, out); return; }
  if (cond.op !== 'test') { for (const x of cond.of) reads(x, out); return; }
  const def = CONDITION_DEFS.get(cond.name);
  if (def === undefined) return;
  for (const r of def.reads) {
    if (!r.startsWith('arg:')) { out.push(r); continue; }
    const v = cond.args[r.slice(4)];
    if (typeof v === 'string') out.push(v);
  }
}

export function attentionOf(a: Assignment): string[] {
  const out: string[] = [...a.keys];
  for (const r of a.rules) {
    reads(r.when, out);
    if (r.guard !== null) reads(r.guard, out);
    for (const act of r.then) {
      const def = ACTION_DEFS.get(act.name);
      if (def === undefined) continue;
      for (const [k, spec] of Object.entries(def.args)) { const v = act.args[k]; if (spec.type === 'entity' && typeof v === 'string') out.push(v); }
    }
  }
  const man = a.behavior.params['man'];
  if (typeof man === 'string') out.push(man);
  return [...new Set(out)];
}

/**
 * Compiles one assignment. The assignment must already have passed validation: unknown vocabulary
 * throws here. `FootballLang.compile` validates first and returns findings instead.
 */
export function compileAssignment(a: Assignment, opts: CompileOptions): Compiled {
  if (!isBehavior(a.behavior.type)) throw new Error(`unknown behavior ${a.behavior.type}`);
  const startBehavior = a.behavior.type;
  const k = constsOf(opts.params);
  let cells = 0;
  const qbParam = a.behavior.params['qb'], qbText = typeof qbParam === 'string' ? qbParam : null;
  const env: CompileEnv = {
    alloc(n) { const at = cells; cells += n; return at; },
    sel: (text) => compileSelector(text, a.keys, qbText),
    a,
    math: opts.math ?? null,
  };

  const compileCond = (cond: Condition): CondFn => {
    if (cond.op === 'not') {
      const inner = compileCond(cond.of);
      return (c) => { const v = inner(c); return v === U ? U : v === T ? F : T; };
    }
    if (cond.op === 'all') {
      const parts = cond.of.map(compileCond);
      return (c) => { let out: Tri = T; for (let i = 0; i < parts.length; i++) { const v = parts[i]!(c); if (v === F) return F; if (v === U) out = U; } return out; };
    }
    if (cond.op === 'any') {
      const parts = cond.of.map(compileCond);
      return (c) => { let out: Tri = F; for (let i = 0; i < parts.length; i++) { const v = parts[i]!(c); if (v === T) return T; if (v === U) out = U; } return out; };
    }
    const def = CONDITION_DEFS.get(cond.name), make = CONDITIONS[cond.name];
    if (def === undefined || make === undefined) throw new Error(`unknown condition ${cond.name}`);
    const fn = make(fillArgs(def.args, cond.args, cond.name), env);
    if (def.phase === 'preSnap') return (c) => (c.view.tSinceSnapS >= 0 ? F : fn(c));
    if (def.phase === 'live') return (c) => (c.view.tSinceSnapS < 0 ? F : fn(c));
    return fn;
  };

  const compileActs = (calls: readonly { name: string; args: Args; state?: string | undefined }[]): ActList => {
    const acts = calls.map((call): Act => {
      const def = ACTION_DEFS.get(call.name), make = ACTIONS[call.name];
      if (def === undefined || make === undefined) throw new Error(`unknown action ${call.name}`);
      return { fn: make(fillArgs(def.args, call.args, call.name), env), instant: INSTANT_ACTIONS.has(call.name), stateOf: def.state ?? null, state: call.state ?? null };
    });
    return { acts, done: acts.map(() => false), fresh: acts.map(() => true) };
  };

  const clauses: Clause[] = a.rules.map((r) => ({
    when: compileCond(r.when), guard: r.guard === null ? null : compileCond(r.guard), list: compileActs(r.then),
  }));
  const probes = (opts.probes ?? []).map(compileCond);
  const whenValues = new Uint8Array(clauses.length), probeValues = new Uint8Array(probes.length);
  const defaults = new Map<string, ActList>(), events = new Map<string, readonly ActList[]>();
  for (const b of VOCABULARY.behaviors) {
    defaults.set(b.name, compileActs([{ name: b.default.action, args: b.default.args, state: b.default.state }]));
    events.set(b.name, UNIVERSAL_EVENTS.map((e) => { const call = b.events[e]!; return compileActs([{ name: call.action, args: call.args, state: call.state }]); }));
  }
  const EV_THROWN = 0, EV_CAUGHT = 1, EV_POSSESSION = 2, EV_FUMBLE = 3, EV_WHISTLE = 4;
  const eventBase = clauses.length;

  const manText = a.behavior.params['man'];
  const startMan: Sel | null = typeof manText === 'string' && isSelector(manText) ? env.sel(manText) : null;
  const assignedPath: readonly ActivePoint[] = a.behavior.path.map((p) => ({ px: p.px, py: p.py, kind: p.kind }));
  const noPath: readonly ActivePoint[] = [];
  const motion = a.preSnap.motion;

  const intent: Intent = { target: null, targetVelPx: 0, targetVelPy: 0, faceTarget: null, effort: 1, moveMode: 'run', arrival: 'arrive' };
  const c: Ctx = {
    view: null as unknown as PerceivedView, slot: 0, offense: true, ownStart: 0, oppStart: SLOTS_PER_TEAM, k, a,
    mem: new Float64Array(cells), side: 1,
    self: { slot: 0, px: 0, py: 0, velPx: 0, velPy: 0, staleTicks: 0 },
    intent, tp: { px: 0, py: 0 }, fp: { px: 0, py: 0 },
    path: assignedPath, pathIndex: 0, stemDone: false, atTarget: false, man: startMan,
    behavior: startBehavior, stateIndex: 0, technique: { ...a.technique }, calls: [], ticks: 0, startPx: 0, startPy: 0,
  };
  const out = { intent, behavior: c.behavior, behaviorState: 0, firedRule: -1, calls: c.calls as readonly string[], technique: c.technique as Readonly<Record<string, string>> };

  // Per-clause debounce (J4.4.1 rule 4): the accepted value, ticks the raw value has differed, and whether it has flipped yet.
  const accepted = new Uint8Array(clauses.length), differing = new Uint16Array(clauses.length), flipped = new Uint8Array(clauses.length);
  let started = false, lastT = 0, current: ActList | null = null, inDefault: ActList | null = null;
  let prevKind = 'deadPreSnap', possession = 0, dead = false, motionIndex = 0, wasStemDone = false, ran = false;

  const rearm = (list: ActList): void => { for (let i = 0; i < list.acts.length; i++) { list.done[i] = false; list.fresh[i] = true; } };

  const reset = (): void => {
    started = false; current = null; inDefault = null; prevKind = 'deadPreSnap'; possession = 0; dead = false; motionIndex = 0; wasStemDone = false;
    c.mem.fill(0); accepted.fill(0); differing.fill(0); flipped.fill(0);
    c.path = assignedPath; c.pathIndex = 0; c.stemDone = false; c.atTarget = false; c.man = startMan;
    c.behavior = startBehavior; c.stateIndex = 0; c.ticks = 0; c.calls.length = 0;
    for (const key in c.technique) delete c.technique[key];
    for (const key in a.technique) c.technique[key] = a.technique[key]!;
  };

  const setState = (act: Act): void => {
    const name = act.state ?? (act.stateOf === null ? undefined : act.stateOf[c.behavior]);
    if (name === undefined) return;
    const i = BEHAVIOR_DEFS.get(c.behavior)!.states.indexOf(name);
    if (i !== -1) c.stateIndex = i;
  };

  /** Runs the acts of a list that are not finished. Before the snap only the instant ones run. Returns true when all are finished. */
  const run = (list: ActList, live: boolean): boolean => {
    let all = true;
    for (let i = 0; i < list.acts.length; i++) {
      if (list.done[i]) continue;
      const act = list.acts[i]!;
      if (!live && !act.instant) { all = false; continue; }
      const first = list.fresh[i]!;
      list.fresh[i] = false;
      if (first) setState(act);
      if (act.fn(c, first)) list.done[i] = true; else all = false;
    }
    return all;
  };

  /** A rule or event fired: its list becomes the current action unless every act in it finished at once. */
  const fire = (list: ActList, live: boolean): void => {
    const before = c.behavior;
    rearm(list);
    if (!run(list, live)) { current = list; inDefault = null; ran = true; return; }
    if (c.behavior !== before) { current = null; inDefault = null; }
  };

  const decide = (slot: Slot, view: PerceivedView): DecideOutput => {
    const t = view.tSinceSnapS;
    if (!started || t < lastT || slot !== c.slot) {
      reset();
      started = true;
      c.slot = slot; c.offense = slot < SLOTS_PER_TEAM; c.ownStart = c.offense ? 0 : SLOTS_PER_TEAM; c.oppStart = c.offense ? SLOTS_PER_TEAM : 0;
      c.side = view.self.py >= 0 ? 1 : -1; c.startPx = view.self.px; c.startPy = view.self.py;
    }
    lastT = t;
    c.view = view;
    const self = c.self;
    self.slot = slot; self.px = view.self.px; self.py = view.self.py; self.velPx = view.self.velPx; self.velPy = view.self.velPy;
    c.ticks++;
    c.calls.length = 0;
    intent.target = null; intent.targetVelPx = 0; intent.targetVelPy = 0; intent.faceTarget = null; intent.effort = 1; intent.moveMode = 'run'; intent.arrival = 'arrive';
    const live = t >= 0;
    if (!live) { c.startPx = self.px; c.startPy = self.py; c.side = self.py >= 0 ? 1 : -1; }
    let fired = -1;
    ran = false;
    for (let i = 0; i < probes.length; i++) probeValues[i] = probes[i]!(c);
    const kind = view.ballKind();

    // 1. Universal interrupts first (J4.4.1 rule 2): the whistle ends everything.
    if (kind === 'dead' && !dead) { dead = true; fired = eventBase + EV_WHISTLE; fire(events.get(c.behavior)![EV_WHISTLE]!, true); }

    if (!dead) {
      // A man who believes the ball is in his own hands carries it, whatever he was doing (J4.2.2).
      if (live && kind === 'held' && view.believedCarrierSlot() === slot && !HOLDS_BALL.has(c.behavior)) {
        c.behavior = 'ballCarrier'; c.stateIndex = 0; c.path = noPath; c.pathIndex = 0; current = null; inDefault = null;
      }
      // 2. The assignment's `when` clauses in order. Every clause is evaluated so its debounce stays current; the first to fire wins.
      for (let i = 0; i < clauses.length; i++) {
        const cl = clauses[i]!;
        const value = cl.when(c);
        whenValues[i] = value;
        const raw = value === T ? 1 : 0;
        if (raw === accepted[i]) { differing[i] = 0; continue; }
        differing[i]!++;
        if (flipped[i] === 1 && differing[i]! < k.hysteresisTicks) continue;
        accepted[i] = raw; differing[i] = 0; flipped[i] = 1;
        if (raw === 1 && fired === -1 && (cl.guard === null || cl.guard(c) === T)) { fired = i; fire(cl.list, live); }
      }
      // 3. Universal events, answered from the behavior's table when no rule spoke (J4.2.1).
      let event = -1;
      if (kind === 'loose' && prevKind !== 'loose') event = EV_FUMBLE;
      else if (kind === 'held') {
        const carrier = view.believedCarrierSlot();
        const team = carrier === -1 ? possession : carrier < SLOTS_PER_TEAM ? 0 : 1;
        if (team !== possession) { possession = team; event = EV_POSSESSION; } else if (prevKind === 'passInFlight') event = EV_CAUGHT;
      } else if (kind === 'passInFlight' && prevKind !== 'passInFlight') event = EV_THROWN;
      if (event !== -1 && fired === -1) { fired = eventBase + event; fire(events.get(c.behavior)![event]!, live); }
    }
    if (kind !== 'unknown') prevKind = kind;

    // 4. Carry on with the current action; when it completes, or there is none, the behavior's default.
    if (current !== null && !ran && run(current, live)) current = null;
    if (current === null) {
      const list = defaults.get(c.behavior)!;
      if (inDefault !== list) { inDefault = list; rearm(list); }
      run(list, live);
      if (live && c.behavior === 'route') {
        // Route states follow the path itself: release, stem, break, post-break.
        c.stateIndex = !c.stemDone ? (c.pathIndex === 0 && t < k.releaseDecideS ? 0 : 1) : wasStemDone ? 3 : 2;
      }
    }
    wasStemDone = c.stemDone;

    if (!live) {
      // Before the snap he holds his stance, or runs his drawn motion.
      intent.faceTarget = null; intent.effort = 1;
      while (motionIndex < motion.length && dist(motion[motionIndex]!.px, motion[motionIndex]!.py, self.px, self.py) <= k.passRadius) motionIndex++;
      if (motionIndex < motion.length) {
        aim(c, motion[motionIndex]!.px, motion[motionIndex]!.py);
        intent.moveMode = 'run'; intent.arrival = motionIndex === motion.length - 1 && motion[motionIndex]!.kind === 'settle' ? 'arrive' : 'through';
      } else { aim(c, self.px, self.py); intent.moveMode = 'stance'; intent.arrival = 'arrive'; }
    }

    out.behavior = c.behavior; out.behaviorState = c.stateIndex; out.firedRule = fired;
    return out;
  };

  return { role: a.role, attention: attentionOf(a), decide, reset, eventBase, whenValues, probeValues };
}
