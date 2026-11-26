// Event types this engine emits (X5.1.1, X5.2.3, X5.2.4 outputs), as X2.1.2 type files. The event log
// helpers (G-22) register them; every emit goes through the schema's one protection check, `mayReceiveEvent`.
import type { EventTypeDef } from '@gm/schema';

const t = (id: string, family: EventTypeDef['family'], witnessRule: EventTypeDef['witnessRule'], harmClass: EventTypeDef['harmClass'], importedAllowed: boolean, consumers: string[], payload: EventTypeDef['payloadSchema'] = {}): EventTypeDef => ({
  id, family, payloadSchema: payload, witnessRule, lineTemplate: `people.needs.${id}`, harmClass, importedAllowed, minTier: 3, consumers, compactable: false,
});

export const NEEDS_EVENT_TYPES: readonly EventTypeDef[] = [
  t('career_stage_changed', 'career', 'none', 'none', true, ['people.needs', 'X1.1.4'], { from: 'string', to: 'string' }),
  // Family relationship; the person is the only witness; visible to others only through behaviour (X5.2.3 rule 5).
  t('stress_band_changed', 'relationship', 'people', 'none', true, ['people.needs', 'X5.4.1'], { from: 'string', to: 'string' }),
  t('meeting_requested', 'relationship', 'team', 'none', true, ['L1', 'L4'], { need: 'string' }),
  t('trade_requested', 'roster', 'team', 'professional_negative', true, ['M5', 'L7'], { need: 'string', finalStraw: 'string' }),
  t('portal_entry', 'roster', 'public', 'professional_negative', true, ['T6'], { need: 'string', finalStraw: 'string' }),
  t('holdout_started', 'roster', 'public', 'professional_negative', false, ['L7', 'C6'], { need: 'string', finalStraw: 'string' }),
  t('effort_dropped', 'discipline', 'room', 'personal', false, ['H3', 'L3'], { need: 'string', finalStraw: 'string' }),
  t('resigned', 'career', 'public', 'professional_negative', false, ['L4', 'K7'], { need: 'string', finalStraw: 'string' }),
  t('job_search_started', 'career', 'team', 'none', true, ['K7', 'E2'], { need: 'string', finalStraw: 'string' }),
  t('coping_started', 'personal', 'room', 'personal', false, ['X5.4.1', 'L1', 'L3'], { coping: 'string' }),
  t('coping_stopped', 'personal', 'room', 'personal', false, ['X5.4.1', 'L1', 'L3'], { coping: 'string' }),
];

/** An event this module wants written. G-22 turns it into a `WorldEvent` row. */
export interface NeedsEvent {
  readonly type: string;
  readonly personId: number;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export function eventType(id: string): EventTypeDef | undefined {
  return NEEDS_EVENT_TYPES.find((e) => e.id === id);
}
