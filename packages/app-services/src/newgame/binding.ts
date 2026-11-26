// One draft of the past, bound like the master data run (packages/world/test/loop/tools/master-history.ts):
// the real game for every game, the changing-league schedule, team founding and folding, lost clubs,
// leaving and death, the Hall of Fame, the yearly cohorts, development and roster moves. Steps whose
// owning system is not built yet stay unbound and are listed on the review screen; nothing is faked.
// Today's rules for the whole span (Marlon 2026-11-26: "the rules have always been the rules").
import { generation, loop, recruiting, season, turnover } from '@gm/world';
import { calendar } from '@gm/league';
import { appWorldContent, type AppWorldContent, type Level } from './content.ts';

export interface DraftSetupInput {
  readonly seedHex: string;
  readonly size: generation.SizePreset;
  readonly historySeasons: number;
  readonly careerStartYear: number;
}

export interface DraftParts { readonly world: loop.LiveWorld; readonly systems: loop.WorldSystems; readonly plan: loop.HistoryPlan }

/** The frozen setup record of a draft (X10.1.1). No difficulty, modifier or outcome field exists. */
export function draftSetup(i: DraftSetupInput): generation.SetupRecord {
  return generation.createSetup({
    seedHex: i.seedHex, size: i.size, historySeasons: i.historySeasons, packs: [], careerCurveDial: null, rulebookEra: 'era:2026',
    eraProgression: false, firstSeasonYear: generation.firstSeasonFor(i.careerStartYear, i.historySeasons),
  });
}

export interface BindingOptions {
  /** The game port. The real game unless a caller passes another real-engine port (a worker pool). */
  readonly games?: loop.GamePort;
  readonly onSeason?: loop.HistoryPlan['onSeason'];
  readonly content?: AppWorldContent;
}

/** Parts for `loop.draftHistory`: a fresh world from the setup and every built system bound to it. */
export function bindDraft(setupOf: (seedHex: string) => generation.SetupRecord, opts: BindingOptions = {}): (seedHex: string, seedStep: number) => DraftParts {
  const app = opts.content ?? appWorldContent();
  const { content, names } = app;
  const games = opts.games ?? season.historyGamePort();
  return (seedHex, seedStep) => {
    const setup = setupOf(seedHex);
    const world = loop.createWorld({
      setup, content, names, seedStep, eventTypes: turnover.TURNOVER_EVENT_TYPES,
      foundingCurves: generation.defaultFoundingCurves(), lostClubs: { fraction: 1 },
    });
    const { systems, schedule } = bindSystems(world, { games, content: app, unboundReason: 'new game history: owning system not built yet' });
    return { world, systems, plan: { seasons: setup.historySeasons, schedule, ...(opts.onSeason ? { onSeason: opts.onSeason } : {}) } };
  };
}

export interface SystemsOptions {
  readonly games: loop.GamePort;
  readonly content?: AppWorldContent;
  /**
   * Off-screen recruiting (T4) in the `moves` slot, wired as world/recruiting README says. Off for the
   * history drafts, so the new-game past and the baked master run keep their hashes; on for a career.
   */
  readonly recruiting?: boolean;
  /** The user's own program in the recruiting week (a college career): left out of the AI programs, his queued acts taken. */
  readonly recruitingUser?: (world: loop.LiveWorld) => recruiting.UserRecruiting | undefined;
  /** Wraps the schedule (a career takes the seat's competition out and feeds its played games instead). */
  readonly schedule?: (base: loop.SchedulePort) => loop.SchedulePort;
  readonly unboundReason?: string;
}

export interface BoundSystems { readonly systems: loop.WorldSystems; readonly schedule: loop.SchedulePort; readonly binding: turnover.TurnoverBinding }

/** Every built system bound to an existing world: the draft binding, and the career's after its start. */
export function bindSystems(world: loop.LiveWorld, opts: SystemsOptions): BoundSystems {
  const app = opts.content ?? appWorldContent();
  const { content, names, lookup } = app;
  const games = opts.games;
  const base = loop.historySchedule({
    regularGames: (c) => content.seasonGamesByLevelId?.[c.name] ?? content.levels[c.level as Level].seasonGames,
    postseasonField: (c) => lookup[c.level as Level]('playoff.field_size'),
  });
  const schedule = opts.schedule ? opts.schedule(base) : base;
  const rule: turnover.RuleRead = (lvl, k) => lookup[lvl as Level](k);
  const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
  const rb: recruiting.RecruitingBinding | null = opts.recruiting
    ? { turnover: binding, calendarFiles: calendar.CALENDAR_FILES, policy: () => recruiting.gmRecruitingPolicy(), ...(opts.recruitingUser ? { user: opts.recruitingUser } : {}) }
    : null;
  const moves = rb
    ? recruiting.movesWithRecruiting(rb, turnover.rosterMovesStep({ ...binding, policy: recruiting.lettersPolicy(binding.policy) }))
    : turnover.rosterMovesStep(binding);
  const systems = loop.systemsFrom({
    lifecycle: loop.lifecycleStep({ content, names, built: world }),
    games: loop.gamesStep(schedule, games),
    leaving: loop.leavingStep(),
    compaction: loop.slimStep(),
    hall: loop.hallStep({ halls: loop.defaultHalls({ pro: 'pro', college: 'college' }, lookup.pro('standings.tie_win_value') ?? 0.5) }),
    cohorts: loop.cohortStep({
      scale: (w) => {
        const alive = w.teams.filter((t) => loop.isActive(w, t.id));
        const pro = alive.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
        return { topCollegeTeams: alive.length - pro, draftedCount: pro * (lookup.pro(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 };
      },
      names, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
      ...(rb ? { recruitLeadYears: recruiting.param('cohort.leadYears') } : {}),
    }),
    development: turnover.developmentStep(binding),
    moves,
  }, opts.unboundReason ?? 'owning system not built yet');
  return { systems, schedule, binding };
}
