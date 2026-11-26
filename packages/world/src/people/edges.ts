// Step 7, edges (X7), bound to the live world. At the first pass of a season the step closes the season
// before: one `season_together` event per team names everyone on its roster and staff (the basis every tie
// it forms cites, X7.1.1 acceptance), then `people.relationships` forms or grows the ties that season
// made (X7.1.1 rules 1 and 2). Ties live in the world's plain state; decay is applied when a tie is touched
// (X7.2.2 rule 2), so a tie to a person who has left or died stays where it was last settled.
import { awards } from '@gm/league';
import { relationships } from '@gm/people';
import type { JobRecord, WorldDate } from '@gm/schema';
import type { LiveWorld, StepHandler } from '../loop/types.ts';
import { param } from './params.ts';
import { KEY, SEASON_TOGETHER, bossOf, groupOfPosition, sideOfGroup, pairContext, stateOf, taughtGroup } from './shared.ts';

export interface EdgesState {
  /** Every tie by `relationships.tieKey`, both sides in one row (X7.1.1). */
  readonly ties: Map<string, relationships.Tie>;
  /** Season whose shared seasons have formed ties. */
  formedFor: number | null;
}

export function edgesOf(world: LiveWorld): EdgesState {
  return stateOf<EdgesState>(world, KEY.edges, () => ({ ties: new Map(), formedFor: null }));
}

/** True when the two people share a tie of a kind that forms off-screen, in either direction. */
export function hasAnyTie(ties: ReadonlyMap<string, relationships.Tie>, x: number, y: number): boolean {
  const lo = Math.min(x, y), hi = Math.max(x, y);
  const k = (kind: relationships.EdgeKind, a: number, b: number) => relationships.tieKey({ kind, a, b, bTeamId: null, promiseId: null });
  return ties.has(k('teammate', lo, hi)) || ties.has(k('worked_with', lo, hi))
    || ties.has(k('worked_under', x, y)) || ties.has(k('worked_under', y, x)) || ties.has(k('coached', x, y)) || ties.has(k('coached', y, x));
}

/** Starters of a season as the needs step recorded them, if it has (for the X7.1.1 starters-on-one-side rule). */
export type StartersOf = (world: LiveWorld, seasonYear: number) => ReadonlySet<number> | null;

/** Weeks counted for a member present at the season point (X7.1.1 edge case: short stays are not recorded off-screen). */
const WHOLE_SEASON_WEEKS = 52;

export interface EdgesOptions {
  /** The season's starters (needs step), or null when not known. */
  readonly startersOf?: StartersOf;
}

export function edgesStep(opts: EdgesOptions = {}): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const state = edgesOf(world);
    const season = world.date.seasonYear - 1;
    if (world.week !== 0 || state.formedFor === season) return { ties: state.ties.size, formed: 0, grown: 0, seasons: 0 };
    state.formedFor = season;
    const store = new relationships.TieStore(state.ties);
    const pctx = pairContext(world);
    const starters = opts.startersOf?.(world, season) ?? null;
    const before = state.ties.size;
    let touched = 0, seasons = 0;
    const strength = awards.baseFor(SEASON_TOGETHER, 'roster', null) * param('edges.seasonStake');
    const togetherFrom: WorldDate = { seasonYear: season, dayIndex: 0 };

    const jobsByTeam = new Map<number, JobRecord[]>();
    for (const j of [...world.jobs.values()].sort((a, b) => a.id - b.id)) {
      if (j.holderPersonId === null) continue;
      const l = jobsByTeam.get(j.teamId); if (l) l.push(j); else jobsByTeam.set(j.teamId, [j]);
    }

    for (const ss of world.staffSeasons.filter((s) => s.seasonYear === season).sort((a, b) => a.teamId - b.teamId)) {
      const onStaff = new Set<number>([...ss.staffIds, ...(ss.headCoachId === null ? [] : [ss.headCoachId])]);
      const staff = (jobsByTeam.get(ss.teamId) ?? []).filter((j) => onStaff.has(j.holderPersonId!) && world.people.has(j.holderPersonId!));
      const staffIds = new Set(staff.map((j) => j.holderPersonId!));
      const players = (world.rosterSeasons.get(`${season}:${ss.teamId}`) ?? []).filter((id) => world.people.has(id) && !staffIds.has(id));
      if (staff.length + players.length < 2) continue;
      const ev = ctx.emit({
        type: SEASON_TOGETHER, date: world.date, teamId: ss.teamId, subjects: [{ kind: 'team', id: ss.teamId }],
        actors: [...players.map((personId) => ({ personId, role: 'player' })), ...staff.map((j) => ({ personId: j.holderPersonId!, role: 'staff' }))],
        witnesses: { kind: 'team', teamId: ss.teamId }, payload: { season }, tier: ctx.tierOfTeam(ss.teamId),
      });
      seasons++;
      const forming: relationships.FormingEvent = { eventId: ev.id, date: world.date, memoryStrength: strength, togetherFrom };

      // Staff (X7.1.1 rule 1): worked_under to the direct boss; worked_with inside one room (side and
      // position group) and among the head coach's direct reports. Bounded like the roster rule (README PD-04).
      const boss = new Map<number, number | null>();
      for (const j of staff) { const b = bossOf(world, j); boss.set(j.holderPersonId!, b !== null && staffIds.has(b) ? b : null); }
      for (const j of staff) {
        const me = j.holderPersonId!, b = boss.get(me)!;
        if (b !== null && b !== me) { relationships.formOrGrow(store, pctx, 'worked_under', me, b, forming); touched++; }
      }
      const groups = new Map<string, number[]>();
      const add = (k: string, id: number) => { const l = groups.get(k); if (l) l.push(id); else groups.set(k, [id]); };
      for (const j of staff) {
        add(`room:${j.side}:${j.positionGroup}`, j.holderPersonId!);
        if (ss.headCoachId !== null && boss.get(j.holderPersonId!) === ss.headCoachId) add('senior', j.holderPersonId!);
      }
      const paired = new Set<string>();
      for (const k of [...groups.keys()].sort()) {
        const ids = [...new Set(groups.get(k)!)].sort((a, b) => a - b);
        for (let i = 0; i < ids.length; i++) {
          for (let m = i + 1; m < ids.length; m++) {
            const x = ids[i]!, y = ids[m]!;
            if (boss.get(x) === y || boss.get(y) === x || paired.has(`${x}:${y}`)) continue;
            paired.add(`${x}:${y}`);
            relationships.formOrGrow(store, pctx, 'worked_with', x, y, forming); touched++;
          }
        }
      }

      // Roster (X7.1.1 rule 1): teammates within a position group or among starters on one side.
      const members: relationships.RosterSeasonMember[] = players.map((id) => {
        const group = groupOfPosition(world.people.get(id)?.playing?.position);
        return { personId: id, group, starterSide: starters?.has(id) ? sideOfGroup(group) : null, weeks: WHOLE_SEASON_WEEKS };
      });
      touched += relationships.rosterSeason(store, pctx, members, forming).length;

      // Coached (X7.1.1 rule 2): a season in a position coach's group.
      for (const j of staff) {
        const g = taughtGroup(j);
        if (g === null) continue;
        const inGroup = members.filter((m) => m.group === g).map((m) => ({ personId: m.personId, weeks: WHOLE_SEASON_WEEKS }));
        touched += relationships.coachedSeason(store, pctx, j.holderPersonId!, inGroup, forming).length;
      }
    }
    return { ties: state.ties.size, formed: state.ties.size - before, grown: touched - (state.ties.size - before), seasons };
  };
}
