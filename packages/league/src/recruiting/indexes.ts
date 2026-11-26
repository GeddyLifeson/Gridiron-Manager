// Look-up tables over a `RecruitingState`, so a week costs time in proportion to what happens in it and
// not to the size of the state. They are derived data: never saved, never read by a rule, rebuilt on demand
// from the state alone, and they change no result (the same offer, edge or prospect is found, only faster).
//
// Writers they rely on: `makeOffer` appends to `state.offers`; `bumpEdge` is the only writer of
// `state.edges`; `tieOf` is the only writer of `state.ties`; `addProspect` and `dropClass` are the only
// writers of `state.prospects`. A caller that
// replaces one of those containers (a loaded save, `dropClass`) gets a fresh table, because each table
// remembers the container it was built from.
import type { Edge, Offer, PositionGroup, Prospect, RecruitingState, SchoolTie } from './types.ts';

interface OfferIndex { arr: Offer[]; seen: number; byProspect: Map<number, Offer[]>; byTeam: Map<number, Offer[]> }
interface EdgeIndex { obj: RecruitingState['edges']; from: Map<number, Map<number, Edge>>; version: Map<number, number>; epoch: number }
interface ClassIndex { obj: RecruitingState['prospects']; byClass: Map<number, Prospect[]> }

const OFFERS = new WeakMap<RecruitingState, OfferIndex>();
const EDGES = new WeakMap<RecruitingState, EdgeIndex>();
const CLASSES = new WeakMap<RecruitingState, ClassIndex>();

function offerIndex(state: RecruitingState): OfferIndex {
  let ix = OFFERS.get(state);
  if (!ix || ix.arr !== state.offers || ix.seen > state.offers.length) {
    ix = { arr: state.offers, seen: 0, byProspect: new Map(), byTeam: new Map() };
    OFFERS.set(state, ix);
  }
  for (; ix.seen < state.offers.length; ix.seen++) {
    const o = state.offers[ix.seen]!;
    let a = ix.byProspect.get(o.prospectId);
    if (!a) { a = []; ix.byProspect.set(o.prospectId, a); }
    a.push(o);
    let b = ix.byTeam.get(o.teamId);
    if (!b) { b = []; ix.byTeam.set(o.teamId, b); }
    b.push(o);
  }
  return ix;
}

const NO_OFFERS: readonly Offer[] = [];

/** Every offer ever made to a prospect, withdrawn ones included, in the order made. */
export function offersToProspect(state: RecruitingState, prospectId: number): readonly Offer[] {
  return offerIndex(state).byProspect.get(prospectId) ?? NO_OFFERS;
}

/** Every offer a school ever made, withdrawn ones included, in the order made. */
export function offersByTeam(state: RecruitingState, teamId: number): readonly Offer[] {
  return offerIndex(state).byTeam.get(teamId) ?? NO_OFFERS;
}

function edgeIndex(state: RecruitingState): EdgeIndex {
  let ix = EDGES.get(state);
  if (!ix || ix.obj !== state.edges) {
    ix = { obj: state.edges, from: new Map(), version: new Map(), epoch: (ix?.epoch ?? 0) + 1 };
    for (const k in state.edges) putEdge(ix, state.edges[k]!);
    EDGES.set(state, ix);
  }
  return ix;
}

function putEdge(ix: EdgeIndex, e: Edge): void {
  let row = ix.from.get(e.fromId);
  if (!row) { row = new Map(); ix.from.set(e.fromId, row); }
  row.set(e.toId, e);
}

export function findEdge(state: RecruitingState, fromId: number, toId: number): Edge | undefined {
  return edgeIndex(state).from.get(fromId)?.get(toId);
}

/** Every edge that starts at one person, by the person it reaches. */
export function edgesFrom(state: RecruitingState, fromId: number): ReadonlyMap<number, Edge> | undefined {
  return edgeIndex(state).from.get(fromId);
}

/**
 * A stamp that moves whenever an edge starting at this person may have changed: `bumpEdge` calls
 * `edgesTouched` for him, and `edgesDecayed` moves every stamp at once. Equal stamps mean equal edges.
 */
export function edgeStamp(state: RecruitingState, fromId: number): number {
  const ix = edgeIndex(state);
  return ix.epoch * STAMP_STEP + (ix.version.get(fromId) ?? 0);
}
/** Room for the per-person count under each epoch. A person's edges change far fewer times than this in one epoch. */
const STAMP_STEP = Number.MAX_SAFE_INTEGER >>> 0;

export function edgesTouched(state: RecruitingState, fromId: number): void {
  const ix = edgeIndex(state);
  ix.version.set(fromId, (ix.version.get(fromId) ?? 0) + 1);
}

/** Every edge changed at once (the weekly decay). */
export function edgesDecayed(state: RecruitingState): void {
  const ix = edgeIndex(state);
  ix.epoch += 1;
  ix.version.clear();
}

/** Record a new edge in the table. Called by `bumpEdge` right after it stores the edge in the state. */
export function noteEdge(state: RecruitingState, e: Edge): void {
  putEdge(edgeIndex(state), e);
}

interface TieIndex { obj: RecruitingState['ties']; byProspect: Map<number, { list: SchoolTie[]; byTeam: Map<number, SchoolTie> }> }
const TIES = new WeakMap<RecruitingState, TieIndex>();

function tieIndex(state: RecruitingState): TieIndex {
  let ix = TIES.get(state);
  if (!ix || ix.obj !== state.ties) {
    ix = { obj: state.ties, byProspect: new Map() };
    // In the order the schools first touched each prospect (`state.tieTeams`), as `tiesOfProspect` promises.
    for (const k in state.tieTeams) {
      const prospectId = Number(k);
      for (const teamId of state.tieTeams[k]!) {
        const t = state.ties[`${prospectId}:${teamId}`];
        if (t) putTie(ix, t);
      }
    }
    TIES.set(state, ix);
  }
  return ix;
}

function putTie(ix: TieIndex, t: SchoolTie): void {
  let row = ix.byProspect.get(t.prospectId);
  if (!row) { row = { list: [], byTeam: new Map() }; ix.byProspect.set(t.prospectId, row); }
  row.list.push(t);
  row.byTeam.set(t.teamId, t);
}

const NO_TIES: readonly SchoolTie[] = [];

export function findTie(state: RecruitingState, prospectId: number, teamId: number): SchoolTie | undefined {
  return tieIndex(state).byProspect.get(prospectId)?.byTeam.get(teamId);
}

/** Every school tie of one prospect, in the order the schools first touched him. Do not change the list. */
export function tiesOf(state: RecruitingState, prospectId: number): readonly SchoolTie[] {
  return tieIndex(state).byProspect.get(prospectId)?.list ?? NO_TIES;
}

/** Record a new tie in the table. Called by `tieOf` right after it stores the tie in the state. */
export function noteTie(state: RecruitingState, t: SchoolTie): void {
  putTie(tieIndex(state), t);
}

function classIndex(state: RecruitingState): ClassIndex {
  let ix = CLASSES.get(state);
  if (!ix || ix.obj !== state.prospects) {
    ix = { obj: state.prospects, byClass: new Map() };
    // Integer keys are visited in rising order, so each class list is in person-id order.
    for (const k in state.prospects) {
      const p = state.prospects[k]!;
      let a = ix.byClass.get(p.classYear);
      if (!a) { a = []; ix.byClass.set(p.classYear, a); }
      a.push(p);
    }
    CLASSES.set(state, ix);
  }
  return ix;
}

const NO_PROSPECTS: readonly Prospect[] = [];

/** The prospects of one class, in person-id order. */
export function prospectsOfClass(state: RecruitingState, classYear: number): readonly Prospect[] {
  return classIndex(state).byClass.get(classYear) ?? NO_PROSPECTS;
}

/** Forget the class table. Called by every writer of `state.prospects`. */
export function prospectsChanged(state: RecruitingState): void {
  CLASSES.delete(state);
}

/**
 * Who each school holds (committed, signed or enrolled) in one class, by position. Built once for a week and
 * read by every AI program in it; a program that drops a player updates its own row through `released`.
 */
export interface HeldIndex {
  readonly classYear: number;
  of(teamId: number, position: PositionGroup): readonly Prospect[];
}

export function heldIndex(state: RecruitingState, classYear: number): HeldIndex {
  const by = new Map<number, Map<PositionGroup, Prospect[]>>();
  for (const p of prospectsOfClass(state, classYear)) {
    const st = state.status[p.personId]!;
    if (st.teamId === null || !(st.status === 'committed' || st.status === 'signed' || st.status === 'enrolled')) continue;
    let rows = by.get(st.teamId);
    if (!rows) { rows = new Map(); by.set(st.teamId, rows); }
    let row = rows.get(p.position);
    if (!row) { row = []; rows.set(p.position, row); }
    row.push(p);
  }
  return { classYear, of: (teamId, position) => by.get(teamId)?.get(position) ?? NO_PROSPECTS };
}
