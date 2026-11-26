// E8.3.3 life events: real moments that ask for the coach's hours in a specific week. Generated from
// the household's facts on a schedule; never a football effect; births, marriage and similar changes
// only when the user says yes to an offer; deaths only of an ageing parent, with notice; nothing for an
// empty household or an imported person.
import tablesJson from './tables.json' with { type: 'json' };
import { param } from './params.ts';
import { drawInt, type LifeRandom } from './realism.ts';
import { ageOf, bump, schoolStage, isEmpty, type Household, type Member } from './household.ts';

export type LifeEventKind = 'school' | 'birthday' | 'anniversary' | 'illness' | 'parentCare' | 'parentDeath' | 'wedding';

export interface LifeEvent {
  readonly kind: LifeEventKind;
  /** The household member it belongs to (acceptance: every event traces to a member and a table row). */
  readonly memberId: number;
  readonly week: number;
  /** Hours asked (for parentCare: hours each week of the period). */
  readonly hours: number;
  readonly periodWeeks: number;
  /** 0 to 1: scales the satisfaction change between the table's min and max (E8.3.2 rule 2). */
  readonly weight: number;
  /** Days of notice before the week (the inbox item arrives this many days ahead). */
  readonly noticeDays: number;
  readonly inSeason: boolean;
}

interface EventRow {
  readonly kind: LifeEventKind; readonly hoursMin: number; readonly hoursMax: number; readonly weight: number;
  readonly who: 'schoolChild' | 'member' | 'partner' | 'child' | 'parent' | 'grownChild';
  readonly perYearMin?: number; readonly perYearMax?: number; readonly chancePerYear?: string;
  readonly periodWeeks?: number; readonly once?: boolean;
}

export const EVENT_ROWS: readonly EventRow[] = tablesJson.events as readonly EventRow[];

export interface YearCalendar {
  readonly year: number;
  /** Absolute week index of the year's first week. */
  readonly firstWeek: number;
  readonly weeks: number;
  /** Week offsets (0-based within the year) that are in season. */
  readonly inSeasonOffsets: readonly number[];
}

function eligible(row: EventRow, m: Member, year: number, h: Household): boolean {
  const a = ageOf(m, year);
  switch (row.who) {
    case 'schoolChild': return m.role === 'child' && (schoolStage(a) === 'primary' || schoolStage(a) === 'secondary');
    case 'member': return true;
    case 'partner': return m.role === 'partner' && !h.separated;
    case 'child': return m.role === 'child' && schoolStage(a) !== 'grown';
    case 'grownChild': return m.role === 'child' && schoolStage(a) === 'grown';
    case 'parent':
      if (m.role !== 'parent') return false;
      return row.kind === 'parentDeath' ? a >= param('parentDeathAge') : a >= param('parentCareAge');
  }
}

/** Pick a week: at least the in-season share fall in season (rule 2). Two uniforms per event. */
function pickWeek(cal: YearCalendar, rng: LifeRandom): { offset: number; inSeason: boolean } {
  const inSet = new Set(cal.inSeasonOffsets);
  const off = Array.from({ length: cal.weeks }, (_, i) => i).filter((i) => !inSet.has(i));
  const share = Math.max(param('eventInSeasonShare'), cal.inSeasonOffsets.length / cal.weeks);
  const u = rng.uniform();
  const pool = (u < share && cal.inSeasonOffsets.length > 0) || off.length === 0 ? cal.inSeasonOffsets : off;
  const offset = pool[drawInt(rng, 0, pool.length - 1)]!;
  return { offset, inSeason: inSet.has(offset) };
}

/** Events for one calendar year. Members are visited in id order and rows in table order, so the draw
 *  sequence depends only on the household facts. `pastOnce` lists "once" kinds already used, by member. */
export function generateYearEvents(h: Household, cal: YearCalendar, rng: LifeRandom, pastOnce: ReadonlySet<string> = new Set()): LifeEvent[] {
  if (isEmpty(h) || h.separated) return [];
  const out: LifeEvent[] = [];
  const members = [...h.members].sort((a, b) => a.id - b.id);
  for (const m of members) {
    for (const row of EVENT_ROWS) {
      if (!eligible(row, m, cal.year, h)) continue;
      if (row.once && pastOnce.has(`${row.kind}:${m.id}`)) continue;
      let n: number;
      if (row.chancePerYear) n = rng.uniform() < param(row.chancePerYear) ? 1 : 0;
      else n = drawInt(rng, row.perYearMin ?? 1, row.perYearMax ?? 1);
      for (let k = 0; k < n; k++) {
        const { offset, inSeason } = pickWeek(cal, rng);
        out.push({
          kind: row.kind, memberId: m.id, week: cal.firstWeek + offset,
          hours: drawInt(rng, row.hoursMin, row.hoursMax), periodWeeks: row.periodWeeks ?? 1, weight: row.weight,
          noticeDays: drawInt(rng, param('eventNoticeDaysMin'), param('eventNoticeDaysMax')), inSeason,
        });
      }
    }
  }
  return out.sort((a, b) => a.week - b.week || a.memberId - b.memberId);
}

export type EventChoice = 'attend' | 'part' | 'miss';

/** E8.3.2 rule 2: attended +2 to +5, missed -3 to -8 by weight; part is an assumption between them. */
export function eventSatisfactionChange(e: LifeEvent, choice: EventChoice): number {
  const gain = param('eventAttendGain.min') + e.weight * (param('eventAttendGain.max') - param('eventAttendGain.min'));
  const loss = param('eventMissLoss.min') + e.weight * (param('eventMissLoss.max') - param('eventMissLoss.min'));
  if (choice === 'attend') return gain;
  if (choice === 'miss') return -loss;
  const s = param('partPresenceShare');
  return s * gain - (1 - s) * loss;
}

/** Home hours the choice blocks in the event's week (an `Event` block on the H1 week). */
export function eventHomeHours(e: LifeEvent, choice: EventChoice): number {
  if (choice === 'miss') return 0;
  return choice === 'attend' ? e.hours : e.hours * param('partPresenceShare');
}

export function resolveEvent(h: Household, e: LifeEvent, choice: EventChoice): Household {
  return bump(h, eventSatisfactionChange(e, choice));
}

/** Offers that change the shape of the family (rule 4). Nothing happens unless the user accepts. */
export type FamilyOffer = 'meetPartner' | 'marriage' | 'haveChild';

export interface FamilyOfferResult { readonly household: Household; readonly blockedHours: number }

/** Apply an accepted offer. A new child or partner joins as a member; a birth blocks 24 to 72 h. */
export function acceptOffer(h: Household, offer: FamilyOffer, newMember: Member | null, rng: LifeRandom): FamilyOfferResult {
  if (offer === 'haveChild') {
    if (!newMember || newMember.role !== 'child') throw new Error('life: a birth needs the new child');
    return { household: { ...h, members: [...h.members, newMember] }, blockedHours: drawInt(rng, param('birthHoursMin'), param('birthHoursMax')) };
  }
  if (offer === 'meetPartner') {
    if (!newMember || newMember.role !== 'partner') throw new Error('life: meeting a partner needs the partner');
    return { household: { ...h, members: [...h.members, newMember], separated: false }, blockedHours: 0 };
  }
  return { household: h, blockedHours: param('weddingOfCoachHours') };
}
