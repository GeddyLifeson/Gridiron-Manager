// Team page read model (C1 "another team: roster, staff, record and tendencies seen"; X8 open chairs).
// Everything comes through the observer filter: another club's staff chart and roster lists are public,
// its tendencies are the cells built from the plays the viewer has (P3.3.2), and nothing hidden (prestige,
// culture weights, true ratings) is read (K9).
import type { ObservedWorld } from '../../observer/index.ts';
import { cmpDate, cmpStr, groupsOf, ids, num, peopleNames, rows, seasonGames, recordsFrom, str, teamRefs, withTeams, EMPTY_WLT } from './shared.ts';
import type { RosterLine, StaffLine, TeamPageView, TendencyLine } from './types.ts';

export function buildTeamPage(world: ObservedWorld, teamId: number, seasonYear: number): TeamPageView | null {
  const t = rows(world, 'teams').find((x) => x.id === teamId);
  if (!t) return null;
  const competitionId = num(t.competitionId) ?? 0;
  const ident = (t.identity ?? {}) as { name?: string; nickname?: string; place?: string; abbreviation?: string };
  const comp = rows(world, 'competitions').find((c) => c.id === competitionId);
  const groups = groupsOf(world, competitionId);
  const direct = groups.filter((g) => g.teamIds.includes(teamId));
  const parents = groups.filter((g) => direct.some((x) => x.parentId === g.id) && !direct.includes(g));
  const groupNames = [...direct, ...parents].sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === 'conference' ? -1 : 1)).map((g) => g.name);
  const v = rows(world, 'venues').find((x) => x.id === t.homeVenueId);

  const games = seasonGames(world, competitionId, seasonYear);
  const mine = games.filter((g) => g.teamIds.includes(teamId));
  const results = mine.filter((g) => g.status === 'final').sort((a, b) => cmpDate(b.kickoff, a.kickoff) || b.gameId - a.gameId);
  const upcoming = mine.filter((g) => g.status === 'scheduled' || g.status === 'postponed').sort((a, b) => cmpDate(a.kickoff, b.kickoff) || a.gameId - b.gameId);

  const jobs = rows(world, 'jobs').filter((j) => j.teamId === teamId && typeof j.id === 'number').sort((a, b) => (num(b.rung) ?? 0) - (num(a.rung) ?? 0) || (a.id as number) - (b.id as number));
  const slots = rows(world, 'rosterSlots').filter((r) => r.teamId === teamId && typeof r.personId === 'number');
  const names = peopleNames(world, [...jobs.map((j) => num(j.holderPersonId)).filter((x): x is number => x !== null), ...slots.map((s) => s.personId as number)]);
  const position = new Map(rows(world, 'people').map((p) => [p.id, str((p.playing as { position?: unknown } | undefined)?.position)]));

  const staff: StaffLine[] = jobs.map((j) => {
    const holder = num(j.holderPersonId);
    return { jobId: j.id as number, catalogueId: str(j.catalogueId) ?? '', personId: holder, name: holder === null ? null : names[String(holder)] ?? `#${holder}`, holding: holder === null ? null : str(j.holding) };
  });
  const roster: RosterLine[] = slots.map((s) => ({
    personId: s.personId as number, name: names[String(s.personId)] ?? `#${s.personId}`, position: position.get(s.personId) ?? null, jersey: num(s.jersey), list: str(s.list) ?? '',
  })).sort((a, b) => cmpStr(a.list, b.list) || cmpStr(a.position ?? '', b.position ?? '') || (a.jersey ?? 0) - (b.jersey ?? 0) || a.personId - b.personId);

  const cells = rows(world, 'tendencies').filter((c) => c.teamId === teamId && c.seasonYear === seasonYear);
  const bucketTotal = new Map<string, number>();
  for (const c of cells) bucketTotal.set(String(c.situationBucket), (bucketTotal.get(String(c.situationBucket)) ?? 0) + (num(c.count) ?? 0));
  const tendencies: TendencyLine[] = cells.map((c) => {
    const count = num(c.count) ?? 0, total = bucketTotal.get(String(c.situationBucket)) ?? 0;
    return { situationBucket: String(c.situationBucket), callKey: String(c.callKey), count, share: total > 0 ? count / total : 0 };
  }).sort((a, b) => cmpStr(a.situationBucket, b.situationBucket) || b.count - a.count || cmpStr(a.callKey, b.callKey));

  const rivals = ids(t.rivalTeamIds);
  const base = teamRefs(world, competitionId);
  return {
    teamId, team: base[String(teamId)] ?? { teamId, name: ident.name ?? `#${teamId}`, abbreviation: ident.abbreviation ?? `#${teamId}` },
    nickname: ident.nickname ?? '', place: ident.place ?? '', competitionName: str(comp?.name), groupNames,
    venue: v ? { name: str(v.name) ?? '', place: str(v.place) ?? '', capacity: num(v.capacity) ?? 0, roof: str(v.roof) ?? '', surfaceType: str(v.surfaceType) ?? '' } : null,
    resourceBand: str(t.resourceBand) ?? '', seasonYear, record: recordsFrom(games).get(teamId) ?? EMPTY_WLT, results, upcoming,
    staff, openChairs: staff.filter((s) => s.personId === null).length, roster, rivals, tendencies,
    teams: withTeams(world, base, [...rivals, ...mine.flatMap((g) => g.teamIds)]),
  };
}
