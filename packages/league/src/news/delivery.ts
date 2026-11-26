// How news reaches people (X12.2.1, C10.7.1): three channels, official, people you know, and media.
// Public events reach everyone in their competition at once, and other competitions through national
// media at X4 score 60 or more. Non-public events travel along warm edges from a witness, one hop per
// week, with a pass chance from edge strength and the passer's candor and discipline, and each hop may
// lose a detail. A contact with access may tip a coming public event early, sometimes wrongly. AI people
// receive news by the same rules. Nothing here changes the world or reveals truth data; a delivery is a
// record of who heard what, when, from whom, and how accurately.
import { FACET_MAX, type RandomStream, type RelationshipEdge, type WorldEvent } from '@gm/schema';
import { MINUTES_PER_DAY } from '../calendar/date.ts';
import { param } from './params.ts';

export type Channel = 'official' | 'person' | 'media';

/** X12.2.1 outputs: one delivery record. `eventId` is null for media speculation (X12.2.2). */
export interface DeliveryRecord {
  readonly eventId: number | null;
  readonly to: number;
  readonly via: Channel;
  /** The person who passed it on (channel person), else null. */
  readonly viaPersonId: number | null;
  /** Outlet id for the media channel, else null. */
  readonly outletId: number | null;
  readonly day: number;
  readonly minute: number;
  readonly accuracy: 'exact' | 'degraded';
  /** Hops from the witness (0 for official and media). */
  readonly hops: number;
}

export interface Recipient { readonly personId: number; readonly competitionId: number | null }

/**
 * X12.2.1 rule 1: a public event reaches every recipient in its competition at once (official channel),
 * and recipients elsewhere through national media when its notability is at or above the line.
 */
export function publicDeliveries(e: WorldEvent, day: number, minute: number, recipients: readonly Recipient[], nationalOutletId: number | null = null): DeliveryRecord[] {
  if (e.witnesses.kind !== 'public') return [];
  const national = (e.notability ?? 0) >= param('crossLevelNotability');
  const out: DeliveryRecord[] = [];
  for (const r of recipients) {
    const same = e.competitionId === null || r.competitionId === e.competitionId;
    if (same) out.push({ eventId: e.id, to: r.personId, via: 'official', viaPersonId: null, outletId: null, day, minute, accuracy: 'exact', hops: 0 });
    else if (national) out.push({ eventId: e.id, to: r.personId, via: 'media', viaPersonId: null, outletId: nationalOutletId, day, minute, accuracy: 'exact', hops: 0 });
  }
  return out;
}

/** The two facets a passer's willingness reads (X1 candor and discipline, 0 to 100). Truth, read only here. */
export type PasserFacets = (personId: number) => { readonly candor: number; readonly discipline: number } | undefined;

/** X12.2.1 rule 2 pass chance across one warm edge (Assumption form, see params). */
export function passChance(strength: number, candor: number, discipline: number): number {
  const s = strength / param('edgeStrengthMax');
  const floor = param('passCandorFloor');
  const c = floor + (1 - floor) * (candor / FACET_MAX);
  const d = 1 - param('passDisciplineWeight') * (discipline / FACET_MAX);
  return Math.max(0, Math.min(1, s * c * d));
}

function warmNeighbours(edges: readonly RelationshipEdge[]): Map<number, { to: number; strength: number }[]> {
  const m = new Map<number, { to: number; strength: number }[]>();
  const add = (a: number, b: number, s: number) => { if (!m.has(a)) m.set(a, []); m.get(a)!.push({ to: b, strength: s }); };
  for (const e of edges) {
    if (e.sign !== 'warm' || e.b === null) continue;
    add(e.a, e.b, e.strength);
    add(e.b, e.a, e.strength);
  }
  for (const list of m.values()) list.sort((x, y) => x.to - y.to);
  return m;
}

/**
 * X12.2.1 rules 2 to 4: spread one non-public event from its witnesses along warm edges, one hop per
 * `hopDelayDays`, for at most `maxHops` hops. Each person hears it once (the earliest). A passer tries
 * each warm neighbour once, in id order, so the draws are fixed for a given world (J13). A degraded item
 * stays degraded down the chain.
 */
export function spreadNonPublic(
  e: WorldEvent, startDay: number, witnesses: readonly number[], edges: readonly RelationshipEdge[],
  facets: PasserFacets, s: RandomStream,
): DeliveryRecord[] {
  if (e.witnesses.kind === 'public') return [];
  const nb = warmNeighbours(edges);
  const heard = new Map<number, DeliveryRecord>();
  for (const w of witnesses) heard.set(w, { eventId: e.id, to: w, via: 'person', viaPersonId: null, outletId: null, day: startDay, minute: 0, accuracy: 'exact', hops: 0 });
  let frontier = [...witnesses].sort((a, b) => a - b);
  const out: DeliveryRecord[] = [];
  for (let hop = 1; hop <= param('maxHops') && frontier.length > 0; hop++) {
    const next: number[] = [];
    for (const passer of frontier) {
      const f = facets(passer);
      if (!f) continue;
      const from = heard.get(passer)!;
      for (const { to, strength } of nb.get(passer) ?? []) {
        if (heard.has(to)) continue;
        if (!s.chance(passChance(strength, f.candor, f.discipline))) continue;
        const degraded = from.accuracy === 'degraded' || s.chance(param('hopDegradeChance'));
        const d: DeliveryRecord = { eventId: e.id, to, via: 'person', viaPersonId: passer, outletId: null, day: startDay + hop * param('hopDelayDays'), minute: 0, accuracy: degraded ? 'degraded' : 'exact', hops: hop };
        heard.set(to, d);
        out.push(d);
        next.push(to);
      }
    }
    frontier = next.sort((a, b) => a - b);
  }
  return out;
}

/** A contact who may tip a coming public event early (C10.7.1 rule 2). */
export interface Contact {
  readonly personId: number;
  /** Whether his job lets him know of this event before it is public. */
  readonly hasAccess: boolean;
  /** His own risk in passing it on, 0 to 1 (L6, his club's rules). */
  readonly risk: number;
}

/**
 * C10.7.1 rule 2: for one recipient, each warm contact with access may pass a coming public event ahead
 * of its public time with a chance that rises with edge strength and falls with his own risk; the lead is
 * hours to 2 days and the tip is wrong at the starting error rate. Returns at most one delivery (the
 * earliest tip); none when nobody passes it.
 */
export function contactTip(
  e: WorldEvent, publicDay: number, publicMinute: number, to: number, contacts: readonly Contact[],
  edges: readonly RelationshipEdge[], s: RandomStream,
): DeliveryRecord | null {
  const strength = new Map<number, number>();
  for (const ed of edges) {
    if (ed.sign !== 'warm' || ed.b === null) continue;
    if (ed.a === to) strength.set(ed.b, Math.max(strength.get(ed.b) ?? 0, ed.strength));
    if (ed.b === to) strength.set(ed.a, Math.max(strength.get(ed.a) ?? 0, ed.strength));
  }
  let best: DeliveryRecord | null = null;
  const pubAt = publicDay * MINUTES_PER_DAY + publicMinute;
  for (const c of [...contacts].sort((a, b) => a.personId - b.personId)) {
    const st = strength.get(c.personId);
    if (!c.hasAccess || st === undefined) continue;
    const p = (st / param('edgeStrengthMax')) * (1 - param('contactRiskWeight') * Math.max(0, Math.min(1, c.risk)));
    if (!s.chance(p)) continue;
    const lead = s.int(param('contactLeadMinMinutes'), param('contactLeadMaxMinutes'));
    const wrong = s.chance(param('contactErrorChance'));
    const at = pubAt - lead;
    const day = Math.floor(at / MINUTES_PER_DAY);
    const d: DeliveryRecord = { eventId: e.id, to, via: 'person', viaPersonId: c.personId, outletId: null, day, minute: at - day * MINUTES_PER_DAY, accuracy: wrong ? 'degraded' : 'exact', hops: 1 };
    if (!best || at < best.day * MINUTES_PER_DAY + best.minute) best = d;
  }
  return best;
}

/** C10.7.1 acceptance: every delivery names a source (a channel, and a person or outlet where it needs one). */
export function unsourcedDeliveries(ds: readonly DeliveryRecord[]): DeliveryRecord[] {
  return ds.filter((d) => (d.via === 'person' && d.hops > 0 && d.viaPersonId === null) || (d.via === 'media' && d.eventId === null && d.outletId === null));
}
