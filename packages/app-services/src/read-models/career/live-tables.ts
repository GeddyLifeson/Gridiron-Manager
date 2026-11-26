// The running career save as world tables, for the coach screens (CR-CS-2 stop-gap). The live world keeps
// people, job rows, staff lists by season, team results and the event log, but no job-history table yet. This
// reads the career screens' tables out of it: competitions, teams, job rows, the people who hold or held a
// seat beside the coach, his events, and job-history rows (P3.5.1 `JobHistoryRow`) for him and everyone who
// shared a staff with him, rebuilt from the staff lists (X3 staff seasons) and the seat named by career events.
// Rows go to the observer filter before any screen sees them (careerSourcesOf): nothing here is shown as is.
// A run of seasons whose seat no event or job row names is left out rather than guessed.
import { market, positions, staff } from '@gm/career';
import { turnover, type loop } from '@gm/world';
import type { JobHistoryRow, JobRecord, PersonRecord, WorldEvent } from '@gm/schema';
import { tablesOf, type TableSource } from '../../observer/index.ts';

type LiveWorld = loop.LiveWorld;
type ExitReason = JobHistoryRow['exitReason'];

/** Event types that close a run with a known reason (career market, positions and staff modules). */
const EXIT_BY_TYPE: Readonly<Record<string, ExitReason>> = {
  [market.EVENT.fired]: 'fired', [staff.EVENT.fired]: 'fired', [market.EVENT.retired]: 'retired',
  [positions.EVENT.released]: 'position_eliminated', [turnover.LEFT_UNSIGNED]: 'contract_expired',
};
const PROMOTED: string = positions.EVENT.promoted;

interface Run { teamId: number; first: number; last: number }

/** Contiguous seasons on one team's staff, in order (a gap or a team change starts a new run). */
export function staffRuns(world: LiveWorld, personId: number): Run[] {
  const seasons = world.staffSeasons
    .filter((s) => s.headCoachId === personId || s.staffIds.includes(personId))
    .map((s) => ({ year: s.seasonYear, teamId: s.teamId }))
    .sort((a, b) => a.year - b.year || a.teamId - b.teamId);
  const runs: Run[] = [];
  for (const s of seasons) {
    const r = runs[runs.length - 1];
    if (r && r.teamId === s.teamId && s.year <= r.last + 1) r.last = Math.max(r.last, s.year);
    else runs.push({ teamId: s.teamId, first: s.year, last: s.year });
  }
  return runs;
}

const seatOf = (e: WorldEvent): number | null => {
  const v = (e.payload as Record<string, unknown>)['seatId'];
  return typeof v === 'number' ? v : null;
};
const actsIn = (e: WorldEvent, personId: number): boolean => e.actors.some((a) => a.personId === personId) || e.subjects.some((s) => s.kind === 'person' && s.id === personId);

/** Job-history rows of one person, oldest first. `how` per row is kept beside it for the career screen. */
export function jobHistoryOf(world: LiveWorld, personId: number): { row: JobHistoryRow; how: string }[] {
  const events = world.log.forPerson(personId);
  const current = [...world.jobs.values()].find((j) => j.holderPersonId === personId) ?? null;
  const runs = staffRuns(world, personId);
  const out: { row: JobHistoryRow; how: string }[] = [];
  runs.forEach((r, i) => {
    const inRun = events.filter((e) => e.where.teamId === r.teamId && e.when.date.seasonYear >= r.first && e.when.date.seasonYear <= r.last + 1);
    const open = i === runs.length - 1 && current !== null && current.teamId === r.teamId;
    // The seat: the job he holds now for the open run, else the last seat a career event of the run names.
    let job: JobRecord | null = open ? current : null;
    if (!job) {
      for (const e of inRun) { const s = seatOf(e); const j = s === null ? undefined : world.jobs.get(s); if (j && j.teamId === r.teamId && actsIn(e, personId)) job = j; }
    }
    if (!job) return;
    let wins = 0, losses = 0, ties = 0;
    for (const s of world.seasons) {
      if (s.seasonYear < r.first || s.seasonYear > r.last) continue;
      const line = s.records[r.teamId];
      if (line) { wins += line.wins; losses += line.losses; ties += line.ties; }
    }
    let exit: ExitReason = 'current';
    let exitEventId: number | null = null;
    if (!open) {
      const closing = inRun.filter((e) => EXIT_BY_TYPE[e.type] !== undefined).pop();
      const next = runs[i + 1];
      if (closing) { exit = EXIT_BY_TYPE[closing.type]!; exitEventId = closing.id; }
      else if (world.status.get(personId) === 'deceased') exit = 'died';
      else if (next) exit = 'hired_away';
      else exit = 'contract_expired';
    }
    const how = inRun.some((e) => e.type === PROMOTED && seatOf(e) === job!.id) ? 'promoted_within' : i === 0 && r.first === world.setup.firstSeasonYear ? 'on_staff_at_start' : 'hired';
    out.push({
      how,
      row: {
        personId, jobId: job.id, teamId: r.teamId, catalogueId: job.catalogueId,
        started: { seasonYear: r.first, dayIndex: 0 },
        ended: open ? null : { seasonYear: r.last, dayIndex: 0 },
        seasons: r.last - r.first + 1, wins, losses, ties, exitReason: exit, exitEventId,
      },
    });
  });
  return out;
}

/** People who shared a staff season with the coach. */
export function staffMates(world: LiveWorld, personId: number): number[] {
  const ids = new Set<number>();
  for (const s of world.staffSeasons) {
    const all = s.headCoachId === null ? s.staffIds : [s.headCoachId, ...s.staffIds];
    if (all.includes(personId)) for (const id of all) if (id !== personId) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

export interface LiveCareerTables {
  readonly source: TableSource;
  /** `how` per job-history row, keyed `personId:jobId:startSeason` (the row has no field for it). */
  readonly how: ReadonlyMap<string, string>;
}

export const howKey = (personId: number, jobId: number, startSeason: number): string => `${personId}:${jobId}:${startSeason}`;

/** The coach screens' world tables from the running save, for one coach. */
export function liveCareerTables(world: LiveWorld, personId: number): LiveCareerTables {
  const mates = staffMates(world, personId);
  const history: JobHistoryRow[] = [];
  const how = new Map<string, string>();
  for (const id of [personId, ...mates]) {
    for (const h of jobHistoryOf(world, id)) { history.push(h.row); how.set(howKey(id, h.row.jobId, h.row.started.seasonYear), h.how); }
  }
  const jobs = [...world.jobs.values()];
  const keep = new Set<number>([personId, ...mates]);
  for (const j of jobs) if (j.holderPersonId !== null) keep.add(j.holderPersonId);
  const people: PersonRecord[] = [];
  for (const id of [...keep].sort((a, b) => a - b)) { const p = world.people.get(id); if (p) people.push(p); }
  return {
    source: tablesOf({
      competitions: world.competitions, conferences: world.conferences, teams: world.teams, jobs, people,
      jobHistory: history, events: world.log.forPerson(personId),
    }),
    how,
  };
}
