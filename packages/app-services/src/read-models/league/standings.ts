// Standings read model (C3.1.2 table, C3.1.3 final rank, C3.2.3 tie explanation, C3.3 seeds, clinching
// and odds, C3.4 bracket; T3.3 conference standings, T3.4 rankings and poll, T3.6 bowls). The rows are
// recomputed here from the final games the viewer sees, with the league's own `Ledger`. Tie order, seeds,
// rankings and bowls need seeded draws (J13), so the season side computes them with the league package
// and hands them in; without them the groups fall back to percentage order and say so (`final: false`).
import { standings, postseason } from '@gm/league';
import type { ObservedWorld } from '../../observer/index.ts';
import { EMPTY_WLT, conferenceOf, groupsOf, seasonGames, teamRefs, withTeams, rows } from './shared.ts';
import type { BowlLine, BracketLine, CollegePicture, StandingsGroup, StandingsLine, StandingsMark, StandingsView, TieNote } from './types.ts';

type GameResult = standings.GameResult;

export interface StandingsSource {
  /** Rule values of the competition's league-rules file (standings.tie_win_value and the display keys). */
  readonly rules: standings.RuleValues;
  /** Touchdowns by side from the play record (the game row lacks them, C3.1.1); null counts zero. */
  readonly touchdowns?: (gameId: number) => readonly [number, number] | null;
  readonly forfeit?: (gameId: number) => boolean;
  readonly pro?: {
    readonly table?: standings.SeasonTable | null;
    readonly clinch?: readonly standings.ClinchStatus[];
    readonly odds?: readonly standings.PlayoffOdds[];
  };
  readonly college?: {
    readonly conferences?: readonly standings.ConferenceStandings[];
    readonly ranking?: { readonly order: readonly number[]; readonly resumes: readonly postseason.Resume[] } | null;
    readonly poll?: { readonly order: readonly number[]; readonly points: ReadonlyMap<number, number> } | null;
    readonly bowls?: postseason.BowlSelection | null;
    /** Text key of each bowl's generated name (content). */
    readonly bowlNameKey?: (bowlId: number) => string;
  };
  readonly bracket?: postseason.Bracket | null;
}

/** Final regular- and postseason games the viewer sees, as standings results. */
export function observedResults(world: ObservedWorld, competitionId: number, seasonYear: number, src: Pick<StandingsSource, 'touchdowns' | 'forfeit'>): GameResult[] {
  const out: GameResult[] = [];
  for (const g of seasonGames(world, competitionId, seasonYear)) {
    if (g.status !== 'final' || !g.score || g.phase === 'preseason') continue;
    out.push({
      gameId: g.gameId, week: g.week, phase: g.phase, teams: g.teamIds, points: g.score,
      touchdowns: src.touchdowns?.(g.gameId) ?? [0, 0], overtime: false, forfeit: src.forfeit?.(g.gameId) ?? false, neutralSite: g.neutralSite,
    });
  }
  return out;
}

function marksFor(teamId: number, src: StandingsSource, champion: number | null, titleTeams: ReadonlySet<number>, confChampions: ReadonlySet<number>): StandingsMark[] {
  const m: StandingsMark[] = [];
  const c = src.pro?.clinch?.find((x) => x.teamId === teamId);
  if (c?.clinchedTopSeed) m.push('clinched_top_seed');
  if (c?.clinchedDivision) m.push('clinched_division');
  if (c?.clinchedPlayoffs) m.push('clinched_playoffs');
  if (c?.eliminated) m.push('eliminated');
  if (titleTeams.has(teamId)) m.push('title_game');
  if (confChampions.has(teamId)) m.push('conference_champion');
  if (champion === teamId) m.push('champion');
  return m;
}

function collegePicture(src: NonNullable<StandingsSource['college']>): CollegePicture {
  const resumes = new Map((src.ranking?.resumes ?? []).map((r) => [r.teamId, r]));
  return {
    rankings: (src.ranking?.order ?? []).map((teamId, i) => {
      const r = resumes.get(teamId);
      return { rank: i + 1, teamId, record: r?.record ?? EMPTY_WLT, scheduleStrength: r?.scheduleStrength ?? 0, bestWins: [...(r?.bestWins ?? [])] };
    }),
    poll: (src.poll?.order ?? []).map((teamId, i) => ({ rank: i + 1, teamId, points: src.poll?.points.get(teamId) ?? 0 })),
    bowls: (src.bowls?.games ?? []).map((g): BowlLine => ({ bowlId: g.bowlId, nameKey: src.bowlNameKey?.(g.bowlId) ?? `bowl.${g.bowlId}`, teams: [g.teams[0], g.teams[1]] as const }))
      .concat((src.bowls?.unfilled ?? []).map((bowlId): BowlLine => ({ bowlId, nameKey: src.bowlNameKey?.(bowlId) ?? `bowl.${bowlId}`, teams: null }))),
    eligible: [...(src.bowls?.eligible ?? [])],
    shortFill: [...(src.bowls?.shortFill ?? [])],
    titleGames: (src.conferences ?? []).filter((c) => c.titleGame).map((c) => ({ conferenceId: c.conferenceId, teams: [c.titleGame![0], c.titleGame![1]] as const, champion: c.champion })),
  };
}

export function buildStandings(world: ObservedWorld, competitionId: number, seasonYear: number, src: StandingsSource): StandingsView {
  const comp = rows(world, 'competitions').find((c) => c.id === competitionId);
  const level: 'pro' | 'college' = comp?.level === 'college' ? 'college' : 'pro';
  const groups = groupsOf(world, competitionId);
  const confOf = conferenceOf(groups);
  const divisionOf = new Map<number, number>();
  for (const g of groups) for (const t of g.teamIds) if (g.kind === 'division' || !divisionOf.has(t)) divisionOf.set(t, g.id);
  const base = teamRefs(world, competitionId);
  const clubs = Object.values(base).map((t) => t.teamId).sort((a, b) => a - b);
  const places = clubs.map((id) => ({ id, conferenceId: confOf.get(id) ?? 0, divisionId: divisionOf.get(id) ?? confOf.get(id) ?? 0 }));
  const results = observedResults(world, competitionId, seasonYear, src);
  const ledger = new standings.Ledger(places, results, src.rules);
  const rowsById = new Map(standings.standingsRows(ledger).map((r) => [r.teamId, r]));

  const table = level === 'pro' ? src.pro?.table ?? null : null;
  const confStandings = level === 'college' ? src.college?.conferences ?? [] : [];
  const titleTeams = new Set(confStandings.flatMap((c) => c.titleGame ?? []));
  const confChampions = new Set(confStandings.map((c) => c.champion).filter((x): x is number => x !== null));
  const champion = src.bracket?.champion ?? null;
  const ranking = new Map((src.college?.ranking?.order ?? []).map((t, i) => [t, i + 1]));
  const odds = new Map((src.pro?.odds ?? []).map((o) => [o.teamId, o]));

  const lines: StandingsLine[] = clubs.map((id) => {
    const r = rowsById.get(id)!;
    const o = odds.get(id);
    return {
      teamId: id, record: r.record, pct: r.pct, pointsFor: r.pointsFor, pointsAgainst: r.pointsAgainst, netPoints: r.netPoints,
      home: r.home, road: r.road, division: r.division, conference: r.conference, streakKind: r.streak.kind, streakLength: r.streak.length,
      lastFive: r.lastFive, strengthOfVictory: r.strengthOfVictory, strengthOfSchedule: r.strengthOfSchedule,
      marks: marksFor(id, src, champion, titleTeams, confChampions), odds: o ? { playoffs: o.playoffs, division: o.division, topSeed: o.topSeed } : null,
      ranking: ranking.get(id) ?? null,
    };
  });

  const byPct = (teamIds: readonly number[]) => [...teamIds].sort((a, b) => (rowsById.get(b)?.pct ?? 0) - (rowsById.get(a)?.pct ?? 0) || a - b);
  const leagueOrder = (g: (typeof groups)[number]): readonly number[] | null => {
    if (table && g.kind === 'division') return table.divisions.find((d) => d.divisionId === g.id)?.order ?? null;
    const cs = confStandings.find((c) => c.conferenceId === g.id);
    return cs ? cs.order : null;
  };
  const shownGroups: StandingsGroup[] = groups.map((g) => {
    const order = leagueOrder(g);
    return { groupId: g.id, name: g.name, kind: g.kind, parentId: g.parentId, teamIds: [...(order ?? byPct(g.teamIds))], final: order !== null };
  });

  const confName = new Map(groups.map((g) => [g.id, g.name]));
  const seeds = (table?.conferences ?? []).map((c) => ({ conferenceId: c.conferenceId, name: confName.get(c.conferenceId) ?? `#${c.conferenceId}`, seeds: [...c.seeds], divisionWinners: [...c.divisionWinners], rest: [...c.rest] }));
  const tieNotes: TieNote[] = [
    ...(table?.log ?? []).map((e) => ({ listKey: `standings.list.${e.list}`, stepKey: `standings.step.${e.step}`, teamIds: [...e.clubs], advanced: e.advanced })),
    ...confStandings.flatMap((c) => c.log.map((e) => ({ listKey: 'standings.list.conference', stepKey: `standings.step.${e.step}`, teamIds: [...e.clubs], advanced: e.advanced }))),
  ];
  const bracket: BracketLine[] = (src.bracket?.games ?? []).map((g) => ({ key: g.key, round: g.round, group: g.group, teams: [g.teams[0], g.teams[1]], seeds: [g.seeds[0], g.seeds[1]], host: g.host, winner: g.winner }));
  const college = level === 'college' && src.college ? collegePicture(src.college) : null;
  const mentioned = [...bracket.flatMap((b) => b.teams), ...(college?.bowls.flatMap((b) => b.teams ?? []) ?? []), ...(college?.rankings.map((r) => r.teamId) ?? [])];

  return {
    competitionId, seasonYear, level, teams: withTeams(world, base, mentioned), lines, groups: shownGroups, seeds, tieNotes,
    uncertain: table?.uncertain ?? false, bracket, champion, college,
    gamesCounted: results.filter((g) => g.phase === 'regular').length,
  };
}
