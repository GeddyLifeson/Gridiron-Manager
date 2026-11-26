// CareerSources from the save as the coach himself may read it (P1.3.2, K9.1.1). Every input is built from an
// ObservedWorld for his own observer, so a field the filter withholds (truth, another team's own rows) never
// reaches a screen. What the save does not hold yet (CR-CS-2) comes back null and the screen shows its empty
// state: contract terms (the world keeps only a staff contract's end year), the job market, money and life.
// The record's family lines are computed from his events in the log, never stored (E9.1.2 rule 1).
import { ladder, life, positions, record } from '@gm/career';
import type { JobHistoryRow, JobRecord, PersonRecord, TeamRecord, WorldDate, WorldEvent } from '@gm/schema';
import type { ObservedWorld } from '../../observer/index.ts';
import type { AssignmentsInput } from './assignments.ts';
import type { CareerInput, NetworkInput, StintInput } from './career.ts';
import type { ContractInput } from './contract.ts';
import { param } from './params.ts';
import type { RecordInput, SeasonInput } from './record.ts';
import type { CareerSources } from './spec.ts';
import { howKey } from './live-tables.ts';

type Level = positions.CatalogueLevel;

/** One team's season as the standings show it (public, C3): results and the finish in words. */
export interface TeamSeasonLine { readonly wins: number; readonly losses: number; readonly ties: number; readonly finish: string | null }

export interface LiveCareerOptions {
  /** `how` per job-history row (liveCareerTables), keyed by howKey. */
  readonly how?: ReadonlyMap<string, string>;
  /** The team's line in one season from the standings, or null when the season has no line for it. */
  teamSeason(teamId: number, seasonYear: number): TeamSeasonLine | null;
  /** The season now and the kind of week (H1, S3.1.1). */
  readonly seasonYear: number;
  readonly week: ladder.WeekKind;
  readonly catalogue?: positions.Catalogue;
}

const nameOf = (p: Pick<PersonRecord, 'name'> | undefined): string => (p?.name ? `${p.name.first} ${p.name.last}`.trim() : '');
const teamName = (t: Pick<TeamRecord, 'identity'> | undefined): string => t?.identity?.name ?? '';

/** Sources for the coach screens from the observed save. Nothing here reads a table the observer cannot. */
export function careerSourcesOf(world: ObservedWorld, opts: LiveCareerOptions): CareerSources {
  const cat = opts.catalogue ?? positions.CATALOGUE;
  const people = new Map(world.table('people').map((p) => [p.id, p as PersonRecord] as const));
  const teams = new Map(world.table('teams').map((t) => [t.id, t as TeamRecord] as const));
  const levelOfComp = new Map(world.table('competitions').map((c) => [c.id, c.level as Level] as const));
  const jobs = world.table('jobs') as readonly JobRecord[];
  const jobById = new Map(jobs.map((j) => [j.id, j] as const));
  const history = world.table('jobHistory') as readonly JobHistoryRow[];
  const events = world.table('events') as readonly WorldEvent[];

  const levelOf = (teamId: number): Level | null => { const t = teams.get(teamId); return t ? (levelOfComp.get(t.competitionId) ?? null) : null; };
  const jobOf = (personId: number): JobRecord | null => jobs.find((j) => j.holderPersonId === personId) ?? null;
  const known = (id: string): boolean => cat.jobs.some((j) => j.id === id);
  const historyOf = (personId: number): JobHistoryRow[] => history.filter((h) => h.personId === personId && known(h.catalogueId)).sort((a, b) => a.started.seasonYear - b.started.seasonYear);

  const seatOf = (personId: number): ladder.SeatView | null => {
    const j = jobOf(personId);
    const level = j ? levelOf(j.teamId) : null;
    if (!j || !level || !known(j.catalogueId)) return null;
    const team = teams.get(j.teamId);
    return ladder.seatView({ job: cat.job(j.catalogueId), level, flags: { callsPlays: j.callsPlays === true, hasRosterSay: team?.finalSay?.roster === j.id } });
  };
  const titleOf = (j: JobRecord | null): string | null => (j && known(j.catalogueId) ? cat.job(j.catalogueId).title : null);
  const rightsOf = (personId: number): readonly string[] => seatOf(personId)?.rights ?? ladder.SCREEN_TABLE.selfCommands;

  const stints = (personId: number): StintInput[] => historyOf(personId).flatMap((h) => {
    const level = levelOf(h.teamId);
    if (!level) return [];
    return [{
      startSeason: h.started.seasonYear, endSeason: h.ended?.seasonYear ?? null, jobId: h.catalogueId, team: teamName(teams.get(h.teamId)), level,
      how: opts.how?.get(howKey(personId, h.jobId, h.started.seasonYear)) ?? 'hired',
    }];
  });

  /** People who held a seat on a staff with him: the latest shared run per person (O7.6.1 network). */
  const network = (personId: number): NetworkInput[] => {
    const mine = historyOf(personId);
    const best = new Map<number, NetworkInput>();
    for (const h of history) {
      if (h.personId === personId) continue;
      for (const m of mine) {
        if (h.teamId !== m.teamId) continue;
        const from = Math.max(h.started.seasonYear, m.started.seasonYear);
        const hEnd = h.ended?.seasonYear ?? null, mEnd = m.ended?.seasonYear ?? null;
        const to = hEnd === null ? mEnd : mEnd === null ? hEnd : Math.min(hEnd, mEnd);
        if (to !== null && to < from) continue;
        const prev = best.get(h.personId);
        if (prev && prev.fromSeason >= from) continue;
        const now = jobOf(h.personId);
        best.set(h.personId, {
          name: nameOf(people.get(h.personId)), team: teamName(teams.get(h.teamId)), fromSeason: from, toSeason: to,
          nowJobId: now && known(now.catalogueId) ? now.catalogueId : null, nowTeam: now ? teamName(teams.get(now.teamId)) : null,
          imported: people.get(h.personId)?.origin === 'imported',
        });
      }
    }
    return [...best.values()].filter((n) => n.name !== '').sort((a, b) => b.fromSeason - a.fromSeason || a.name.localeCompare(b.name));
  };

  const seatAt = (personId: number, date: WorldDate): record.SeatAt | null => {
    const h = historyOf(personId).find((r) => r.started.seasonYear <= date.seasonYear && (r.ended === null || r.ended.seasonYear >= date.seasonYear));
    const j = h ? jobById.get(h.jobId) : undefined;
    return j ? { rung: j.rung, callsPlays: j.callsPlays === true, duties: null } : null;
  };

  return {
    career(personId): CareerInput | null {
      const p = people.get(personId);
      if (!p) return null;
      const j = jobOf(personId);
      return {
        name: nameOf(p), seat: seatOf(personId), jobId: j && known(j.catalogueId) ? j.catalogueId : null, team: j ? teamName(teams.get(j.teamId)) : null,
        stints: stints(personId), network: network(personId),
        // Regard by audience is not in the save yet (CR-CS-2); the screen reads "unknown" until it is.
        audiences: [], enrolment: null, catalogue: cat,
      };
    },
    jobMarket: () => null,
    contract(personId): ContractInput | null {
      if (!people.get(personId)) return null;
      const j = jobOf(personId);
      return { rights: rightsOf(personId), contract: null, team: j ? teamName(teams.get(j.teamId)) : null, jobTitle: titleOf(j), leagueYear: opts.seasonYear };
    },
    record(personId): RecordInput | null {
      if (!people.get(personId)) return null;
      const seasons: SeasonInput[] = [];
      for (const h of historyOf(personId)) {
        const title = cat.job(h.catalogueId).title;
        const end = h.ended?.seasonYear ?? opts.seasonYear;
        for (let y = h.started.seasonYear; y <= end; y++) {
          const line = opts.teamSeason(h.teamId, y);
          if (line) seasons.push({ season: y, team: teamName(teams.get(h.teamId)), jobTitle: title, wins: line.wins, losses: line.losses, ties: line.ties, finish: line.finish });
        }
      }
      const mine = events.filter((e) => e.actors?.some((a) => a.personId === personId));
      const first = historyOf(personId)[0]?.started.seasonYear ?? opts.seasonYear;
      return {
        rights: rightsOf(personId), seasons, events: mine,
        record: record.buildRecord(mine, personId, { seatAt }),
        window: { fromSeason: first, toSeason: opts.seasonYear }, certified: [],
      };
    },
    finance: () => null,
    life: () => null,
    assignments(personId): AssignmentsInput | null {
      const seat = seatOf(personId);
      const j = jobOf(personId);
      if (!seat || !j) return null;
      const boss = j.reportsToJobId === null ? null : jobById.get(j.reportsToJobId);
      const inSeason = opts.week !== 'offseason';
      // E7.7.2 required hours at the boss's hours culture, then S9 discretionary hours. The boss's culture is not
      // in the save yet: the midpoint is a named assumption (careerScreens.hoursCulture).
      let required = 0;
      if (life.RUNGS.includes(j.rung)) required = life.requiredHours(j.rung, inSeason, param('careerScreens.hoursCulture'));
      return {
        seat, week: opts.week, jobTitle: titleOf(j) ?? '',
        bossName: boss?.holderPersonId ? nameOf(people.get(boss.holderPersonId)) || null : null,
        freeHours: Math.round(life.discretionaryHours(required, life.param('sleepNeedHours'), 0)),
      };
    },
  };
}
