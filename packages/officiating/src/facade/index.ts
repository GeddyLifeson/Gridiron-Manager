// The officiating facade (J11.2.1): the one object the game state machine holds. Integrator-owned.
// It joins the work packages of this package behind the contract's `Officiating` interface and runs
// the pipeline written at the top of packages/schema/src/sim/officiating.ts. It keeps no state: a
// review recomputes what the crew saw, which is the same record because every draw is keyed by
// (game, play, official).
import type {
  BasicRuling, CalledPlay, ClockRules, EnforcementOption, FoulRecord, FoulRules, Officiating, PlayOutcome, PlayTruth,
  ReplayRules, ReviewRequest, ReviewResult, Ruling, RulingContext, SeriesRules, Side, CrewModel,
} from '@gm/schema';
import { afterPlayWithFacts, clockRules } from '../clock/index.ts';
import { crewModel, foulsAfterReview } from '../crew/index.ts';
import { foulRules, optionsFromTruth } from '../fouls/index.ts';
import { createKickRuling, type KickRuling } from '../kick/index.ts';
import { createOvertimeRules, type OvertimeRulesX } from '../overtime/index.ts';
import { challengeAccounting, replayRules } from '../replay/index.ts';
import { createRestartRules, type RestartRulesX } from '../restart/index.ts';
import { clockFacts, scrimmageRuling } from '../scrimmage/index.ts';
import { attackDirOf, forwardYards, seriesRules } from '../series/index.ts';

/** The facade with the modules' wider surfaces, for callers that need more than the contract offers. */
export interface OfficiatingFacade extends Officiating {
  readonly restarts: RestartRulesX;
  readonly overtime: OvertimeRulesX;
  readonly kick: KickRuling;
  readonly scrimmage: BasicRuling;
  readonly fouls: FoulRules;
  readonly crew: CrewModel;
}

/** Parts a caller may replace, for tests and for the later tick-engine officials. Each defaults to the real module. */
export interface FacadeParts {
  readonly scrimmage?: BasicRuling;
  readonly kick?: KickRuling;
  readonly fouls?: FoulRules;
  readonly crew?: CrewModel;
  readonly replay?: ReplayRules;
  readonly series?: SeriesRules;
  readonly clock?: ClockRules;
  readonly restarts?: RestartRulesX;
  readonly overtime?: OvertimeRulesX;
}

const points = (o: PlayOutcome, side: Side): number => (o.score !== null && o.score.side === side ? o.score.points : 0);

/**
 * Is outcome `a` better than `b` for the team that chooses? Used only to name the default option; the
 * coach decides (J11.6.1). Order of comparison: points for and against, who has the ball, a first
 * down, then field position. ASSUMPTION (integrator): the bible gives no default rule for B8.5.8.
 */
function betterFor(side: Side, a: PlayOutcome, b: PlayOutcome, series: SeriesRules, ctx: RulingContext): boolean {
  const opp: Side = side === 0 ? 1 : 0;
  const net = (o: PlayOutcome) => points(o, side) - points(o, opp);
  if (net(a) !== net(b)) return net(a) > net(b);
  if (a.score !== null || b.score !== null) return false;
  const sa = series.next(a, ctx), sb = series.next(b, ctx);
  const has = (p: Side) => (p === side ? 1 : 0);
  if (has(sa.possession) !== has(sb.possession)) return has(sa.possession) > has(sb.possession);
  const holder = sa.possession;
  const dir = attackDirOf(ctx, holder);
  const ahead = forwardYards(sb.ballX, sa.ballX, dir);
  const first = (s: typeof sa) => (s.firstDownAwarded ? 1 : 0);
  if (holder === side) {
    if (first(sa) !== first(sb)) return first(sa) > first(sb);
    if (ahead !== 0) return ahead > 0;
    return (sa.down ?? 0) < (sb.down ?? 0);
  }
  if (first(sa) !== first(sb)) return first(sa) < first(sb);
  if (ahead !== 0) return ahead < 0;
  return (sa.down ?? 0) > (sb.down ?? 0);
}

export function createOfficiating(parts: FacadeParts = {}): OfficiatingFacade {
  const scrimmage = parts.scrimmage ?? scrimmageRuling;
  const kick = parts.kick ?? createKickRuling();
  const fouls = parts.fouls ?? foulRules;
  const crew = parts.crew ?? crewModel;
  const replay = parts.replay ?? replayRules;
  const series = parts.series ?? seriesRules;
  const baseClock = parts.clock ?? clockRules;
  const restarts = parts.restarts ?? createRestartRules();
  const overtime = parts.overtime ?? createOvertimeRules(restarts);

  const rule = (t: PlayTruth, ctx: RulingContext): PlayOutcome => {
    if (kick.handles(t)) return kick.rule(t, ctx);
    const out = scrimmage.rule(t, ctx);
    // CR-02-2: the clock needs to tell a loose ball out of bounds from a runner out of bounds.
    return scrimmage === scrimmageRuling ? { ...out, looseBallOutOfBounds: clockFacts(t, ctx).looseBallOutOfBounds } : out;
  };

  const optionsOf = (seen: PlayTruth, calledOutcome: PlayOutcome, records: readonly FoulRecord[], ctx: RulingContext): EnforcementOption[] => {
    const anyCalled = records.some((f) => f.called);
    let list: EnforcementOption[];
    if (!anyCalled && kick.handles(seen)) list = kick.choices(seen, ctx);
    else if (fouls === foulRules) list = optionsFromTruth(seen, calledOutcome, records, ctx);
    else list = fouls.options(calledOutcome, records, ctx);
    const loose = calledOutcome.looseBallOutOfBounds;
    if (loose === undefined) return list;
    // An option that keeps the result of the play keeps its clock fact; a replayed down has none.
    return list.map((o) => (o.outcome.noPlay || o.outcome.looseBallOutOfBounds !== undefined ? o : { ...o, outcome: { ...o.outcome, looseBallOutOfBounds: loose } }));
  };

  const assemble = (truth: PlayTruth, seen: PlayTruth, rulings: Ruling[], records: FoulRecord[], ctx: RulingContext): CalledPlay => {
    const trueOutcome = rule(truth, ctx);
    const calledOutcome = rule(seen, ctx);
    const options = optionsOf(seen, calledOutcome, records, ctx);
    let best = options[0]!;
    for (const o of options) if (o !== best && o.side === best.side && betterFor(o.side, o.outcome, best.outcome, series, ctx)) best = o;
    return { rulings, fouls: records, trueOutcome, calledOutcome, options, defaultOptionId: best.optionId };
  };

  const clock: ClockRules = {
    ...baseClock,
    afterPlay: (outcome, liveDurationTenths, ctx) =>
      baseClock === clockRules
        ? afterPlayWithFacts(outcome, liveDurationTenths, ctx, { looseBallOutOfBounds: outcome.looseBallOutOfBounds === true })
        : baseClock.afterPlay(outcome, liveDurationTenths, ctx),
  };

  return {
    rulePlay(truth: PlayTruth, ctx: RulingContext): CalledPlay {
      const seenBy = crew.perceive(truth, fouls.candidates(truth, ctx), ctx);
      return assemble(truth, seenBy.seen, seenBy.rulings, seenBy.fouls, ctx);
    },

    review(called: CalledPlay, truth: PlayTruth, request: ReviewRequest, ctx: RulingContext): ReviewResult {
      const seenBy = crew.perceive(truth, fouls.candidates(truth, ctx), ctx);
      const res = replay.review(seenBy.seen, truth, called.rulings, request, ctx);
      const cost = challengeAccounting(request, res, ctx);
      if (!res.allowed || res.reversed.length === 0) return { allowed: res.allowed, refusedKey: res.refusedKey, reversed: [], called, ...cost };
      const reversed = new Set(res.reversed);
      const rulings = called.rulings.map((r, i) => (reversed.has(i) ? { ...r, calledValue: r.trueValue } : r));
      const records = foulsAfterReview(called.fouls, called.rulings, res.reversed);
      return { allowed: true, refusedKey: null, reversed: res.reversed, called: assemble(truth, res.seen, rulings, records, ctx), ...cost };
    },

    series, clock, restarts, overtime, replay, kick, scrimmage, fouls, crew,
  };
}
