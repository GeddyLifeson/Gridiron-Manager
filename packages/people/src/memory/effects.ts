// What memory does later: rare permanent facet change (X6.3.1) and impressions in later dealings (X6.4.1),
// with the protected-person limits (X6.5.1, X14.1.2).
import type { EventTypeDef, PersonOrigin, WorldDate } from '@gm/schema';
import { mp, type Draw } from './params.ts';
import { effectiveStrength, sameSubject, type HeldMemory, type KindTable } from './rows.ts';

/** Content table per event type: which facet a touchstone may move and in which direction (X6.3.1 rule 2). */
export type OutlookTable = Readonly<Record<string, readonly { readonly facet: string; readonly direction: 1 | -1 | 'draw' }[]>>;

/** Starting rows (Assumption): a title may raise composure; a firing may raise or lower risk tolerance. */
export const STARTING_OUTLOOK_TABLE: OutlookTable = {
  title_won: [{ facet: 'composure', direction: 1 }],
  fired: [{ facet: 'risk_tolerance', direction: 'draw' }],
  career_threatening_injury: [{ facet: 'patience', direction: 'draw' }],
};

export interface OutlookChange {
  readonly personId: number;
  readonly facet: string;
  readonly from: number;
  readonly to: number;
  readonly eventId: number;
}

/**
 * X6.3.1: a promoted touchstone (creation strength 90 or more) has a 20 percent chance to move one facet by
 * up to 10 points, at most twice per career. Never for a protected person or the user. Values and goals do
 * not change here. Draw order is fixed: chance, then row, then direction, then size, every time a row qualifies.
 */
export function outlookChange(
  person: { id: number; origin: PersonOrigin; facets: Readonly<Record<string, number>>; outlookChanges: number },
  promoted: HeldMemory,
  eventType: string,
  draw: Draw,
  table: OutlookTable = STARTING_OUTLOOK_TABLE,
): OutlookChange | null {
  if (person.origin === 'user' || person.origin === 'imported') return null;
  if (promoted.layer !== 'permanent' || promoted.strength < mp('memory.outlook.minStrength')) return null;
  if (person.outlookChanges >= mp('memory.outlook.maxPerCareer')) return null;
  const rows = table[eventType];
  if (!rows || rows.length === 0) return null;
  const chance = draw();
  const pick = draw();
  const dir = draw();
  const size = draw();
  if (chance >= mp('memory.outlook.chance')) return null;
  const row = rows[Math.min(rows.length - 1, Math.floor(pick * rows.length))]!;
  const sign = row.direction === 'draw' ? (dir < 0.5 ? -1 : 1) : row.direction;
  const shift = 1 + Math.floor(size * mp('memory.outlook.maxShift'));
  const from = person.facets[row.facet] ?? 50;
  const to = Math.min(100, Math.max(0, from + sign * Math.min(shift, mp('memory.outlook.maxShift'))));
  return { personId: person.id, facet: row.facet, from, to, eventId: promoted.eventId };
}

/** Event type for the audit trail of an outlook change: never shown as a line, never on an imported person. */
export const OUTLOOK_EVENT_TYPE: EventTypeDef = {
  id: 'outlook_changed', family: 'personal', payloadSchema: { facet: 'string', from: 'number', to: 'number' }, witnessRule: 'none',
  lineTemplate: 'people.memory.outlook_changed', harmClass: 'personal', importedAllowed: false, minTier: 3, consumers: ['people.memory', 'X1.3.1'], compactable: false,
};

/** Football categories a protected holder's rows may feed a view with: results and roles (X6.5.1). */
export const FOOTBALL_CATEGORIES: readonly string[] = ['game', 'roster', 'career'];

export interface Impression {
  /** Sum of signed weights; negative is unfavourable. */
  readonly weight: number;
  /** Rows behind it, strongest first, so a talk can cite the event (X6.4.1). */
  readonly evidence: readonly { readonly eventId: number; readonly weight: number }[];
}

/**
 * X6.4.1: one holder's impression of a subject. Each row weighs strength x 0.01 x sign, second-hand rows at
 * half. Rows of one kind stack with repeats giving less (X6.1.3 rule 3). Conflicting rows both feed it: the
 * net is their sum. A protected holder's rows feed it with football categories only. Memory never grants or
 * removes a mechanical ability: consumers decide what the number means.
 */
export function impression(holder: { origin: PersonOrigin }, rows: readonly HeldMemory[], subject: { aboutPersonId: number | null; aboutTeamId: number | null }, kinds: KindTable, now: WorldDate): Impression {
  const about = rows.filter((r) => sameSubject(r, subject) && (holder.origin !== 'imported' || FOOTBALL_CATEGORIES.includes(r.category)));
  const byKind = new Map<string, HeldMemory[]>();
  for (const r of about) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const evidence: { eventId: number; weight: number }[] = [];
  let total = 0;
  for (const list of byKind.values()) {
    const scored = list.map((r) => ({ r, s: effectiveStrength(r, rows, kinds, now) * (r.secondHand ? 0.5 : 1) })).sort((a, b) => b.s - a.s || a.r.eventId - b.r.eventId);
    const k = kinds[list[0]!.kind];
    const factor = k?.stackFactor ?? mp('memory.kind.stackFactor');
    const cap = k?.stackCap ?? mp('memory.kind.stackCap');
    let mult = 1;
    for (const { r, s } of scored.slice(0, cap)) {
      const w = s * mp('memory.impression.perPoint') * r.sign * mult;
      if (w !== 0) evidence.push({ eventId: r.eventId, weight: Math.round(w * 1000) / 1000 });
      total += w;
      mult *= factor;
    }
  }
  evidence.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.eventId - b.eventId);
  return { weight: Math.round(total * 1000) / 1000, evidence };
}
