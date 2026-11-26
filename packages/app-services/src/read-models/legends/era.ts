// X3.2.2 era and decade views: fixed blocks of seasons from the world's first season. Per block and per
// team: wins, losses, ties, winning share, titles, conference titles, head coaches, top X4 events, and
// league-wide rates from N2 as plain numbers. Dynasty flag and drought counts per X3.2.2 rule 3. Rule-era
// markers from B12 sit on the view so a jump in scoring reads against a rule change. Decade totals are
// sums of the season rows, so they always equal the season pages.
import { param } from './params.ts';
import { byNotability, reversedIds, scoreOf, DEFAULT_TYPES, type EventRow, type GameScore, type LegendsTypes, type TeamId } from './types.ts';

/** N2 league rates for one season, with the team games behind them (so blocks weight seasons fairly). */
export interface LeagueRates {
  readonly seasonYear: number;
  readonly teamGames: number;
  readonly pointsPerTeamGame: number;
  /** Pass attempts plus sacks over all plays from scrimmage (X3.2.2 rule 1). */
  readonly passShare: number;
  readonly yardsPerPlay: number;
  readonly turnoversPerTeamGame: number;
  readonly penaltiesPerTeamGame: number;
}

export interface TeamSeasonRow {
  readonly teamId: TeamId;
  readonly seasonYear: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly titles: number;
  readonly conferenceTitles: number;
  readonly headCoaches: readonly number[];
}

export interface TeamBlockRow {
  readonly teamId: TeamId;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  /** (wins + ties / 2) / games, or null with no games. */
  readonly winShare: number | null;
  readonly titles: number;
  readonly conferenceTitles: number;
  readonly headCoaches: readonly number[];
  readonly dynasty: boolean;
  /** Seasons since the last title and since the last winning season, as of the block's last season; null if never. */
  readonly seasonsSinceTitle: number | null;
  readonly seasonsSinceWinningSeason: number | null;
}

export interface EraBlock {
  readonly index: number;
  readonly firstSeason: number;
  readonly lastSeason: number;
  /** Fewer seasons played than a full block (X3.2.2 edge case). */
  readonly partial: boolean;
  readonly teams: readonly TeamBlockRow[];
  readonly rates: Omit<LeagueRates, 'seasonYear'> | null;
  readonly topEventIds: readonly number[];
  readonly ruleMarkers: readonly RuleMarker[];
}

/** A rule-set change from B12 (first season the set applied). */
export interface RuleMarker { readonly seasonYear: number; readonly ruleSetId: string }

export interface EraInput {
  readonly rows: readonly EventRow[];
  readonly firstSeason: number;
  readonly lastSeason: number;
  readonly rates?: readonly LeagueRates[];
  readonly ruleMarkers?: readonly RuleMarker[];
  /** Restrict games to one competition, or all. */
  readonly competitionId?: number;
  readonly types?: LegendsTypes;
}

export function blockOf(seasonYear: number, firstSeason: number): number {
  return Math.floor((seasonYear - firstSeason) / param('legends.era.block_seasons'));
}

/** One row per team per season, from game results, titles and head coach changes (vacated results dropped). */
export function teamSeasonRows(input: EraInput): TeamSeasonRow[] {
  const t = input.types ?? DEFAULT_TYPES;
  const rev = reversedIds(input.rows, t);
  const acc = new Map<string, { teamId: number; seasonYear: number; wins: number; losses: number; ties: number; titles: number; conferenceTitles: number; coaches: Set<number> }>();
  const get = (teamId: number, seasonYear: number) => {
    const k = `${teamId}:${seasonYear}`;
    return acc.get(k) ?? acc.set(k, { teamId, seasonYear, wins: 0, losses: 0, ties: 0, titles: 0, conferenceTitles: 0, coaches: new Set() }).get(k)!;
  };
  for (const e of input.rows) {
    if (rev.has(e.id)) continue;
    const y = e.when.date.seasonYear;
    if (y < input.firstSeason || y > input.lastSeason) continue;
    if (input.competitionId !== undefined && e.competitionId !== input.competitionId) continue;
    if (e.type === t.gameResult) {
      const g = scoreOf(e);
      if (!g) continue;
      const h = get(g.homeTeamId, y), a = get(g.awayTeamId, y);
      if (g.homeScore > g.awayScore) { h.wins++; a.losses++; } else if (g.homeScore < g.awayScore) { a.wins++; h.losses++; } else { h.ties++; a.ties++; }
    } else if (e.where.teamId !== null && e.type === t.title) get(e.where.teamId, y).titles++;
    else if (e.where.teamId !== null && e.type === t.conferenceTitle) get(e.where.teamId, y).conferenceTitles++;
    else if (e.where.teamId !== null && e.type === t.coachHired && e.payload['role'] === t.headCoachRole) {
      for (const a of e.actors) get(e.where.teamId, y).coaches.add(a.personId);
    }
  }
  return [...acc.values()].map((r) => ({ teamId: r.teamId, seasonYear: r.seasonYear, wins: r.wins, losses: r.losses, ties: r.ties, titles: r.titles, conferenceTitles: r.conferenceTitles, headCoaches: [...r.coaches].sort((a, b) => a - b) }))
    .sort((a, b) => a.seasonYear - b.seasonYear || a.teamId - b.teamId);
}

function weighted(rates: readonly LeagueRates[]): Omit<LeagueRates, 'seasonYear'> | null {
  const games = rates.reduce((s, r) => s + r.teamGames, 0);
  if (games <= 0) return null;
  const w = (f: (r: LeagueRates) => number) => rates.reduce((s, r) => s + f(r) * r.teamGames, 0) / games;
  return {
    teamGames: games, pointsPerTeamGame: w((r) => r.pointsPerTeamGame), passShare: w((r) => r.passShare), yardsPerPlay: w((r) => r.yardsPerPlay),
    turnoversPerTeamGame: w((r) => r.turnoversPerTeamGame), penaltiesPerTeamGame: w((r) => r.penaltiesPerTeamGame),
  };
}

export function eraBlocks(input: EraInput): EraBlock[] {
  const size = param('legends.era.block_seasons');
  const dynTitles = param('legends.era.dynasty_titles');
  const dynConf = param('legends.era.dynasty_conference_titles');
  const top = param('legends.era.top_events');
  const seasons = teamSeasonRows(input);
  const rev = reversedIds(input.rows, input.types ?? DEFAULT_TYPES);
  const blocks: EraBlock[] = [];
  const nBlocks = blockOf(input.lastSeason, input.firstSeason) + 1;
  for (let b = 0; b < nBlocks; b++) {
    const first = input.firstSeason + b * size;
    const fullLast = first + size - 1;
    const last = Math.min(fullLast, input.lastSeason);
    const inBlock = seasons.filter((s) => s.seasonYear >= first && s.seasonYear <= last);
    const teamIds = [...new Set(inBlock.map((s) => s.teamId))].sort((x, y) => x - y);
    const teams = teamIds.map((teamId): TeamBlockRow => {
      const mine = inBlock.filter((s) => s.teamId === teamId);
      const sum = (f: (s: TeamSeasonRow) => number) => mine.reduce((n, s) => n + f(s), 0);
      const wins = sum((s) => s.wins), losses = sum((s) => s.losses), ties = sum((s) => s.ties);
      const games = wins + losses + ties;
      const titles = sum((s) => s.titles), conferenceTitles = sum((s) => s.conferenceTitles);
      const history = seasons.filter((s) => s.teamId === teamId && s.seasonYear <= last);
      const lastTitle = Math.max(-Infinity, ...history.filter((s) => s.titles > 0).map((s) => s.seasonYear));
      const lastWinning = Math.max(-Infinity, ...history.filter((s) => s.wins > s.losses).map((s) => s.seasonYear));
      return {
        teamId, wins, losses, ties, winShare: games === 0 ? null : (wins + ties / 2) / games, titles, conferenceTitles,
        headCoaches: [...new Set(mine.flatMap((s) => s.headCoaches))].sort((x, y) => x - y),
        dynasty: titles >= dynTitles || conferenceTitles >= dynConf,
        seasonsSinceTitle: Number.isFinite(lastTitle) ? last - lastTitle : null,
        seasonsSinceWinningSeason: Number.isFinite(lastWinning) ? last - lastWinning : null,
      };
    });
    const events = input.rows.filter((e) => !rev.has(e.id) && e.when.date.seasonYear >= first && e.when.date.seasonYear <= last && e.notability !== null
      && (input.competitionId === undefined || e.competitionId === input.competitionId));
    blocks.push({
      index: b, firstSeason: first, lastSeason: last, partial: last < fullLast, teams,
      rates: weighted((input.rates ?? []).filter((r) => r.seasonYear >= first && r.seasonYear <= last)),
      topEventIds: [...events].sort(byNotability).slice(0, top).map((e) => e.id),
      ruleMarkers: (input.ruleMarkers ?? []).filter((m) => m.seasonYear >= first && m.seasonYear <= last),
    });
  }
  return blocks;
}

export type { GameScore };
