// The head coach seat for one week (H1.1.3, R1.2.7 gate item 1). The week is built from the level's
// template set, the league deadlines become pending items, and the clock runs in "next decision" mode:
// it stops at every required item until the driver answers, and it ends at the game block. A driver
// that answers nothing is a head coach who leaves every call to staff; the log shows each default taken
// in his name. A league week with no game is not a week of its own (H1.1.1): the open days belong to the
// long week that leads to the next game, which is built with the bye shape.
import { calendar, week as weekly } from '@gm/league';
import { SeasonInvariantError, type PrepContext, type SeatWeekRecord } from './types.ts';

type Instant = calendar.Instant;

/** The person in the seat: a user interface, a scripted policy in a test, or a harness that delegates. */
export interface SeatDriver {
  readonly role: weekly.LeaderRole;
  /** The choice for a required item, or null to take the staff default. */
  decide(item: weekly.PendingItem, run: weekly.WeekRun): string | null;
  /** True hands the blocks this role leads to staff (the "to game day" choice). */
  readonly delegateBlocks: boolean;
  /** Runs one block (H3, H4, H5, H7, H8); its report is kept in the week run. */
  readonly resolveBlock: weekly.BlockResolver;
  /** What the seat hands to its own game (plan, sheets), built from the finished week. */
  preparation?(run: weekly.WeekRun, ctx: PrepContext): unknown;
}

export interface SeatWeekSource {
  /** Template set of the competition (H1.2). */
  readonly set: weekly.TemplateSet;
  /** Countable-hours regime (H1.5.2). */
  readonly countable: boolean;
  /** Kickoff of the week's fixture. Never called in a league week with no game. */
  kickoff(ctx: PrepContext): Instant;
  /** Day of the team's previous game, or null in week 1. */
  previousGameDay(ctx: PrepContext): number | null;
  /** Extra pending items of the week (H5 injury calls, H6 roster deadlines, L9 events). */
  items?(ctx: PrepContext): readonly weekly.PendingItem[];
}

/** A driver that leaves everything to staff. */
export function delegatingDriver(role: weekly.LeaderRole): SeatDriver {
  return { role, decide: () => null, delegateBlocks: true, resolveBlock: () => null };
}

/** True when the team had no game in the league week before this one (the schedule's bye, C2). */
export function comingOffBye(ctx: PrepContext): boolean {
  return ctx.week > 1 && !ctx.results.some((r) => r.week === ctx.week - 1 && r.teams.includes(ctx.teamId));
}

export function runSeatWeek(ctx: PrepContext, source: SeatWeekSource, driver: SeatDriver): SeatWeekRecord {
  if (ctx.fixture === null) {
    return { teamId: ctx.teamId, week: ctx.week, bye: true, blocksRun: 0, blocksDelegated: 0, decisions: [], reachedGameDay: false, preparation: null };
  }
  const kickoff = source.kickoff(ctx);
  const built = weekly.buildWeek({
    teamId: ctx.teamId, weekId: `s${ctx.season}w${ctx.week}`, previousGameDay: source.previousGameDay(ctx), kickoff,
    home: ctx.fixture.home === ctx.teamId, bye: comingOffBye(ctx), playoff: ctx.fixture.phase === 'postseason',
    set: source.set, countable: source.countable,
  });
  const items = [...weekly.leagueItems(calendar.weeklyDeadlines(kickoff, 'game')), ...(source.items?.(ctx) ?? [])];
  let run = weekly.startRun(built, items);
  const opts = { userRole: driver.role, delegateUserBlocks: driver.delegateBlocks };
  let stop: weekly.StepResult['stop'] = 'decision';
  const answered = new Set<string>();
  // Every pass either answers one item or ends the week, so items + 1 passes always suffice.
  for (let pass = 0; pass <= items.length + 1; pass++) {
    const r = weekly.step(run, 'decision', driver.resolveBlock, opts);
    run = r.run; stop = r.stop;
    if (stop !== 'decision') break;
    const item = r.item!;
    const answer = driver.decide(item, run);
    if (answer !== null) answered.add(item.id);
    run = weekly.choose(run, item.id, answer ?? item.defaultChoice);
  }
  if (stop === 'decision') throw new SeasonInvariantError(`week ${ctx.week}: the seat's week did not reach its end`);
  return {
    teamId: ctx.teamId, week: ctx.week, bye: false,
    blocksRun: run.log.filter((e) => e.kind === 'block').length,
    blocksDelegated: run.log.filter((e) => e.kind === 'delegated').length,
    decisions: run.log.filter((e) => e.kind === 'choice' || e.kind === 'default').map((e) => ({ id: e.id, value: e.value, chosen: answered.has(e.id) })),
    reachedGameDay: stop === 'game_day',
    preparation: driver.preparation?.(run, ctx) ?? null,
  };
}

/** The `seatWeek` port of the season runner for one source and driver. */
export function seatPort(source: SeatWeekSource, driver: SeatDriver): (ctx: PrepContext) => SeatWeekRecord {
  return (ctx) => runSeatWeek(ctx, source, driver);
}
