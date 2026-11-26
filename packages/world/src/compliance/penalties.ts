// L8.2.5 "Penalties are applied through the owning systems": the world side of each penalty order. The
// pipeline writes orders into `ComplianceState.orders`; this file carries each one, once, to the state the
// world holds for it. Amounts come only from the order (rule values through `league.compliance`); an order
// with no published amount (`cents`, `games` or `round` null, "league default") is kept on the books with no
// cost, never given an invented figure.
import { compliance, draft } from '@gm/league';
import type { LiveWorld } from '../loop/types.ts';
import { complianceOf } from './binding.ts';

/** `LiveWorld.systemState` key of the applied penalties. */
export const PENALTIES_KEY = 'penalties';

/** A draft pick a club must give up at its next draft that has the round (C7.2.1 rule 5). */
export interface PendingForfeit { readonly caseId: number; readonly teamId: number; readonly round: number }
/** A fine charged to a club or a person (E6 for people, club finances for clubs). `cents` null: no published amount. */
export interface FineEntry {
  readonly caseId: number; readonly party: compliance.PartyKey; readonly cents: number | null;
  readonly mayBeRepaidByClub: boolean; readonly seasonYear: number;
}
/** A suspension in games (E2, E3, E4). `gamesLeft` counts down by the games his club plays. */
export interface Suspension { readonly caseId: number; readonly personId: number; readonly teamId: number | null; readonly gamesLeft: number }
/** An order the world records but no off-screen system acts on yet (probation, show-cause, practice, education, warning, a null amount). */
export interface RecordedOrder { readonly caseId: number; readonly order: compliance.PenaltyOrder; readonly seasonYear: number }

export interface PenaltyState {
  /** Orders of `ComplianceState.orders` already carried over, by index. */
  readonly applied: number;
  readonly forfeits: readonly PendingForfeit[];
  /** Picks taken at a draft: `year-rRound-cClub` ids, for the record. */
  readonly forfeited: readonly string[];
  readonly fines: readonly FineEntry[];
  readonly suspensions: readonly Suspension[];
  readonly recorded: readonly RecordedOrder[];
}

export function emptyPenalties(): PenaltyState {
  return { applied: 0, forfeits: [], forfeited: [], fines: [], suspensions: [], recorded: [] };
}

export function penaltiesOf(world: LiveWorld): PenaltyState {
  return (world.systemState.get(PENALTIES_KEY) as PenaltyState | undefined) ?? emptyPenalties();
}

function setPenalties(world: LiveWorld, s: PenaltyState): void {
  world.systemState.set(PENALTIES_KEY, s);
}

/** The club a person works or plays for now: a job, an off-ladder seat, a roster. Null when none. */
export function teamOfPerson(world: LiveWorld, personId: number): number | null {
  for (const j of [...world.jobs.values()].sort((a, b) => a.id - b.id)) if (j.holderPersonId === personId) return j.teamId;
  for (const s of [...world.offLadder.values()].sort((a, b) => a.seatId - b.seatId)) if (s.holderPersonId === personId) return s.teamId;
  for (const [teamId, ids] of [...world.rosters].sort((a, b) => a[0] - b[0])) if (ids.includes(personId)) return teamId;
  return null;
}

/** True while a person serves a suspension: he may not act in his job (his club's acting holder decides). */
export function isSuspended(world: LiveWorld, personId: number): boolean {
  return penaltiesOf(world).suspensions.some((s) => s.personId === personId && s.gamesLeft > 0);
}

/** Total fines charged to a club, in cents, from orders with a published amount. */
export function finesOf(world: LiveWorld, party: compliance.PartyKey): number {
  return penaltiesOf(world).fines.filter((f) => f.party.kind === party.kind && f.party.id === party.id).reduce((a, f) => a + (f.cents ?? 0), 0);
}

/**
 * The games each club played this week count down its people's suspensions; then every order the pipeline
 * wrote since the last call is carried over. A new suspension starts with the next game. Returns counts for
 * the step digest.
 */
export function applyPenalties(world: LiveWorld): { readonly applied: number; readonly suspended: number; readonly forfeitsPending: number } {
  const before = penaltiesOf(world);
  const played = new Map<number, number>();
  for (const g of world.results) {
    if (g.week !== world.week || g.seasonYear !== world.date.seasonYear) continue;
    for (const t of [g.homeTeamId, g.awayTeamId]) played.set(t, (played.get(t) ?? 0) + 1);
  }
  const suspensions: Suspension[] = before.suspensions
    .map((s) => ({ ...s, gamesLeft: s.teamId === null ? s.gamesLeft : Math.max(0, s.gamesLeft - (played.get(s.teamId) ?? 0)) }))
    .filter((s) => s.gamesLeft > 0);
  const forfeits = [...before.forfeits];
  const fines = [...before.fines];
  const recorded = [...before.recorded];
  const orders = complianceOf(world).orders;
  const season = world.date.seasonYear;
  for (const { caseId, order } of orders.slice(before.applied)) {
    switch (order.kind) {
      case 'pick_forfeit':
        if (order.round === null) recorded.push({ caseId, order, seasonYear: season });
        else forfeits.push({ caseId, teamId: order.teamId, round: order.round });
        break;
      case 'fine':
        fines.push({ caseId, party: order.party, cents: order.cents, mayBeRepaidByClub: order.mayBeRepaidByClub, seasonYear: season });
        break;
      case 'suspension':
        if (order.games === null) recorded.push({ caseId, order, seasonYear: season });
        else suspensions.push({ caseId, personId: order.personId, teamId: teamOfPerson(world, order.personId), gamesLeft: order.games });
        break;
      default:
        recorded.push({ caseId, order, seasonYear: season });
    }
  }
  setPenalties(world, { ...before, applied: orders.length, forfeits, fines, suspensions, recorded });
  return { applied: orders.length - before.applied, suspended: suspensions.length, forfeitsPending: forfeits.length };
}

/**
 * C7.2.1 rule 5 at the draft: each pending forfeit takes the club's own pick of its round in this ledger's
 * draft. A club without that pick (none held this year) keeps the forfeit for its next draft that has it.
 */
export function applyForfeits(world: LiveWorld, ledger: draft.PickLedger): draft.PickLedger {
  const s = penaltiesOf(world);
  if (s.forfeits.length === 0) return ledger;
  let l = ledger;
  const left: PendingForfeit[] = [];
  const taken: string[] = [];
  for (const f of s.forfeits) {
    const id = draft.regularPickId(l.currentYear, f.round, f.teamId);
    const r = draft.forfeitPick(l, id, `league discipline, case ${f.caseId}`);
    if (r.ok) { l = r.ledger; taken.push(id); } else left.push(f);
  }
  setPenalties(world, { ...s, forfeits: left, forfeited: [...s.forfeited, ...taken] });
  return l;
}
