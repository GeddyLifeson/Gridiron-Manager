// Transaction wire and news page read models (C10.1 wire, C10.7 "a news page holds everything public").
// Transactions are the roster-family events (X2.1.2) the viewer can see; the observer filter has already
// removed any row the viewer was not a witness to, so a move not yet public cannot show (K9, C10.1 public
// time). News rows are the stored news items. Both are newest first and carry the filter flags the C10.1
// default view uses (his club, this week's opponent, his division).
import type { ObservedWorld } from '../../observer/index.ts';
import {
  asDate, cmpDate, eventPeople, eventTeams, groupsOf, ids, num, params, peopleNames, rows, str, teamRefs, typesOfFamily, withTeams,
} from './shared.ts';
import type { NewsLine, NewsView, TransactionLine, TransactionsView } from './types.ts';

/** Who is asking: his club, this week's opponent and the club's ready list (M3.2.1). All optional. */
export interface WireContext {
  readonly teamId?: number | null;
  readonly opponentTeamId?: number | null;
  readonly readyList?: readonly number[];
}

/** Clubs in the same division (or conference when there are no divisions) as `teamId`. */
function divisionMates(world: ObservedWorld, teamId: number | null | undefined): Set<number> {
  if (typeof teamId !== 'number') return new Set();
  const t = rows(world, 'teams').find((x) => x.id === teamId);
  const groups = groupsOf(world, num(t?.competitionId) ?? 0).filter((g) => g.teamIds.includes(teamId));
  const g = groups.find((x) => x.kind === 'division') ?? groups[0];
  return new Set(g?.teamIds ?? []);
}

export function buildTransactions(world: ObservedWorld, competitionId: number | null, ctx: WireContext = {}): TransactionsView {
  const types = typesOfFamily(world, 'roster');
  const division = divisionMates(world, ctx.teamId);
  const ready = new Set(ctx.readyList ?? []);
  const lines: TransactionLine[] = [];
  for (const e of rows(world, 'events')) {
    const type = str(e.type), id = num(e.id), date = asDate((e.when as { date?: unknown } | undefined)?.date);
    if (!type || id === null || !date || !types.has(type)) continue;
    if (competitionId !== null && e.competitionId !== competitionId) continue;
    const teams = eventTeams(e), people = eventPeople(e);
    const teamId = teams[0] ?? null;
    lines.push({
      eventId: id, type, date, teamId, personIds: people, lineTemplate: types.get(type)!, params: params(e.payload),
      mine: typeof ctx.teamId === 'number' && teams.includes(ctx.teamId),
      opponent: typeof ctx.opponentTeamId === 'number' && teams.includes(ctx.opponentTeamId),
      division: teams.some((t) => division.has(t)), readyList: people.some((p) => ready.has(p)),
    });
  }
  lines.sort((a, b) => cmpDate(b.date, a.date) || b.eventId - a.eventId);
  return {
    competitionId, lines,
    teams: withTeams(world, teamRefs(world, competitionId), lines.flatMap((l) => (l.teamId === null ? [] : [l.teamId]))),
    people: peopleNames(world, lines.flatMap((l) => l.personIds)),
  };
}

export function buildNews(world: ObservedWorld, ctx: WireContext = {}): NewsView {
  const lines: NewsLine[] = [];
  for (const n of rows(world, 'news')) {
    const id = num(n.id), date = asDate(n.date), kind = str(n.kind), templateKey = str(n.templateKey);
    if (id === null || !date || !kind || !templateKey) continue;
    const teamIds = ids(n.subjectTeamIds);
    lines.push({
      newsId: id, date, kind, templateKey, params: params(n.params), teamIds, personIds: ids(n.subjectPersonIds),
      audience: str(n.audience) ?? '', mine: typeof ctx.teamId === 'number' && teamIds.includes(ctx.teamId),
    });
  }
  lines.sort((a, b) => cmpDate(b.date, a.date) || b.newsId - a.newsId);
  return {
    lines, kinds: [...new Set(lines.map((l) => l.kind))].sort(),
    teams: withTeams(world, {}, lines.flatMap((l) => l.teamIds)),
    people: peopleNames(world, lines.flatMap((l) => l.personIds)),
  };
}
