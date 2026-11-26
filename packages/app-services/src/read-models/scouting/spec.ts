// Read-model specs (P1.3.2) of the scouting screens: `scoutingTable` for football.self_scout and
// week.scouting_report (O3.6.1), `scoutingPersonnel` for the opponent personnel report (H2.3.1) and the
// staff's eye on the user's own players. Both build only for a club the observer reads inside (a job,
// roster spot or executive seat there); anyone else gets null.
//
// Charted plays are not a world table yet (CR-G66-4), so the host passes them in through
// `ScoutingSources`, as the gameplan and roster moves screens do with their inputs.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { seesTeam } from '../analytics/index.ts';
import { buildPersonnelReport, type EstimateStore } from './personnel.ts';
import { DEFAULT_QUERY, WINDOW_IDS, buildTendencyView, type TendencyInput, type WindowId } from './tendencies.ts';
import type { PersonnelReportView, PersonnelUsage, ScoutingSubject, ScoutingView } from './types.ts';

export const SCOUTING_MODELS = { table: 'scoutingTable', personnel: 'scoutingPersonnel' } as const;
/** S3 task ids for the permission badge (O7.1.1). Named here until G-55 publishes the duty list. */
export const SCOUTING_TASKS: readonly string[] = ['scouting.self_scout', 'scouting.opponent_report'];

/** What the host knows for one club about one team, beyond the world tables. */
export type TendencyFeed = Omit<TendencyInput, 'subject' | 'teamId' | 'teamName' | 'window' | 'cuts' | 'measure'>;

export interface ScoutingSources {
  /** Rows of the shared store for `teamId` as `clubId` holds them (its own call log, or its staff's charting). Null when none. */
  readonly tendencies: (clubId: number, teamId: number) => TendencyFeed | null;
  /** The club's estimate store (`ScoutingDesk.estimates`), used when the world has no PersonView row. */
  readonly estimates?: EstimateStore;
  readonly usage?: (clubId: number, teamId: number, personId: number) => PersonnelUsage | null;
}

/** Flat parameters (the read-model key holds primitives only). `cuts` is comma-joined. */
export type ScoutingTableParams = {
  readonly clubId: number;
  readonly subject: string;
  /** The opponent's team id; ignored for self-scout. */
  readonly teamId?: number | null;
  readonly window?: string | null;
  readonly side?: string | null;
  readonly cuts?: string | null;
  readonly measure?: string | null;
};

export type ScoutingPersonnelParams = { readonly clubId: number; readonly teamId: number; readonly scaleId?: string | null };

const isWindow = (w: unknown): w is WindowId => typeof w === 'string' && (WINDOW_IDS as readonly string[]).includes(w);

function teamName(rows: readonly Record<string, unknown>[], teamId: number): string {
  const t = rows.find((r) => r.id === teamId);
  const i = t?.identity as { name?: string; nickname?: string } | undefined;
  return [i?.name, i?.nickname].filter(Boolean).join(' ') || `Team ${teamId}`;
}

export function scoutingTableSpec(data: Schema, sources: ScoutingSources): ReadModelSpec<ScoutingTableParams, ScoutingView | null> {
  return {
    name: SCOUTING_MODELS.table,
    data,
    taskIds: SCOUTING_TASKS,
    build: (world, p) => {
      const subject: ScoutingSubject | null = p.subject === 'self' ? 'self' : p.subject === 'opponent' ? 'opponent' : null;
      if (!subject || !seesTeam(world, p.clubId)) return { data: null };
      const teamId = subject === 'self' ? p.clubId : p.teamId;
      if (typeof teamId !== 'number' || (subject === 'opponent' && teamId === p.clubId)) return { data: null };
      const feed = sources.tendencies(p.clubId, teamId);
      if (!feed) return { data: null };
      const side = p.side === 'defense' ? 'defense' : 'offense';
      const def = DEFAULT_QUERY[side];
      const cuts = p.cuts ? p.cuts.split(',').map((c) => c.trim()).filter(Boolean) : def.cuts;
      return {
        data: buildTendencyView({
          ...feed, subject, teamId, teamName: teamName(world.table('teams') as readonly Record<string, unknown>[], teamId),
          window: isWindow(p.window) ? p.window : subject === 'self' ? 'last3' : 'relevance',
          cuts, measure: p.measure || def.measure,
        }),
      };
    },
  };
}

export function scoutingPersonnelSpec(data: Schema, sources: Pick<ScoutingSources, 'estimates' | 'usage'> = {}): ReadModelSpec<ScoutingPersonnelParams, PersonnelReportView | null> {
  return {
    name: SCOUTING_MODELS.personnel,
    data,
    taskIds: SCOUTING_TASKS,
    build: (world, p) => {
      if (!seesTeam(world, p.clubId)) return { data: null };
      const usage = sources.usage;
      return {
        data: buildPersonnelReport(world, {
          subject: p.teamId === p.clubId ? 'self' : 'opponent', clubId: p.clubId, teamId: p.teamId,
          ...(p.scaleId ? { scaleId: p.scaleId } : {}),
          ...(sources.estimates ? { estimates: sources.estimates } : {}),
          ...(usage ? { usage: (id: number) => usage(p.clubId, p.teamId, id) } : {}),
        }),
      };
    },
  };
}
