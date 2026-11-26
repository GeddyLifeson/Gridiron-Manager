// The pick ledger (C7.2.1): every pick in this draft and future drafts to the horizon, each with exactly one owner.
// Trades (C7.2.3), conditional picks, league discipline forfeits (C7.2.1 rule 5) and compensatory awards
// (C7.2.2) all go through here. Pure functions over a plain record.
import type { RuleSet } from '@gm/schema';
import { FIRST_ROUND, KEY, param } from './params.ts';
import { refuse, type ClubId, type ConditionalTransfer, type DraftRefusal, type LedgerEvent, type Pick, type PickId, type PickKind, type PickLedger } from './types.ts';

export const regularPickId = (year: number, round: number, clubId: ClubId): PickId => `${year}-r${round}-c${clubId}`;

function regularPicks(year: number, clubIds: readonly ClubId[], rules: RuleSet): Pick[] {
  const out: Pick[] = [];
  for (let round = FIRST_ROUND; round <= rules.num(KEY.rounds); round++) {
    for (const c of clubIds) {
      out.push({ id: regularPickId(year, round, c), year, round, originalClubId: c, ownerClubId: c, kind: 'regular', status: 'open', lockedBy: null, compValue: 0 });
    }
  }
  return out;
}

/** A new ledger: one pick per club per round (C7.2.1 rule 1) for the current draft and `draftsAhead` more. */
export function createLedger(currentYear: number, clubIds: readonly ClubId[], rules: RuleSet, draftsAhead: number = param('league.draft.ledgerDraftsAhead')): PickLedger {
  const lastYear = currentYear + draftsAhead;
  const picks: Pick[] = [];
  const history: LedgerEvent[] = [];
  for (let y = currentYear; y <= lastYear; y++) {
    picks.push(...regularPicks(y, clubIds, rules));
    history.push({ kind: 'created', year: y });
  }
  return { currentYear, clubIds: [...clubIds], lastYear, picks, conditions: [], history };
}

/** After a draft: the next draft becomes current and the horizon moves one year out. */
export function rollLedger(l: PickLedger, rules: RuleSet): PickLedger {
  const year = l.lastYear + FIRST_ROUND;
  return {
    ...l, currentYear: l.currentYear + FIRST_ROUND, lastYear: year,
    picks: [...l.picks, ...regularPicks(year, l.clubIds, rules)],
    history: [...l.history, { kind: 'created', year }],
  };
}

export const pickById = (l: PickLedger, id: PickId): Pick | undefined => l.picks.find((p) => p.id === id);

/** A club's open picks in one draft (the club page lists this draft and the next two, C7.2.1). */
export function picksOf(l: PickLedger, clubId: ClubId, year: number): Pick[] {
  return l.picks.filter((p) => p.ownerClubId === clubId && p.year === year && p.status === 'open');
}

const replace = (picks: readonly Pick[], changed: ReadonlyMap<PickId, Pick>): Pick[] => picks.map((p) => changed.get(p.id) ?? p);

/** Why a pick cannot move from `fromClubId` now, or null. */
export function tradeBlock(l: PickLedger, id: PickId, fromClubId: ClubId): DraftRefusal | null {
  const p = pickById(l, id);
  if (!p) return refuse('C7.2.3', `no pick ${id}`, 'trade a pick in the ledger');
  if (p.ownerClubId !== fromClubId) return refuse('C7.2.3', `pick ${id} belongs to club ${p.ownerClubId}`, 'a pick already traded cannot be traded again by its old owner');
  if (p.status !== 'open') return refuse('C7.2.3', `pick ${id} is ${p.status}`, 'trade an open pick');
  if (p.lockedBy) return refuse('C7.2.3', `pick ${id} is held by conditional trade ${p.lockedBy}`, 'wait for the condition to resolve');
  if (p.year < l.currentYear || p.year > l.lastYear) return refuse('C7.2.3', `pick ${id} is outside the ledger horizon`, 'trade picks from the current draft to the horizon');
  return null;
}

export interface ConditionalSpec { readonly id: string; readonly fromClubId: ClubId; readonly ifMet: PickId; readonly ifNotMet: PickId; readonly condition: string }

/** A pick trade between two clubs. Player parts of a trade belong to C8.4 (G-35) and are filed with it. */
export interface PickTrade {
  readonly id: string;
  readonly clubs: readonly [ClubId, ClubId];
  /** Picks the first club gives. */
  readonly firstGives: readonly PickId[];
  readonly secondGives: readonly PickId[];
  readonly conditionals?: readonly ConditionalSpec[];
}

/** Apply a pick trade atomically (C7.2.3 rule 1): every pick moves or none does. */
export function tradePicks(l: PickLedger, t: PickTrade): { ok: true; ledger: PickLedger } | DraftRefusal {
  const [a, b] = t.clubs;
  if (a === b) return refuse('C7.2.3', 'a club cannot trade with itself', 'name two clubs');
  const all = [...t.firstGives, ...t.secondGives];
  if (new Set(all).size !== all.length) return refuse('C7.2.3', 'a pick is listed twice', 'list each pick once');
  for (const id of t.firstGives) { const r = tradeBlock(l, id, a); if (r) return r; }
  for (const id of t.secondGives) { const r = tradeBlock(l, id, b); if (r) return r; }
  const changed = new Map<PickId, Pick>();
  const history: LedgerEvent[] = [];
  const move = (id: PickId, from: ClubId, to: ClubId) => {
    changed.set(id, { ...pickById(l, id)!, ownerClubId: to });
    history.push({ kind: 'traded', tradeId: t.id, pickId: id, fromClubId: from, toClubId: to });
  };
  t.firstGives.forEach((id) => move(id, a, b));
  t.secondGives.forEach((id) => move(id, b, a));
  const conditions: ConditionalTransfer[] = [];
  for (const c of t.conditionals ?? []) {
    if (c.fromClubId !== a && c.fromClubId !== b) return refuse('C7.2.3', `conditional ${c.id} names a club outside the trade`, 'the giver must be one of the two clubs');
    if (c.ifMet === c.ifNotMet) return refuse('C7.2.3', `conditional ${c.id} names one pick twice`, 'name two different picks');
    if (l.conditions.some((x) => x.id === c.id)) return refuse('C7.2.3', `conditional ${c.id} already exists`, 'use a new id');
    for (const id of [c.ifMet, c.ifNotMet]) {
      if (all.includes(id) || changed.has(id)) return refuse('C7.2.3', `pick ${id} is both traded and conditional`, 'list it once');
      const r = tradeBlock(l, id, c.fromClubId); if (r) return r;
      changed.set(id, { ...pickById(l, id)!, lockedBy: c.id });
    }
    conditions.push({ id: c.id, fromClubId: c.fromClubId, toClubId: c.fromClubId === a ? b : a, ifMet: c.ifMet, ifNotMet: c.ifNotMet, condition: c.condition, status: 'pending' });
    history.push({ kind: 'conditional', conditionId: c.id });
  }
  return { ok: true, ledger: { ...l, picks: replace(l.picks, changed), conditions: [...l.conditions, ...conditions], history: [...l.history, ...history] } };
}

/** Resolve a conditional pick at season end: the chosen pick moves, the other is released back to its owner. */
export function resolveCondition(l: PickLedger, conditionId: string, met: boolean): { ok: true; ledger: PickLedger } | DraftRefusal {
  const c = l.conditions.find((x) => x.id === conditionId);
  if (!c) return refuse('C7.2.3', `no conditional ${conditionId}`, 'resolve a pending conditional');
  if (c.status !== 'pending') return refuse('C7.2.3', `conditional ${conditionId} is already resolved`, 'resolve it once');
  const moving = met ? c.ifMet : c.ifNotMet;
  const staying = met ? c.ifNotMet : c.ifMet;
  const changed = new Map<PickId, Pick>([
    [moving, { ...pickById(l, moving)!, ownerClubId: c.toClubId, lockedBy: null }],
    [staying, { ...pickById(l, staying)!, lockedBy: null }],
  ]);
  return {
    ok: true,
    ledger: {
      ...l, picks: replace(l.picks, changed),
      conditions: l.conditions.map((x) => (x.id === conditionId ? { ...x, status: met ? 'met' : 'not_met' } : x)),
      history: [...l.history, { kind: 'condition_resolved', conditionId, met, pickId: moving }],
    },
  };
}

/** League discipline removes a pick (C7.2.1 rule 5; C1.5.2): its round is one pick shorter. */
export function forfeitPick(l: PickLedger, id: PickId, reason: string): { ok: true; ledger: PickLedger } | DraftRefusal {
  const p = pickById(l, id);
  if (!p) return refuse('C7.2.1', `no pick ${id}`, 'forfeit a pick in the ledger');
  if (p.status !== 'open') return refuse('C7.2.1', `pick ${id} is ${p.status}`, 'forfeit an open pick');
  return { ok: true, ledger: { ...l, picks: replace(l.picks, new Map([[id, { ...p, status: 'forfeited', lockedBy: null }]])), history: [...l.history, { kind: 'forfeited', pickId: id, reason }] } };
}

/** Add awarded picks (compensatory, equal-count, supplemental) for the current draft. */
export function addAwardedPicks(l: PickLedger, awards: readonly { id: PickId; round: number; clubId: ClubId; kind: Exclude<PickKind, 'regular'>; compValue: number }[]): PickLedger {
  const picks: Pick[] = awards.map((a) => ({ id: a.id, year: l.currentYear, round: a.round, originalClubId: a.clubId, ownerClubId: a.clubId, kind: a.kind, status: 'open', lockedBy: null, compValue: a.compValue }));
  return { ...l, picks: [...l.picks, ...picks], history: [...l.history, ...picks.map((p) => ({ kind: 'awarded' as const, pickId: p.id }))] };
}

/** Mark a pick used by a selection. */
export function usePick(l: PickLedger, id: PickId, personId: number): PickLedger {
  const p = pickById(l, id);
  if (!p) throw new Error(`league.draft: no pick ${id}`);
  return { ...l, picks: replace(l.picks, new Map([[id, { ...p, status: 'used' }]])), history: [...l.history, { kind: 'used', pickId: id, personId }] };
}

/** Ledger invariants (C7.2.1 acceptance: every pick has exactly one owner at all times). Empty when sound. */
export function ledgerProblems(l: PickLedger): string[] {
  const out: string[] = [];
  const ids = new Set<PickId>();
  const clubs = new Set(l.clubIds);
  for (const p of l.picks) {
    if (ids.has(p.id)) out.push(`duplicate pick ${p.id}`);
    ids.add(p.id);
    if (!clubs.has(p.ownerClubId)) out.push(`pick ${p.id} owned by unknown club ${p.ownerClubId}`);
    if (p.lockedBy && !l.conditions.some((c) => c.id === p.lockedBy && c.status === 'pending')) out.push(`pick ${p.id} locked by missing condition ${p.lockedBy}`);
  }
  for (const c of l.conditions) {
    if (c.status !== 'pending') continue;
    for (const id of [c.ifMet, c.ifNotMet]) {
      const p = pickById(l, id);
      if (!p || p.lockedBy !== c.id || p.ownerClubId !== c.fromClubId) out.push(`conditional ${c.id} does not hold pick ${id}`);
    }
  }
  return out;
}
