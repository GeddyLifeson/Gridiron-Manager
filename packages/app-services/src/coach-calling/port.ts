// The K4 caller port config with real content (G-58 owed items behind `createCallerPort`): `build` from the
// playbook, `fits` for K5 kneel, spike and clock orders, and the K5 join. The host (the game session or the
// season runner) supplies who is calling with which sheet, the depth chart, the draws and the K5 clock plan.
import { calling, type staff } from '@gm/coach-ai';
import type { LineupFor } from '../commands/game-calling/decision.ts';
import { contentBuilder } from './build.ts';
import { contentBook, contentFits, type ContentBook } from './content.ts';

type Config = calling.CallerPortConfig;

export interface CoachCallingOptions {
  readonly geometry: Config['geometry'];
  readonly regulationPeriods: number;
  /** Default: the full content set (WP-25). */
  readonly book?: ContentBook;
  /** The caller's profile, sheet (normally `toCallingSheet` of his K3 sheet) and scouting for this game. */
  readonly setupFor: Config['setupFor'];
  /** Who the depth chart sends for a unit and personnel group, as the game stands at this view (I6). */
  readonly lineupFor: (view: staff.DecisionView) => LineupFor;
  readonly draws: Config['draws'];
  readonly playClockStartTenths: Config['playClockStartTenths'];
  /** K5 clock plan for this snap (G-59 `clockPlan`), or null when none applies. */
  readonly clockPlan?: (view: staff.DecisionView, ctx: staff.CallContext) => calling.JoinInput['clock'];
  /** K5.2.1: the offense goes on fourth down (G-59 `fourthDown().shortYardage`). */
  readonly shortYardage?: (view: staff.DecisionView, ctx: staff.CallContext) => boolean;
  readonly available?: Config['available'];
  readonly readiness?: Config['readiness'];
  readonly facingTempo?: Config['facingTempo'];
  readonly substitutionInProgress?: Config['substitutionInProgress'];
  readonly special?: Config['special'];
}

/** `createCallerPort(coachCallingConfig(o))` gives the staff decider a K4 caller that calls real plays. */
export function coachCallingConfig(o: CoachCallingOptions): Config {
  const book = o.book ?? contentBook();
  const fits = contentFits(book);
  const inBook = (id: string) => book.plays.has(id) || book.defense.has(id);
  return {
    geometry: o.geometry, regulationPeriods: o.regulationPeriods, setupFor: o.setupFor, draws: o.draws, playClockStartTenths: o.playClockStartTenths,
    build: contentBuilder(book, o.lineupFor),
    available: (c, v) => inBook(c.callId) && (o.available?.(c, v) ?? true),
    constraint: (v, ctx) => calling.joinK5({ clock: o.clockPlan?.(v, ctx) ?? null, shortYardage: o.shortYardage?.(v, ctx) === true, fits }),
    ...(o.readiness ? { readiness: o.readiness } : {}),
    ...(o.facingTempo ? { facingTempo: o.facingTempo } : {}),
    ...(o.substitutionInProgress ? { substitutionInProgress: o.substitutionInProgress } : {}),
    ...(o.special ? { special: o.special } : {}),
  };
}

/** `createCallerPort` over the content config, for hosts that want the port directly. */
export function coachCallerPort(o: CoachCallingOptions): calling.CallerPortK4 { return calling.createCallerPort(coachCallingConfig(o)); }
