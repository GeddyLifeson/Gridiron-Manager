// X12.2.1 news routing bound to the live world: the weekly `news` step. It reads the log rows written since
// its last pass (every step before it in the week, and the season point before that), and routes them with
// league.news, which owns every rule and number:
//   - public rows become news items (C10.3.1: at or above the news floor, or always for head coach and
//     coordinator changes), roster rows go on the transactions wire (C10.1.1), and rows at or above the
//     national line reach the other level through national media (X12.2.1 rule 1);
//   - rows that are not public travel from their witnesses along warm edges, one hop a week, with a pass
//     chance from edge strength and the passer's candor and discipline (rules 2 to 4).
// Public reach is a rule, not a record: "everyone at its level, at once" is read from the event when asked
// (`heardPublic`), so the world never writes one delivery per person per public event. What the world keeps:
// the items and the person-to-person deliveries of the last seasons, and one tally per season for ever.
// Nothing here writes to the log or changes the world outside its own `systemState` slot.
import { calendar, news } from '@gm/league';
import type { EventTypeDef, NewsItem, RandomStream, RelationshipEdge, WorldEvent } from '@gm/schema';
import type { LiveWorld, StepDigest, StepHandler } from '../loop/types.ts';
import { param } from './params.ts';

/** `LiveWorld.systemState` key of the routing state. */
export const NEWS_KEY = 'news';
/** J13 stream names (the loop adds step, season and week to the scope). */
export const STREAM_SPREAD = 'news.spread';
export const STREAM_WIRE = 'news.wire';

export const HEAD_COACH = 'pos:head_coach';
const COORDINATOR_SUFFIX = '_coordinator';
/** Middle of the 0 to 100 facet scale (X1.1.2). */
const FACET_MIDDLE = 50;

/** One season's routing, kept for every season of the run. */
export interface NewsTally {
  readonly seasonYear: number;
  /** Log rows read. */
  events: number;
  /** Public rows among them. */
  public: number;
  /** News items made (C10.3.1). */
  items: number;
  /** Items made only because the kind is always news (head coach and coordinator changes). */
  always: number;
  /** Public rows at or above the national line (X12.2.1 rule 1, X4.3.1): heard at the other level too. */
  national: number;
  /** Transactions wire items (C10.1.1), and those whose money was misreported. */
  wire: number;
  moneyMisreported: number;
  /** Rows that are not public, those with at least one witness, and those that reached anyone past the witnesses. */
  private: number;
  witnessed: number;
  travelled: number;
  /** Person-to-person deliveries (hops 1 and up), and the degraded ones among them. */
  delivered: number;
  degraded: number;
  /** Public rows not made into items, by reason (league.news SkipReason; `not_public` is counted in `private`). */
  belowFloor: number;
  protected: number;
  unknownType: number;
}

/** The routing state as the world holds it. Plain data, folded into the world hash. */
export interface NewsState {
  readonly v: 1;
  /** The next log id to read. Compaction keeps ids (it folds old rows only), so the cursor survives it. */
  cursor: number;
  nextItemId: number;
  /** Items of the kept seasons, oldest first. */
  items: NewsItem[];
  /** Person-to-person deliveries of the kept seasons (X6.1.1 reads them for second-hand rows), in routing order. */
  deliveries: news.DeliveryRecord[];
  /** One row per season routed, oldest first. */
  tallies: NewsTally[];
}

export function emptyNews(): NewsState {
  return { v: 1, cursor: 1, nextItemId: 1, items: [], deliveries: [], tallies: [] };
}

export function newsOf(world: LiveWorld): NewsState {
  return (world.systemState.get(NEWS_KEY) as NewsState | undefined) ?? emptyNews();
}

export function setNews(world: LiveWorld, state: NewsState): void {
  world.systemState.set(NEWS_KEY, state);
}

export interface NewsBinding {
  /**
   * X7 edges the routing reads. Unbound until the edges step keeps them in the world: with no edges, people
   * hear public news only (X12.2.1 edge case), and nothing that is not public travels.
   */
  readonly edges?: (world: LiveWorld) => readonly RelationshipEdge[];
  /** C10.3.1 rule 1 kinds that are always news. Defaults to `isCoachChange`. */
  readonly alwaysNews?: (world: LiveWorld, e: WorldEvent, def: EventTypeDef) => boolean;
  /** League rules for the wire deadline (C10.1.1, key news.transaction_deadline_minute); the param when absent. */
  readonly rules?: news.NewsRuleLookup;
}

/** The seat an event is about: `seatId` in the payload, else a job subject. */
function seatOf(e: WorldEvent): number | undefined {
  const s = e.payload.seatId;
  if (typeof s === 'number') return s;
  return e.subjects.find((x) => x.kind === 'job')?.id;
}

/**
 * C10.3.1 rule 1: a career row about a head coach or coordinator seat (hired, fired, promoted, interim,
 * released) is always news, whatever its notability.
 */
export function isCoachChange(world: LiveWorld, e: WorldEvent, def: EventTypeDef): boolean {
  if (def.family !== 'career') return false;
  const seat = seatOf(e);
  if (seat === undefined) return false;
  const pos = world.jobs.get(seat)?.positionId ?? world.offLadder.get(seat)?.positionId;
  return pos !== undefined && (pos === HEAD_COACH || pos.endsWith(COORDINATOR_SUFFIX));
}

/** Everyone who works for a team: its roster, its staff seats and its off-ladder seats. */
function teamMembers(world: LiveWorld): (teamId: number) => readonly number[] {
  let byTeam: Map<number, number[]> | null = null;
  return (teamId) => {
    if (!byTeam) {
      byTeam = new Map();
      const add = (t: number, p: number): void => { const l = byTeam!.get(t); if (l) l.push(p); else byTeam!.set(t, [p]); };
      for (const [t, ids] of world.rosters) for (const p of ids) add(t, p);
      for (const j of world.jobs.values()) if (j.teamId !== null && j.holderPersonId !== null) add(j.teamId, j.holderPersonId);
      for (const s of world.offLadder.values()) if (s.holderPersonId !== null) add(s.teamId, s.holderPersonId);
    }
    return byTeam.get(teamId) ?? [];
  };
}

function involved(e: WorldEvent): number[] {
  return [...e.actors.map((a) => a.personId), ...e.subjects.filter((s) => s.kind === 'person').map((s) => s.id)];
}

/**
 * Who saw a row that is not public, sorted and once each (X12.2.1 rule 2 "from a witness"): the named
 * people; for a team row the team's people and anyone the row names; for a room row the people the row
 * names (the world keeps no room lists; Assumption, README). A `none` row has no witness and never travels.
 */
export function witnessesOf(world: LiveWorld, e: WorldEvent, members: (teamId: number) => readonly number[] = teamMembers(world)): number[] {
  const w = e.witnesses;
  let ids: number[];
  switch (w.kind) {
    case 'public': case 'none': return [];
    case 'people': ids = [...w.personIds]; break;
    case 'team': ids = [...members(w.teamId), ...involved(e)]; break;
    case 'room': ids = involved(e); break;
  }
  return [...new Set(ids)].filter((p) => world.status.get(p) !== 'deceased').sort((a, b) => a - b);
}

/** X12.2.1 rule 1 at read time: whether a person at a competition has heard a public event, and how. */
export function heardPublic(e: WorldEvent, competitionId: number | null): news.Channel | null {
  if (e.witnesses.kind !== 'public') return null;
  if (e.competitionId === null || competitionId === e.competitionId) return 'official';
  return (e.notability ?? 0) >= news.param('crossLevelNotability') ? 'media' : null;
}

/** Warm person-to-person edges by end, once per pass. */
function warmAdjacency(edges: readonly RelationshipEdge[]): Map<number, RelationshipEdge[]> {
  const m = new Map<number, RelationshipEdge[]>();
  const add = (p: number, e: RelationshipEdge): void => { const l = m.get(p); if (l) l.push(e); else m.set(p, [e]); };
  for (const e of edges) {
    if (e.sign !== 'warm' || e.b === null) continue;
    add(e.a, e);
    add(e.b, e);
  }
  return m;
}

/**
 * The warm edges a spread from these witnesses can cross in `maxHops` hops: only those leave a node fewer
 * than `maxHops` hops out. Passing these instead of every edge in the world gives the same draws (the
 * spread visits neighbours in id order) at a cost that follows the reach, not the world.
 */
function reachableEdges(adj: ReadonlyMap<number, readonly RelationshipEdge[]>, witnesses: readonly number[]): RelationshipEdge[] {
  const maxHops = news.param('maxHops');
  const dist = new Map<number, number>(witnesses.map((w) => [w, 0]));
  const out = new Set<RelationshipEdge>();
  let frontier = [...witnesses];
  for (let d = 0; d < maxHops && frontier.length > 0; d++) {
    const next: number[] = [];
    for (const p of frontier) {
      for (const e of adj.get(p) ?? []) {
        out.add(e);
        const o = e.a === p ? e.b! : e.a;
        if (!dist.has(o)) { dist.set(o, d + 1); next.push(o); }
      }
    }
    frontier = next;
  }
  return [...out];
}

function tallyFor(st: NewsState, seasonYear: number): NewsTally {
  const last = st.tallies[st.tallies.length - 1];
  if (last && last.seasonYear === seasonYear) return last;
  const t: NewsTally = {
    seasonYear, events: 0, public: 0, items: 0, always: 0, national: 0, wire: 0, moneyMisreported: 0,
    private: 0, witnessed: 0, travelled: 0, delivered: 0, degraded: 0, belowFloor: 0, protected: 0, unknownType: 0,
  };
  st.tallies.push(t);
  return t;
}

/** Log rows from the cursor to the end of the log, in order (ids are dense except where compaction folded rows). */
function newRows(world: LiveWorld, cursor: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (let id = cursor; id < world.log.nextId; id++) {
    const e = world.log.get(id);
    if (e) out.push(e);
  }
  return out;
}

/** Route one batch of rows into the state. The step and the tests call this; the step only adds the cursor. */
export function routeRows(world: LiveWorld, st: NewsState, rows: readonly WorldEvent[], b: NewsBinding, streams: { readonly spread: RandomStream; readonly wire: RandomStream }): StepDigest {
  const reg = world.logOptions.registry;
  const types = new Map<string, EventTypeDef>();
  for (const id of reg.ids()) types.set(id, reg.get(id)!);
  const always = b.alwaysNews ?? isCoachChange;
  const before = { items: st.items.length, deliveries: st.deliveries.length };
  let alwaysCount = 0;

  // Tallies go to the season of each row, so the season point's rows read in the first week of the next
  // season still count for the season they happened in.
  const built = news.newsFromEvents(rows, {
    types, firstId: st.nextItemId,
    alwaysNews: (e, def) => { const a = always(world, e, def); if (a && (e.notability ?? 0) < news.param('newsNotabilityFloor')) alwaysCount++; return a; },
    originOf: (id) => world.people.get(id)?.origin,
  });
  st.nextItemId += built.items.length;
  st.items.push(...built.items);
  for (const it of built.items) tallyFor(st, it.date.seasonYear).items++;
  for (const s of built.skipped) {
    const e = world.log.get(s.eventId);
    const t = tallyFor(st, e ? e.when.date.seasonYear : world.date.seasonYear);
    if (s.reason === 'below_floor') t.belowFloor++;
    else if (s.reason === 'protected') t.protected++;
    else if (s.reason === 'unknown_type') t.unknownType++;
  }

  const dayOf = (e: WorldEvent): number => calendar.fromWorldDate(e.when.date);
  const wire = news.wireFromEvents(rows, { types, dayOf, rules: b.rules, stream: streams.wire });
  for (const w of wire) {
    const t = tallyFor(st, world.log.get(w.eventId)!.when.date.seasonYear);
    t.wire++;
    if (w.money?.misreported) t.moneyMisreported++;
  }

  const edges = b.edges?.(world) ?? [];
  const adj = edges.length > 0 ? warmAdjacency(edges) : null;
  const members = teamMembers(world);
  const facets: news.PasserFacets = (id) => {
    const p = world.people.get(id);
    if (!p || world.status.get(id) === 'deceased') return undefined;
    // A facet the record lacks reads as the population middle (X1.2.1), as the compliance binding reads it.
    return { candor: p.traitBlock.facets.candor ?? FACET_MIDDLE, discipline: p.traitBlock.facets.discipline ?? FACET_MIDDLE };
  };
  for (const e of rows) {
    const t = tallyFor(st, e.when.date.seasonYear);
    t.events++;
    if (e.witnesses.kind === 'public') {
      t.public++;
      if ((e.notability ?? 0) >= news.param('crossLevelNotability')) t.national++;
      continue;
    }
    t.private++;
    const witnesses = witnessesOf(world, e, members);
    if (witnesses.length === 0) continue;
    t.witnessed++;
    if (!adj) continue;
    const reach = reachableEdges(adj, witnesses);
    if (reach.length === 0) continue;
    const ds = news.spreadNonPublic(e, dayOf(e), witnesses, reach, facets, streams.spread);
    if (ds.length === 0) continue;
    t.travelled++;
    t.delivered += ds.length;
    for (const d of ds) if (d.accuracy === 'degraded') t.degraded++;
    st.deliveries.push(...ds);
  }
  tallyFor(st, world.date.seasonYear).always += alwaysCount;
  return {
    read: rows.length, items: st.items.length - before.items, always: alwaysCount, wire: wire.length,
    delivered: st.deliveries.length - before.deliveries,
  };
}

/** Drop items and deliveries older than the kept seasons. Tallies stay. */
export function pruneNews(st: NewsState, seasonYear: number): void {
  const oldest = seasonYear - param('keepSeasons');
  if (st.items.length > 0 && st.items[0]!.date.seasonYear < oldest) st.items = st.items.filter((i) => i.date.seasonYear >= oldest);
  if (st.deliveries.length > 0) {
    const firstDay = calendar.yearStart(oldest);
    if (st.deliveries.some((d) => d.day < firstDay)) st.deliveries = st.deliveries.filter((d) => d.day >= firstDay);
  }
}

/**
 * The weekly news step (X12.2.1). Runs last in the week (WEEKLY_ORDER), so it sees every row the week wrote,
 * labels included; the season point's rows are read by the first pass of the next season.
 */
export function newsStep(b: NewsBinding = {}): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const prev = newsOf(world);
    const st: NewsState = { ...prev, items: prev.items, deliveries: prev.deliveries, tallies: prev.tallies };
    const rows = newRows(world, st.cursor);
    const digest = routeRows(world, st, rows, b, { spread: ctx.open(STREAM_SPREAD), wire: ctx.open(STREAM_WIRE) });
    st.cursor = world.log.nextId;
    pruneNews(st, world.date.seasonYear);
    setNews(world, st);
    return { ...digest, cursor: st.cursor, kept: st.items.length, keptDeliveries: st.deliveries.length };
  };
}

/** Deliveries a person has had, oldest first (X6.1.1 second-hand rows; X3.1.3 visibility). Kept seasons only. */
export function deliveriesTo(world: LiveWorld, personId: number): news.DeliveryRecord[] {
  return newsOf(world).deliveries.filter((d) => d.to === personId);
}
