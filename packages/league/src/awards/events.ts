// Honour event types (X2.1.2 rows for C9) and their drafts. Every award, selection, record and hall step
// is an event in the log; nothing here keeps a second copy of history (C9 "What this category covers").
// Football honours land on everyone, imported people included (harm class none, X2.1.2 rule 3).
import { EventTypeDef, type WitnessRule, type WorldDate, type WorldEvent, type WorldTier } from '@gm/schema';
import typesJson from './events.json' with { type: 'json' };

export const HONOUR = {
  weekly: 'weekly_honour',
  award: 'season_award',
  allLeague: 'all_league_selection',
  allStar: 'all_star_selection',
  record: 'record_set',
  milestone: 'career_milestone',
  nominated: 'hall_nominated',
  finalist: 'hall_finalist',
  elected: 'hall_elected',
  passedOver: 'hall_passed_over',
} as const;
export type HonourType = (typeof HONOUR)[keyof typeof HONOUR];


/** Content rows for the event-type table (X2.1.2), validated by the contract's own schema. */
export const HONOUR_EVENT_TYPES: readonly EventTypeDef[] = typesJson.types.map((t) => EventTypeDef.parse(t));

/** A row ready for the log's one emit path (G-22 `EventLog.emit` takes the same fields). */
export type HonourDraft = Omit<WorldEvent, 'id' | 'notability'>;

export interface DraftMeta {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly teamId: number | null;
  readonly tier: WorldTier;
  readonly source: WorldEvent['source'];
}

const PUBLIC: WitnessRule = { kind: 'public' };

export function honourDraft(
  type: HonourType, meta: DraftMeta, personId: number, role: string,
  payload: Readonly<Record<string, string | number | boolean | null>>, subjects: WorldEvent['subjects'] = [],
): HonourDraft {
  return {
    type,
    when: { date: meta.date, period: null, clockTenths: null },
    competitionId: meta.competitionId,
    where: { teamId: meta.teamId, venueId: null },
    actors: [{ personId, role }],
    subjects: [{ kind: 'person', id: personId }, ...subjects],
    payload: { ...payload },
    witnesses: PUBLIC,
    causeId: null,
    tier: meta.tier,
    source: meta.source,
  };
}
