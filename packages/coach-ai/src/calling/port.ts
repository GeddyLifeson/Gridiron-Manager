// K4 behind the K6 CallerPort (G-75, staff/ports.ts) and so behind the J11.6.1 Decider: the staff
// decider asks a person for a call and this runs that person's K4 caller with his own profile and
// sheet (K6.1.1 rule 1). CR-G58-3. The schema types come from staff/contract.ts, which reads them off
// the game flow's signatures, so coach-ai still imports no schema (P1.2.1).
import type { CallContext, CallerPort, CallSuggestion } from '../staff/ports.ts';
import type { AnyCall, DecisionView, FieldGeometry, OpposingCall, SnappingCall } from '../staff/contract.ts';
import { yardsToGoal } from '../staff/instructions.ts';
import { createCaller, type Caller, type CallerSetup, type PreviewRequest } from './caller.ts';
import { callSpecialTeams, type SpecialOption } from './special.ts';
import type { CallMath, CallSituation, DrawKind, DrawSource, ManagementConstraint, SheetCall } from './types.ts';
import type { Draws } from '../profile/draws.ts';

export type CallingSide = 'offense' | 'defense';

export interface CallerPortConfig {
  readonly geometry: FieldGeometry;
  readonly regulationPeriods: number;
  /** The caller's setup for this game (his profile, the sheet he calls, his scouting), or null when he has none. Read once per person and side. */
  setupFor(ctx: CallContext, side: CallingSide): CallerSetup | null;
  /** The engine call for a sheet call (content, G-68 / G-67). Null when it cannot be built here. */
  build(call: SheetCall, view: DecisionView, side: CallingSide): AnyCall | null;
  /** K4.1.1 rule 3: personnel active, formation legal on this hash, play installed. Default: all. */
  available?(call: SheetCall, view: DecisionView): boolean;
  /** K4.3.5: unit readiness as the caller estimates it. Default 1. */
  readiness?(call: SheetCall, view: DecisionView): number;
  /** K5 for this snap, normally `joinK5(...)` over the K5 clock plan (G-59). */
  constraint?(view: DecisionView, ctx: CallContext): ManagementConstraint | undefined;
  /** Defense: the offense is going without a huddle (K4.4.1 rule 5). */
  facingTempo?(view: DecisionView): boolean;
  /** Offense: a substitution is in progress (J5.1.2). */
  substitutionInProgress?(view: DecisionView): boolean;
  /** Play-clock value when the call window opens, tenths; null for a fixed-window request. */
  playClockStartTenths(view: DecisionView): number | null;
  /** Stream `coachAI` keyed by game, play, person and draw kind (J13.2.1). */
  draws(view: DecisionView, ctx: CallContext, kind: DrawKind | 'special'): Draws;
  /** Kicks and returns (K4.6.1): his menu, built into calls by `buildSpecial`. Absent: no answer, the default applies. */
  special?: {
    readonly math: CallMath;
    menu(view: DecisionView, ctx: CallContext): readonly SpecialOption[];
    build(callId: string, view: DecisionView): AnyCall | null;
  };
}

export interface CallerPortK4 extends CallerPort {
  /** The live caller for a person and side, for `observe` and `adjust` from his booth (K4.2.2, K4.5.3). */
  callerOf(personId: number, side: CallingSide): Caller | undefined;
}

/** J11 situation as the K4 caller reads it, seen from the side that calls. */
export function callSituation(view: DecisionView, geometry: FieldGeometry, regulationPeriods: number, side: CallingSide): CallSituation | null {
  const s = view.situation;
  if (s.playKind !== 'scrimmage' || s.down === null || s.distanceYd === null) return null;
  const me = side === 'offense' ? s.offense : (1 - s.offense) as 0 | 1;
  return {
    down: s.down, distanceYd: s.distanceYd, yardsToGoal: yardsToGoal(geometry, s), period: s.period, regulationPeriods,
    overtime: s.overtime, insideTwoMinute: s.insideTwoMinute, margin: s.score[me] - s.score[1 - me]!,
  };
}

const tenths = (start: number | null, callTimeS: number): number | null => (start === null ? null : Math.max(0, Math.round(start - callTimeS * 10)));

export function createCallerPort(cfg: CallerPortConfig): CallerPortK4 {
  const callers = new Map<string, Caller | null>();
  const key = (personId: number, side: CallingSide) => `${personId}|${side}`;
  const callerFor = (ctx: CallContext, side: CallingSide): Caller | null => {
    const k = key(ctx.caller.personId, side);
    if (!callers.has(k)) { const st = cfg.setupFor(ctx, side); callers.set(k, st ? createCaller(st) : null); }
    return callers.get(k)!;
  };
  /** One build per sheet call per request, so `available` and the answer agree. */
  const builder = (view: DecisionView, side: CallingSide) => {
    const memo = new Map<string, AnyCall | null>();
    return (c: SheetCall): AnyCall | null => {
      if (!memo.has(c.callId)) memo.set(c.callId, cfg.build(c, view, side));
      return memo.get(c.callId)!;
    };
  };
  const look = (view: DecisionView, ctx: CallContext, side: CallingSide, built: (c: SheetCall) => AnyCall | null): PreviewRequest | null => {
    const situation = callSituation(view, cfg.geometry, cfg.regulationPeriods, side);
    if (!situation) return null;
    const constraint = side === 'offense' ? cfg.constraint?.(view, ctx) : undefined;
    return {
      situation, ...(constraint ? { constraint } : {}),
      // K6.1.2: a call that breaks a standing instruction is never a candidate; one that cannot be built is not available.
      available: (c) => (cfg.available?.(c, view) ?? true) && (() => { const b = built(c); return b !== null && ctx.permits(b); })(),
      readiness: (c) => cfg.readiness?.(c, view) ?? 1,
      ...(side === 'offense' ? { substitutionInProgress: cfg.substitutionInProgress?.(view) === true } : { facingTempo: cfg.facingTempo?.(view) === true }),
    };
  };
  const special = (view: DecisionView, ctx: CallContext): { call: AnyCall; acceptedAtPlayClockTenths: number | null } | null => {
    if (!cfg.special) return null;
    const menu = cfg.special.menu(view, ctx).filter((o) => { const b = cfg.special!.build(o.callId, view); return b !== null && ctx.permits(b); });
    if (menu.length === 0) return null;
    const r = callSpecialTeams(menu, cfg.draws(view, ctx, 'special'), cfg.special.math);
    const call = cfg.special.build(r.callId, view);
    return call ? { call, acceptedAtPlayClockTenths: tenths(cfg.playClockStartTenths(view), 0) } : null;
  };
  const scrimmage = (view: DecisionView, ctx: CallContext, side: CallingSide) => {
    const caller = callerFor(ctx, side);
    if (!caller) return null;
    const built = builder(view, side);
    const req = look(view, ctx, side, built);
    if (!req) return null;
    const draws: DrawSource = (kind) => cfg.draws(view, ctx, kind);
    const r = caller.call({ ...req, draws });
    if (!r) return null;
    const b = built(r.call);
    if (!b) return null;
    const call = side === 'offense' && b.unit === 'offense' ? { ...b, tempo: r.tempo } : b;
    return { call, acceptedAtPlayClockTenths: tenths(cfg.playClockStartTenths(view), r.callTimeS) };
  };
  const scrimmagePlay = (view: DecisionView) => view.situation.playKind === 'scrimmage';

  return {
    snappingCall(view, ctx) {
      const a = scrimmagePlay(view) && ctx.duty !== 'calling.special_teams' ? scrimmage(view, ctx, 'offense') : special(view, ctx);
      return a && (a.call.unit === 'offense' || a.call.unit === 'kick') ? { call: a.call as SnappingCall, acceptedAtPlayClockTenths: a.acceptedAtPlayClockTenths } : null;
    },
    opposingCall(view, ctx) {
      const a = scrimmagePlay(view) && ctx.duty !== 'calling.special_teams' ? scrimmage(view, ctx, 'defense') : special(view, ctx);
      return a && (a.call.unit === 'defense' || a.call.unit === 'return') ? { call: a.call as OpposingCall, acceptedAtPlayClockTenths: a.acceptedAtPlayClockTenths } : null;
    },
    suggest(view, ctx, max) {
      const side: CallingSide = view.request.type === 'opposing_call' ? 'defense' : 'offense';
      const caller = callerFor(ctx, side);
      if (!caller || max <= 0) return [];
      const built = builder(view, side);
      const req = look(view, ctx, side, built);
      const p = req ? caller.preview(req) : null;
      if (!p) return [];
      const out: CallSuggestion[] = [];
      for (const l of p.ranked) {
        if (out.length >= max) break;
        const call = built(l.call);
        if (call) out.push({ call, weight: l.weight });
      }
      return out;
    },
    callerOf(personId, side) { return callers.get(key(personId, side)) ?? undefined; },
  };
}
