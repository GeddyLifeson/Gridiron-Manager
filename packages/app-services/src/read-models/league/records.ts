// Awards, records and history read model (C9.1 awards page, C9.2 records page, C9.4 team history). Honours
// are the honors-family events (X2.1.2) the viewer can see, with reversals (award_rescinded) marking the
// line they undo rather than deleting it (X2.1.3). Record books come from the league awards module
// (`awards.computeBook`) run over public game lines (C9.2.1: never coaches' grades) and are handed in.
// The history table lists each season's champion from the season records and title events.
import { awards } from '@gm/league';
import type { ObservedWorld } from '../../observer/index.ts';
import { asDate, eventPeople, eventTeams, num, params, peopleNames, rows, str, teamRefs, typesOfFamily, withTeams } from './shared.ts';
import type { BookLine, HonourLine, RecordList, RecordsView, SeasonHistoryLine } from './types.ts';

export interface RecordsSource {
  /** Record books for this competition, from `awards.computeBook`. */
  readonly books?: readonly awards.RecordBook[];
  /** Event types that name a season's champion (content; the league title event). */
  readonly championTypes?: readonly string[];
  /** Event type that reverses an honour (X2.1.3 rule 1). */
  readonly reversalType?: string;
}

const DEFAULT_REVERSAL = 'award_rescinded';

function bookLines(b: awards.RecordBook): RecordList {
  const own: BookLine[] = b.entries.map((e) => ({ rank: 0, holderId: e.holderId, value: e.value, season: e.season, gameId: e.gameId, seasonGames: e.seasonGames, imported: false }));
  const prior: BookLine[] = b.prior.map((e) => ({ rank: 0, holderId: e.holderId, value: e.value, season: e.season, gameId: e.gameId, seasonGames: e.seasonGames, imported: true }));
  const direction = b.def.direction ?? 'most';
  const merged = [...own, ...prior].sort((x, y) => (direction === 'most' ? y.value - x.value : x.value - y.value) || x.season - y.season || x.holderId - y.holderId);
  return { recordId: b.def.id, statistic: b.def.statistic, scope: b.def.scope, holder: b.def.holder, direction, entries: merged.map((e, i) => ({ ...e, rank: i + 1 })) };
}

export function buildRecords(world: ObservedWorld, competitionId: number, seasonYear: number | null, src: RecordsSource = {}): RecordsView {
  const honorTypes = typesOfFamily(world, 'honors');
  const reversal = src.reversalType ?? DEFAULT_REVERSAL;
  const champions = new Set(src.championTypes ?? []);
  const events = rows(world, 'events').filter((e) => e.competitionId === competitionId && typeof e.type === 'string' && honorTypes.has(e.type as string));
  const reversed = new Set(events.filter((e) => e.type === reversal).map((e) => num(e.causeId)).filter((x): x is number => x !== null));
  const all: HonourLine[] = [];
  for (const e of events) {
    const id = num(e.id), date = asDate((e.when as { date?: unknown } | undefined)?.date);
    if (id === null || !date || e.type === reversal) continue;
    const season = num((e.payload as { season?: unknown } | undefined)?.season) ?? date.seasonYear;
    all.push({
      eventId: id, type: e.type as string, seasonYear: season, lineTemplate: honorTypes.get(e.type as string)!, params: params(e.payload),
      personIds: eventPeople(e), teamId: eventTeams(e)[0] ?? null, reversed: reversed.has(id),
    });
  }
  all.sort((a, b) => b.seasonYear - a.seasonYear || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || a.eventId - b.eventId);
  const honours = seasonYear === null ? all : all.filter((h) => h.seasonYear === seasonYear);

  const seasons = new Set<number>(all.map((h) => h.seasonYear));
  for (const s of rows(world, 'seasons')) if (s.competitionId === competitionId && typeof s.year === 'number') seasons.add(s.year);
  const history: SeasonHistoryLine[] = [...seasons].sort((a, b) => b - a).map((year) => {
    const champ = all.find((h) => h.seasonYear === year && champions.has(h.type) && !h.reversed);
    return { seasonYear: year, champion: champ?.teamId ?? null, honours: all.filter((h) => h.seasonYear === year && !h.reversed).length };
  });

  const books = (src.books ?? []).map(bookLines);
  const holders = books.flatMap((b) => b.entries.map((e) => ({ holder: b.holder, id: e.holderId })));
  return {
    competitionId, seasonYear, honours, books, history,
    teams: withTeams(world, teamRefs(world, competitionId), [...honours.map((h) => h.teamId), ...history.map((h) => h.champion), ...holders.filter((h) => h.holder === 'team').map((h) => h.id)].filter((x): x is number => x !== null)),
    people: peopleNames(world, [...honours.flatMap((h) => h.personIds), ...holders.filter((h) => h.holder === 'player').map((h) => h.id)]),
  };
}
