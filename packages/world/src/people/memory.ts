// Step 6, memory (X6), bound to the live world. Each week the step reads the log rows written since its
// last pass and gives each witness a short row through `people.memory` (insert, stack, slot limits). At the
// first pass of a season it runs the X6.2.1 season-end promotion for every holder, prunes faded rows, and
// keeps only permanent rows for people who are no longer active (X12.1.3 rule 1, X6.5.1 edge case).
import { awards, history } from '@gm/league';
import { memory } from '@gm/people';
import type { WorldEvent, WorldTier } from '@gm/schema';
import type { LiveWorld, StepHandler } from '../loop/types.ts';
import { KEY, SEASON_TOGETHER, eventsFrom, seats, stateOf } from './shared.ts';
import { hasAnyTie, edgesOf } from './edges.ts';

export interface MemoryState {
  /** First log id not yet read. */
  cursor: number;
  /** Holder id to his rows, both layers. */
  readonly rows: Map<number, memory.HeldMemory[]>;
  /** Season whose season-end promotion has run. */
  promotedFor: number | null;
}

export function memoryOf(world: LiveWorld): MemoryState {
  return stateOf<MemoryState>(world, KEY.memory, () => ({ cursor: 1, rows: new Map(), promotedFor: null }));
}

/**
 * Event types that form no row: the loop's own bookkeeping, the season basis of X7 ties (a season together
 * is contact, not a memory), the X5 rows a person writes about himself, and a death (the dead hold nothing;
 * others' rows about him stop re-triggering, X12.1.3 rule 6).
 */
export const NO_MEMORY_TYPES: ReadonlySet<string> = new Set([
  SEASON_TOGETHER, 'world_founded', 'history_run_ended', 'went_inactive', 'returned_active', 'cohort_entered', 'died',
  'stress_band_changed', 'coping_started', 'coping_stopped', 'career_stage_changed',
]);

/**
 * X6.1.1 rule 3 role table for the world's event types: the sign of a row from the holder's side, by
 * event type and stake. Content, Assumption (no event type file carries a role table yet). Missing is 0.
 */
export const SIGNS: Readonly<Record<string, { readonly subject?: -1 | 0 | 1; readonly room?: -1 | 0 | 1 }>> = {
  player_signed: { subject: 1 }, player_drafted: { subject: 1 }, released: { subject: -1 }, left_unsigned: { subject: -1 },
  player_retired: { subject: 0 }, eligibility_ended: { subject: 0 }, title_won: { room: 1 }, team_folded: { room: -1 },
  hall_elected: { subject: 1 }, hall_passed_over: { subject: -1 }, trade_requested: { room: -1 }, resigned: { room: -1 },
};

/** Memory kind table (X6.1.3 rule 1). No event type file carries a `memory` block yet: the leaf defaults apply. */
export const KINDS: memory.KindTable = {};

/** The team whose room witnessed an event: a team or room witness rule, else a team event of the honours or world family. */
function roomTeam(e: WorldEvent, family: string): number | null {
  if (e.witnesses.kind === 'team' || e.witnesses.kind === 'room') return e.witnesses.teamId;
  if ((family === 'honors' || family === 'world') && e.where.teamId !== null) return e.where.teamId;
  return null;
}

function teamOfPayload(e: WorldEvent): number | null {
  if (e.where.teamId !== null) return e.where.teamId;
  const t = e.payload.team;
  return typeof t === 'number' ? t : null;
}

export function memoryStep(): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const state = memoryOf(world);
    const now = world.date;
    const reg = world.logOptions.registry;
    const events = eventsFrom(world, state.cursor);
    state.cursor = world.log.nextId;
    let inserted = 0, promoted = 0, considered = 0;

    // Who is in which team's room, built once for the week and only when an event needs it.
    let rooms: Map<number, number[]> | null = null;
    const roomOf = (teamId: number): readonly number[] => {
      if (!rooms) {
        rooms = new Map();
        for (const [id, seat] of seats(world)) { const l = rooms.get(seat.teamId); if (l) l.push(id); else rooms.set(seat.teamId, [id]); }
      }
      return rooms.get(teamId) ?? [];
    };

    const give = (holderId: number, e: WorldEvent, family: string, notability: number, stake: memory.Stake, role: string, aboutPersonId: number | null) => {
      if (world.status.get(holderId) !== 'active' || holderId === world.userPersonId) return;
      const p = world.people.get(holderId);
      if (!p) return;
      considered++;
      const sign = (stake === 'subject' ? SIGNS[e.type]?.subject : SIGNS[e.type]?.room) ?? 0;
      const ev: memory.MemoryEventInput = {
        id: e.id, type: e.type, family, date: e.when.date, notability, aboutPersonId, aboutTeamId: teamOfPayload(e),
        importedAllowed: reg.get(e.type)?.importedAllowed ?? false, involvesTier1: false,
      };
      // MA-66 (A3.1.1 row 20): every system runs the same at every tier, tiers differ only in what is
      // recorded; short memory is state, so every holder forms rows as at tier 1 (X6.5.1 amendment owed).
      const tier: WorldTier = 1;
      const row = memory.createMemoryRow(ev, { id: holderId, origin: p.origin, tier }, { stake, role, sign, witnessed: true, newsDelivered: false }, KINDS);
      if (!row) return;
      const held = state.rows.get(holderId) ?? [];
      const r = memory.insertShort(held, row, KINDS, now);
      if (r.inserted) inserted++;
      state.rows.set(holderId, r.rows as memory.HeldMemory[]);
    };

    for (const e of events) {
      if (NO_MEMORY_TYPES.has(e.type)) continue;
      const def = reg.get(e.type);
      if (!def) continue;
      const notability = e.notability ?? awards.baseFor(e.type, def.family, null);
      const subjects = history.personIdsOf(e);
      const subjectSet = new Set(subjects);
      for (const id of subjects) {
        const other = subjects.find((x) => x !== id) ?? null;
        const role = e.actors.find((a) => a.personId === id)?.role ?? 'subject';
        give(id, e, def.family, notability, 'subject', role, other);
      }
      const team = roomTeam(e, def.family);
      if (team !== null) {
        const about = subjects[0] ?? null;
        for (const id of roomOf(team)) if (!subjectSet.has(id)) give(id, e, def.family, notability, 'room', 'room', about);
      }
    }

    // Season end (X6.2.1), run at the season's first pass: the previous season's rows are complete.
    if (world.week === 0 && state.promotedFor !== world.date.seasonYear - 1) {
      state.promotedFor = world.date.seasonYear - 1;
      const ties = edgesOf(world).ties;
      for (const holderId of [...state.rows.keys()].sort((a, b) => a - b)) {
        const rows = state.rows.get(holderId)!;
        const partners = new Set<number>();
        for (const r of rows) if (r.aboutPersonId !== null && hasAnyTie(ties, holderId, r.aboutPersonId)) partners.add(r.aboutPersonId);
        const res = memory.promoteAtSeasonEnd(rows, KINDS, now, { edgePersonIds: partners });
        promoted += res.promoted.length;
        const status = world.status.get(holderId);
        // X12.1.3 rule 1 and X6.5.1 edge case: an inactive person keeps his permanent rows only. The dead
        // hold nothing (rule 6 keeps the memories others hold of him, not his own).
        const kept = status === 'active' ? memory.pruneShort(res.rows, KINDS, now)
          : status === 'inactive' ? res.rows.filter((r) => r.layer === 'permanent') : [];
        if (kept.length === 0) state.rows.delete(holderId); else state.rows.set(holderId, kept as memory.HeldMemory[]);
      }
    }

    let rows = 0, permanent = 0;
    for (const list of state.rows.values()) { rows += list.length; for (const r of list) if (r.layer === 'permanent') permanent++; }
    return { events: events.length, considered, inserted, promoted, holders: state.rows.size, rows, permanent };
  };
}
